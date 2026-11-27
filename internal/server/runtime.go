package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/komari-monitor/komari/cmd/flags"
	"github.com/komari-monitor/komari/database"
	"github.com/komari-monitor/komari/database/accounts"
	"github.com/komari-monitor/komari/database/auditlog"
	"github.com/komari-monitor/komari/database/dbcore"
	"github.com/komari-monitor/komari/database/tasks"
	"github.com/komari-monitor/komari/internal/config"
	"github.com/komari-monitor/komari/internal/lifecycle"
	"github.com/komari-monitor/komari/internal/metricstore"
	"github.com/komari-monitor/komari/internal/plugin"
	"github.com/komari-monitor/komari/internal/scheduler"
	"github.com/komari-monitor/komari/utils"
	"github.com/komari-monitor/komari/utils/geoip"
	logger "github.com/komari-monitor/komari/utils/log"
	"github.com/komari-monitor/komari/utils/notifier"
	"github.com/komari-monitor/komari/web/api"
	"github.com/komari-monitor/komari/web/oauth"
	recoveryweb "github.com/komari-monitor/komari/web/recovery"
	"github.com/komari-monitor/komari/web/router"
	"github.com/komari-monitor/komari/web/security"
)

// ErrRestartRequested is returned after a clean shutdown when a configuration
// change requires the next startup to enter a restricted guide.
var ErrRestartRequested = errors.New("server restart requested")

const (
	// Give in-flight HTTP requests time to finish before the listener closes.
	httpShutdownTimeout = 10 * time.Second
	// Keep an independent budget for report flushing and store teardown. Reusing
	// the HTTP deadline here can skip queued metric writes after a slow request.
	resourceCleanupTimeout = 30 * time.Second
)

// StartBackground starts scheduled work after all stores are ready.
func (a *App) StartBackground() error {
	registerScheduledWork()
	a.addCleanup("scheduler", func(context.Context) error {
		scheduler.StopAll()
		return nil
	})
	return nil
}

func (a *App) registerReloadHandlers(cors *security.CorsController) {
	a.reload.Register("oauth-provider", func(event config.ConfigEvent) {
		if ok, providerName := config.IsChangedT[string](event, config.OAuthProviderKey); ok {
			if providerName == "" || providerName == "none" {
				providerName = "github"
			}
			oidcProvider, err := database.GetOidcConfigByName(providerName)
			if err != nil {
				logger.Errorf("server", "Failed to get OIDC provider config: %v", err)
				return
			}
			logger.Infof("server", "Using %s as OIDC provider", oidcProvider.Name)
			if err := oauth.LoadProvider(oidcProvider.Name, oidcProvider.Addition); err != nil {
				auditlog.EventLog("error", fmt.Sprintf("Failed to load OIDC provider: provider=%s, error=%v", oidcProvider.Name, err))
			}
		}
	})
	a.reload.Register("geoip-provider", func(event config.ConfigEvent) {
		if event.IsChanged(config.GeoIpProviderKey) {
			go geoip.InitGeoIp()
		}
	})
	a.reload.Register("cors", func(event config.ConfigEvent) { cors.Update(event) })
}

// BuildRouter constructs the normal application router and starts reloads.
func (a *App) BuildRouter() error {
	r := gin.New()
	r.Use(logger.GinLogger(), logger.GinRecovery())
	cors := security.NewCorsController(a.settings.CorsOriginCheckEnabled, a.settings.CorsAllowedOrigins)
	r.Use(cors.Middleware(), api.IdentityMiddleware(), api.PrivateSiteMiddleware(), noStoreAPIResponses())

	// The recovery UI belongs only to its temporary restricted listener.
	r.GET(recoveryweb.PagePath, func(c *gin.Context) {
		c.Redirect(http.StatusTemporaryRedirect, "/")
	})
	router.Register(r)

	// Plugins are loaded after the router exists so server.route can bind
	// routes; a failed plugin only disables itself and is logged.
	plugin.Init(r)
	if err := plugin.LoadAll(); err != nil {
		logger.ErrorArgs("server", "Failed to load some plugins:", err)
	}
	a.addCleanup("plugins", func(context.Context) error { return plugin.CloseAll() })

	a.registerReloadHandlers(cors)
	a.reload.Start()
	a.engine = r
	return nil
}

// Run starts the normal HTTP server and blocks until shutdown or fatal error.
func (a *App) Run() error {
	// The HTML injector runs outside the hook chain so it sees the final
	// response: plugin hooks can still rewrite the body, then the registered
	// head/body fragments are embedded into every text/html page.
	a.server = &http.Server{Addr: a.listenAddr, Handler: plugin.HTMLInjectHandler(plugin.WrapHandler(a.engine))}
	serverErr := make(chan error, 1)
	logger.Infof("server", "Starting server on %s ...", a.listenAddr)
	go func() {
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErr <- err
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(quit)
	select {
	case err := <-serverErr:
		a.onFatal(err)
		return fmt.Errorf("listen: %w", err)
	case reason := <-lifecycle.RestartRequests():
		logger.Infof("server", "Restarting service for %s", reason)
		if err := a.shutdownWithReason("restart: " + string(reason)); err != nil {
			logger.Errorf("server", "Cleanup before restart failed: %v", err)
		}
		return fmt.Errorf("%w: %s", ErrRestartRequested, reason)
	case <-quit:
		return a.shutdownWithReason("signal")
	}
}

// Shutdown stops HTTP first, then releases registered resources in LIFO order.
func (a *App) Shutdown() error {
	return a.shutdownWithReason("")
}

func (a *App) shutdownWithReason(reason string) error {
	if a.dbReady {
		msg := fmt.Sprintf("Server shutting down: addr=%s", a.listenAddr)
		if reason != "" {
			msg += ", reason=" + reason
		}
		auditlog.Log("", "", msg, "info")
	}
	httpCtx, cancelHTTP := context.WithTimeout(context.Background(), httpShutdownTimeout)
	defer cancelHTTP()
	if a.server != nil {
		if err := a.server.Shutdown(httpCtx); err != nil {
			logger.Infof("server", "HTTP server forced to shutdown: %v", err)
		}
	}

	cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), resourceCleanupTimeout)
	defer cancelCleanup()
	return a.runCleanups(cleanupCtx)
}

func (a *App) onFatal(err error) {
	if a.dbReady {
		auditlog.Log("", "", fmt.Sprintf("Server encountered a fatal error: addr=%s, error=%v", a.listenAddr, err), "error")
	}
	ctx, cancel := context.WithTimeout(context.Background(), resourceCleanupTimeout)
	defer cancel()
	if cleanupErr := a.runCleanups(ctx); cleanupErr != nil {
		logger.Errorf("server", "Cleanup after fatal server error failed: %v", cleanupErr)
	}
}

func (a *App) runCleanups(ctx context.Context) error {
	var cleanupErrors []error
	for i := len(a.cleanups) - 1; i >= 0; i-- {
		cleanup := a.cleanups[i]
		if err := cleanup.fn(ctx); err != nil {
			logger.Errorf("server", "cleanup %q failed: %v", cleanup.name, err)
			cleanupErrors = append(cleanupErrors, fmt.Errorf("cleanup %q: %w", cleanup.name, err))
		}
	}
	return errors.Join(cleanupErrors...)
}

func registerScheduledWork() {
	utils.OnCronFailure = notifier.NotifyCronFailure
	if err := tasks.ReloadPingSchedule(); err != nil {
		logger.ErrorArgs("server", "Failed to reload ping schedule:", err)
	}
	if err := tasks.ReloadCronSchedule(); err != nil {
		logger.ErrorArgs("server", "Failed to reload cron schedule:", err)
	}
	if err := scheduler.AddFunc("records:cleanup", "@every 30m", cleanupScheduledData); err != nil {
		logger.ErrorArgs("server", "Failed to add cleanup scheduled task:", err)
	}
	if err := scheduler.AddContextFunc("metrics:compact", "@every 5m", true, compactMetricStore); err != nil {
		logger.ErrorArgs("server", "Failed to add metric compact scheduled task:", err)
	}
	if err := scheduler.AddContextFunc("metrics:retention", "@every 1h", true, cleanupMetricStore); err != nil {
		logger.ErrorArgs("server", "Failed to add metric retention scheduled task:", err)
	}
	if err := scheduler.AddFunc("notifier:traffic", "@every 1m", notifier.CheckTraffic); err != nil {
		logger.ErrorArgs("server", "Failed to add traffic notification task:", err)
	}
	if err := scheduler.AddFunc("notifier:expire", "0 0 9 * * *", notifier.CheckExpire); err != nil {
		logger.ErrorArgs("server", "Failed to add expire notification task:", err)
	}
	// 每天凌晨 03:30 执行一次主数据库自动瘦身与空间回收（VACUUM）
	if err := scheduler.AddContextFunc("database:maintenance", "0 30 3 * * *", true, scheduledDatabaseMaintenance); err != nil {
		logger.ErrorArgs("server", "Failed to add database maintenance scheduled task:", err)
	}

	// 启动后延迟清理历史定时任务日志，并在主库体积过高时自动执行空间回收
	go func() {
		time.Sleep(10 * time.Second)
		_ = tasks.CleanCronTaskHistory(2)
		if flags.IsSQLite() {
			if size, err := dbcore.StorageSize(); err == nil && size > 80*1024*1024 {
				logger.Infof("server", "[db-maintenance] Database size is %.2f MB (>80MB threshold), automatically triggering initial space reclamation", float64(size)/(1024*1024))
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
				defer cancel()
				scheduledDatabaseMaintenance(ctx)
			}
		}
	}()
}

var (
	lastAutoVacuumTime time.Time
	autoVacuumRunning  bool
	autoVacuumMu       sync.Mutex
)

func tryTriggerAutoVacuum() {
	if !flags.IsSQLite() {
		return
	}
	size, err := dbcore.StorageSize()
	if err != nil || size <= 80*1024*1024 {
		return
	}
	autoVacuumMu.Lock()
	shouldRun := !autoVacuumRunning && time.Since(lastAutoVacuumTime) > 6*time.Hour
	autoVacuumMu.Unlock()
	if !shouldRun {
		return
	}

	logger.Infof("server", "[db-maintenance] Database size is %.2f MB (>80MB threshold), automatically triggering space reclamation", float64(size)/(1024*1024))
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		scheduledDatabaseMaintenance(ctx)
	}()
}

func scheduledDatabaseMaintenance(ctx context.Context) {
	autoVacuumMu.Lock()
	if autoVacuumRunning {
		autoVacuumMu.Unlock()
		return
	}
	autoVacuumRunning = true
	autoVacuumMu.Unlock()

	defer func() {
		autoVacuumMu.Lock()
		autoVacuumRunning = false
		autoVacuumMu.Unlock()
	}()

	logger.Infof("server", "[db-maintenance] Starting scheduled database cleanup and vacuum...")
	cleanupScheduledDataCore()

	if flags.IsSQLite() {
		beforeSize, _ := dbcore.StorageSize()
		if err := dbcore.ReclaimSpace(ctx); err != nil {
			logger.Errorf("server", "[db-maintenance] Failed to reclaim database space: %v", err)
			return
		}
		afterSize, _ := dbcore.StorageSize()
		autoVacuumMu.Lock()
		lastAutoVacuumTime = time.Now().UTC()
		autoVacuumMu.Unlock()
		logger.Infof("server", "[db-maintenance] Database maintenance completed: before %.2f MB, after %.2f MB (freed %.2f MB)",
			float64(beforeSize)/(1024*1024),
			float64(afterSize)/(1024*1024),
			float64(beforeSize-afterSize)/(1024*1024))
	}
}

const defaultTaskResultRetentionDays = 7

func cleanupScheduledDataCore() {
	dbcore.DropLegacyTablesIfExist()

	retentionDays := defaultTaskResultRetentionDays
	if customDays, err := config.GetAs[int]("task_retention_days", defaultTaskResultRetentionDays); err == nil && customDays > 0 {
		retentionDays = customDays
	}
	before := time.Now().UTC().Add(-24 * time.Hour * time.Duration(retentionDays))
	if err := tasks.ClearTaskResultsByTimeBefore(before); err != nil {
		logger.Errorf("server", "Failed to clean expired task results: %v", err)
	}
	_ = tasks.CleanCronTaskHistory(2)
	auditlog.RemoveOldLogs()
	accounts.RemoveExpiredSessions()
}

func cleanupScheduledData() {
	cleanupScheduledDataCore()
	tryTriggerAutoVacuum()
}

func compactMetricStore(ctx context.Context) {
	compactCtx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()
	written, err := metricstore.Compact(compactCtx, time.Now().UTC())
	if errors.Is(err, metricstore.ErrCompactInProgress) {
		return
	}
	if err != nil {
		logger.Errorf("server", "Failed to compact metric store after writing %d rollup buckets: %v", written, err)
		return
	}
	if written > 0 {
		logger.Infof("server", "Metric store compacted %d rollup buckets", written)
	}
}

func cleanupMetricStore(ctx context.Context) {
	cleanupCtx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()
	deleted, err := metricstore.CleanupExpired(cleanupCtx, time.Now().UTC())
	if errors.Is(err, metricstore.ErrCompactInProgress) {
		return
	}
	if err != nil {
		logger.Errorf("server", "Failed to clean expired metric data after deleting %d rows: %v", deleted, err)
		return
	}
	if deleted > 0 {
		logger.Infof("server", "Metric retention cleanup deleted %d rows", deleted)
	}
}
