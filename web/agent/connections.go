package agent

import (
	"sort"
	"sync"
	"time"

	v2 "github.com/komari-monitor/komari/protocol/v2"
	"github.com/komari-monitor/komari/web/connection"
)

var (
	connectedClients = make(map[string]*connection.SafeConn)
	v2Clients        = make(map[string]struct{})
	latestReport     = make(map[string]*v2.Report)
	recentReports    = make(map[string][]v2.Report)
	// presenceOnly stores online state for non-WebSocket agents.
	// value keeps connectionID and a soft expiration to avoid flicker
	presenceOnly = make(map[string]struct {
		id     int64
		expire time.Time
	})
	recentReportsMu  = sync.RWMutex{}
	mu               = sync.RWMutex{}
)

const (
	recentReportRetention = time.Minute
	maxRecentReportsPerClient = 60
)

func GetConnectedClient(uuid string) *connection.SafeConn {
	mu.RLock()
	defer mu.RUnlock()
	return connectedClients[uuid]
}

func IsClientConnected(uuid string) bool {
	mu.RLock()
	defer mu.RUnlock()
	_, ok := connectedClients[uuid]
	return ok
}

func GetConnectedClientUUIDs() []string {
	mu.RLock()
	defer mu.RUnlock()
	uuids := make([]string, 0, len(connectedClients))
	for k := range connectedClients {
		uuids = append(uuids, k)
	}
	return uuids
}

func GetConnectedClients() map[string]*connection.SafeConn {
	mu.RLock()
	defer mu.RUnlock()
	clientsCopy := make(map[string]*connection.SafeConn)
	for k, v := range connectedClients {
		clientsCopy[k] = v
	}
	return clientsCopy
}

func SetConnectedClients(uuid string, conn *connection.SafeConn) {
	mu.Lock()
	defer mu.Unlock()
	connectedClients[uuid] = conn
}

func MarkV2Client(uuid string) {
	mu.Lock()
	defer mu.Unlock()
	v2Clients[uuid] = struct{}{}
}

func IsV2Client(uuid string) bool {
	mu.RLock()
	defer mu.RUnlock()
	_, ok := v2Clients[uuid]
	return ok
}

func DeleteClientConditionally(uuid string, connToRemove *connection.SafeConn) {
	mu.Lock()
	defer mu.Unlock()

	// 检查当前 map 里的 conn 是否就是要删除的这一个
	if currentConn, exists := connectedClients[uuid]; exists && currentConn == connToRemove {
		delete(connectedClients, uuid)
		delete(v2Clients, uuid)
	}
}
func DeleteConnectedClients(uuid string) {
	mu.Lock()
	defer mu.Unlock()
	// 只从 map 中删除，不再负责关闭连接
	delete(connectedClients, uuid)
	delete(v2Clients, uuid)
}

// SetPresence sets or clears presence for non-WebSocket agents.
// When present=false, it only clears if the connectionID matches current one.
// KeepAlivePresence sets presence with TTL for non-WebSocket agents.
func KeepAlivePresence(uuid string, connectionID int64, ttl time.Duration) {
	mu.Lock()
	defer mu.Unlock()
	presenceOnly[uuid] = struct {
		id     int64
		expire time.Time
	}{id: connectionID, expire: time.Now().Add(ttl)}
}

var defaultPresenceTTL = 20 * time.Second

// SetPresence keeps compatibility with existing callers.
func SetPresence(uuid string, connectionID int64, present bool) {
	mu.Lock()
	defer mu.Unlock()
	if present {
		presenceOnly[uuid] = struct {
			id     int64
			expire time.Time
		}{id: connectionID, expire: time.Now().Add(defaultPresenceTTL)}
		return
	}
	if cur, ok := presenceOnly[uuid]; ok && cur.id == connectionID {
		delete(presenceOnly, uuid)
	}
}

// GetAllOnlineUUIDs returns a de-duplicated list of online UUIDs from both WebSocket and non-WebSocket agents.
func GetAllOnlineUUIDs() []string {
	mu.RLock()
	defer mu.RUnlock()
	set := make(map[string]struct{})
	for k := range connectedClients {
		set[k] = struct{}{}
	}
	now := time.Now()
	for k, v := range presenceOnly {
		if v.expire.After(now) {
			set[k] = struct{}{}
		}
	}
	res := make([]string, 0, len(set))
	for k := range set {
		res = append(res, k)
	}
	return res
}
func GetLatestReport() map[string]*v2.Report {
	mu.RLock()
	defer mu.RUnlock()
	reportCopy := make(map[string]*v2.Report)
	for k, v := range latestReport {
		if v == nil {
			continue
		}
		item := *v
		reportCopy[k] = &item
	}
	return reportCopy
}

// RecordReport updates the latest runtime state and keeps only the short raw
// window used by recent-status compatibility endpoints.
func RecordReport(report v2.Report) {
	if report.UUID == "" {
		return
	}
	if report.UpdatedAt.IsZero() {
		report.UpdatedAt = time.Now().UTC()
	} else {
		report.UpdatedAt = report.UpdatedAt.UTC()
	}

	mu.Lock()
	if latest := latestReport[report.UUID]; latest == nil || !report.UpdatedAt.Before(latest.UpdatedAt) {
		item := report
		latestReport[report.UUID] = &item
	}
	mu.Unlock()

	cutoff := time.Now().UTC().Add(-recentReportRetention)
	recentReportsMu.Lock()
	defer recentReportsMu.Unlock()
	reports := recentReports[report.UUID]
	if report.UpdatedAt.Before(cutoff) {
		return
	}
	// Normal fast path: reports arrive chronologically
	if len(reports) == 0 || !report.UpdatedAt.Before(reports[len(reports)-1].UpdatedAt) {
		reports = append(reports, report)
	} else {
		insertAt := sort.Search(len(reports), func(i int) bool {
			return reports[i].UpdatedAt.After(report.UpdatedAt)
		})
		reports = append(reports, v2.Report{})
		copy(reports[insertAt+1:], reports[insertAt:])
		reports[insertAt] = report
	}
	// Fast trim from head without full reallocation
	first := 0
	for first < len(reports) && reports[first].UpdatedAt.Before(cutoff) {
		first++
	}
	if first > 0 {
		reports = reports[first:]
	}
	if len(reports) > maxRecentReportsPerClient {
		reports = reports[len(reports)-maxRecentReportsPerClient:]
	}
	// Reset underlying array if capacity grew too much
	if cap(reports) > maxRecentReportsPerClient*2 {
		compacted := make([]v2.Report, len(reports))
		copy(compacted, reports)
		reports = compacted
	}
	recentReports[report.UUID] = reports
}

func GetRecentReports(uuid string) []v2.Report {
	recentReportsMu.Lock()
	defer recentReportsMu.Unlock()
	cutoff := time.Now().UTC().Add(-recentReportRetention)
	reports := recentReports[uuid]
	first := 0
	for first < len(reports) && reports[first].UpdatedAt.Before(cutoff) {
		first++
	}
	if first > 0 {
		reports = reports[first:]
		recentReports[uuid] = reports
	}
	if len(reports) == 0 {
		delete(recentReports, uuid)
		return []v2.Report{}
	}
	return append([]v2.Report(nil), reports...)
}

func reportsAfter(reports []v2.Report, cutoff time.Time) []v2.Report {
	first := 0
	for first < len(reports) && reports[first].UpdatedAt.Before(cutoff) {
		first++
	}
	out := make([]v2.Report, len(reports)-first)
	copy(out, reports[first:])
	return out
}

func DeleteLatestReport(uuid string) {
	mu.Lock()
	delete(latestReport, uuid)
	mu.Unlock()

	recentReportsMu.Lock()
	delete(recentReports, uuid)
	recentReportsMu.Unlock()
}
