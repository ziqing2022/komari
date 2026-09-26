package utils

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/komari-monitor/komari/database/dbcore"
	"github.com/komari-monitor/komari/database/models"
	"github.com/komari-monitor/komari/internal/scheduler"
	v2 "github.com/komari-monitor/komari/protocol/v2"
	logger "github.com/komari-monitor/komari/utils/log"
	agent_runtime "github.com/komari-monitor/komari/web/agent"
)

// ExecuteCronTask 执行指定定时任务并真实下发给目标 Agent 节点
func ExecuteCronTask(task *models.CronTask) (string, error) {
	if task == nil || strings.TrimSpace(task.Command) == "" {
		return "", fmt.Errorf("task or command is empty")
	}

	db := dbcore.GetDBInstance()

	// 1. 筛选目标节点
	var targetUUIDs []string
	isAll := len(task.TargetNodes) == 0
	if !isAll && len(task.TargetNodes) == 1 {
		first := strings.ToLower(strings.TrimSpace(task.TargetNodes[0]))
		if first == "all" || first == "" {
			isAll = true
		}
	}

	if isAll {
		var clientRecords []models.Client
		_ = db.Select("uuid").Find(&clientRecords).Error
		for _, c := range clientRecords {
			targetUUIDs = append(targetUUIDs, c.UUID)
		}
		for uuid := range agent_runtime.GetConnectedClients() {
			found := false
			for _, u := range targetUUIDs {
				if u == uuid {
					found = true
					break
				}
			}
			if !found {
				targetUUIDs = append(targetUUIDs, uuid)
			}
		}
	} else {
		for _, node := range task.TargetNodes {
			trimmed := strings.TrimSpace(node)
			if trimmed != "" && trimmed != "all" {
				targetUUIDs = append(targetUUIDs, trimmed)
			}
		}
	}

	// 2. 统计节点在线状态
	var onlineClients, queuedClients, offlineClients []string
	for _, uuid := range targetUUIDs {
		if client := agent_runtime.GetConnectedClients()[uuid]; client != nil {
			onlineClients = append(onlineClients, uuid)
		} else if agent_runtime.IsAgentOnline(uuid) {
			queuedClients = append(queuedClients, uuid)
		} else {
			offlineClients = append(offlineClients, uuid)
		}
	}

	taskId := fmt.Sprintf("cron-%s-%s", task.Id, GenerateRandomString(8))
	taskClients := append(append([]string{}, onlineClients...), queuedClients...)
	taskClients = append(taskClients, offlineClients...)

	// 3. 记录任务至数据库
	if len(taskClients) > 0 {
		taskRecord := models.Task{
			TaskId:  taskId,
			Clients: models.StringArray(taskClients),
			Command: task.Command,
		}
		if err := db.Create(&taskRecord).Error; err != nil {
			logger.Warnf("cron", "Failed to create task in DB: %v", err)
		}
		var taskResults []models.TaskResult
		for _, client := range taskClients {
			taskResults = append(taskResults, models.TaskResult{
				TaskId:     taskId,
				Client:     client,
				Result:     "",
				ExitCode:   nil,
				FinishedAt: nil,
			})
		}
		if len(taskResults) > 0 {
			_ = db.Create(&taskResults).Error
		}
	}

	// 4. WebSocket 下发给当前在线节点
	for _, uuid := range onlineClients {
		payload, err := json.Marshal(v2.Request{
			JSONRPC: v2.Version,
			Method:  v2.MethodAgentExec,
			Params:  v2.ExecParams{TaskID: taskId, Command: task.Command},
		})
		if err == nil {
			if client := agent_runtime.GetConnectedClients()[uuid]; client != nil {
				_ = client.WriteMessage(websocket.TextMessage, payload)
			}
		}
	}

	// 5. 事件队列下发给排队中的节点
	for _, uuid := range queuedClients {
		agent_runtime.DispatchV2Event(uuid, v2.MethodAgentExec, v2.ExecParams{TaskID: taskId, Command: task.Command})
	}

	// 6. 离线节点登记
	now := time.Now().UTC()
	for _, uuid := range offlineClients {
		exitCode := -1
		_ = db.Model(&models.TaskResult{}).
			Where("task_id = ? AND client = ?", taskId, uuid).
			Updates(map[string]interface{}{
				"result":      "Client offline!",
				"exit_code":   exitCode,
				"finished_at": now,
			}).Error
	}

	// 7. 更新 CronTask 记录
	exitCode := 0
	if len(onlineClients) == 0 && len(queuedClients) == 0 && len(offlineClients) > 0 {
		exitCode = -1
	}
	task.LastRunAt = &now
	task.LastExitCode = &exitCode
	summary := fmt.Sprintf("[%s] Dispatched to %d node(s) (online: %d, queued: %d, offline: %d)",
		now.Format("2006-01-02 15:04:05"), len(taskClients), len(onlineClients), len(queuedClients), len(offlineClients))
	task.LastResult = summary
	task.UpdatedAt = now

	// 任务执行后，根据配置的周期自动推算并更新下次调度时间，避免时间倒挂与滞后
	if task.Enabled {
		interval := task.IntervalMinutes
		if interval <= 0 {
			interval = 30
		}
		nextRun := now.Add(time.Duration(interval) * time.Minute)
		task.NextRunAt = &nextRun
	}

	_ = db.Save(task).Error

	return taskId, nil
}

// ReloadCronSchedule 重新加载并注册所有启用的定时任务到系统调度器
func ReloadCronSchedule() error {
	scheduler.RemovePrefix("cron:")

	db := dbcore.GetDBInstance()
	var cronTasks []models.CronTask
	if err := db.Where("enabled = ?", true).Find(&cronTasks).Error; err != nil {
		return err
	}

	for _, t := range cronTasks {
		task := t
		spec := ""
		if task.ScheduleType == "cron" && strings.TrimSpace(task.CronExpression) != "" {
			spec = strings.TrimSpace(task.CronExpression)
		} else if task.IntervalMinutes > 0 {
			spec = scheduler.Every(time.Duration(task.IntervalMinutes) * time.Minute)
		}

		if spec != "" {
			jobName := fmt.Sprintf("cron:%s", task.Id)
			err := scheduler.AddContextFunc(jobName, spec, false, func(ctx context.Context) {
				var current models.CronTask
				if err := db.Where("id = ?", task.Id).First(&current).Error; err == nil && current.Enabled {
					_, _ = ExecuteCronTask(&current)
				}
			})
			if err != nil {
				logger.Warnf("cron", "Failed to schedule cron task %s (%s): %v", task.Id, spec, err)
			}
		}
	}
	return nil
}
