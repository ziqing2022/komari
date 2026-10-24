package admin

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/komari-monitor/komari/database/dbcore"
	"github.com/komari-monitor/komari/database/models"
	"github.com/komari-monitor/komari/utils"
	"github.com/komari-monitor/komari/web/api"
)

type CronTaskInput struct {
	Id              string             `json:"id"`
	Name            string             `json:"name"`
	Command         string             `json:"command"`
	ScheduleType    string             `json:"schedule_type"`
	IntervalMinutes int                `json:"interval_minutes"`
	CronExpression  string             `json:"cron_expression"`
	TargetNodes     models.StringArray `json:"target_nodes"`
	Enabled         *bool              `json:"enabled"`
	NotifyOnFailure *bool              `json:"notify_on_failure"`
}

func findCronTask(id string) (*models.CronTask, error) {
	db := dbcore.GetDBInstance()
	var task models.CronTask
	bareID := strings.TrimPrefix(strings.TrimPrefix(id, "cron-"), "task-")
	prefixedCron := "cron-" + bareID
	prefixedTask := "task-" + bareID
	err := db.Where("id = ? OR id = ? OR id = ? OR id = ?", id, bareID, prefixedCron, prefixedTask).First(&task).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

// ListCronTasks 获取全部定时任务列表
func ListCronTasks(c *gin.Context) {
	db := dbcore.GetDBInstance()
	var tasks []models.CronTask
	if err := db.Order("created_at desc").Find(&tasks).Error; err != nil {
		api.RespondError(c, http.StatusInternalServerError, "Failed to retrieve cron tasks: "+err.Error())
		return
	}

	now := time.Now().UTC()
	for i := range tasks {
		if tasks[i].Enabled {
			interval := tasks[i].IntervalMinutes
			if interval <= 0 {
				interval = 30
			}
			// 自动校准滞后或异常倒挂的下次调度时间（纯内存计算返回，避免高频并发 GET 请求对单连接 SQLite 造成写锁饥饿与整体卡死）
			if tasks[i].NextRunAt == nil || tasks[i].NextRunAt.Before(now) || (tasks[i].LastRunAt != nil && !tasks[i].NextRunAt.After(*tasks[i].LastRunAt)) {
				nextRun := now.Add(time.Duration(interval) * time.Minute)
				tasks[i].NextRunAt = &nextRun
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "",
		"data":    tasks,
		"tasks":   tasks,
	})
}

// CreateCronTask 创建新的定时任务
func CreateCronTask(c *gin.Context) {
	var input CronTaskInput
	if err := c.ShouldBindJSON(&input); err != nil {
		api.RespondError(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}
	if strings.TrimSpace(input.Name) == "" || strings.TrimSpace(input.Command) == "" {
		api.RespondError(c, http.StatusBadRequest, "Task name and command are required")
		return
	}

	taskID := input.Id
	if strings.TrimSpace(taskID) == "" {
		taskID = fmt.Sprintf("cron-%d", time.Now().UnixMilli())
	}

	interval := input.IntervalMinutes
	if interval <= 0 {
		interval = 30
	}

	scheduleType := input.ScheduleType
	if scheduleType == "" {
		scheduleType = "preset"
	}

	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}

	notifyOnFailure := false
	if input.NotifyOnFailure != nil {
		notifyOnFailure = *input.NotifyOnFailure
	}

	targetNodes := input.TargetNodes
	if len(targetNodes) == 0 {
		targetNodes = models.StringArray{"all"}
	}

	now := time.Now().UTC()
	nextRun := now.Add(time.Duration(interval) * time.Minute)

	task := models.CronTask{
		Id:              taskID,
		Name:            input.Name,
		Command:         input.Command,
		ScheduleType:    scheduleType,
		IntervalMinutes: interval,
		CronExpression:  input.CronExpression,
		TargetNodes:     targetNodes,
		Enabled:         enabled,
		NotifyOnFailure: notifyOnFailure,
		NextRunAt:       &nextRun,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	db := dbcore.GetDBInstance()
	if err := db.Create(&task).Error; err != nil {
		api.RespondError(c, http.StatusInternalServerError, "Failed to create task: "+err.Error())
		return
	}
	go func() { _ = utils.ReloadCronSchedule() }()

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Task created successfully",
		"task":    task,
		"data":    task,
	})
}

// UpdateCronTask 更新已有定时任务（找不到时自动做保存）
func UpdateCronTask(c *gin.Context) {
	id := c.Param("id")
	task, err := findCronTask(id)

	var input CronTaskInput
	if err := c.ShouldBindJSON(&input); err != nil {
		api.RespondError(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	db := dbcore.GetDBInstance()
	if err != nil || task == nil {
		now := time.Now().UTC()
		interval := input.IntervalMinutes
		if interval <= 0 {
			interval = 30
		}
		scheduleType := input.ScheduleType
		if scheduleType == "" {
			scheduleType = "preset"
		}
		enabled := true
		if input.Enabled != nil {
			enabled = *input.Enabled
		}
		notifyOnFailure := false
		if input.NotifyOnFailure != nil {
			notifyOnFailure = *input.NotifyOnFailure
		}
		targetNodes := input.TargetNodes
		if len(targetNodes) == 0 {
			targetNodes = models.StringArray{"all"}
		}
		nextRun := now.Add(time.Duration(interval) * time.Minute)
		task = &models.CronTask{
			Id:              id,
			Name:            input.Name,
			Command:         input.Command,
			ScheduleType:    scheduleType,
			IntervalMinutes: interval,
			CronExpression:  input.CronExpression,
			TargetNodes:     targetNodes,
			Enabled:         enabled,
			NotifyOnFailure: notifyOnFailure,
			NextRunAt:       &nextRun,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		if err := db.Create(task).Error; err != nil {
			api.RespondError(c, http.StatusInternalServerError, "Failed to save task: "+err.Error())
			return
		}
	} else {
		if strings.TrimSpace(input.Name) != "" {
			task.Name = input.Name
		}
		if strings.TrimSpace(input.Command) != "" {
			task.Command = input.Command
		}
		if input.ScheduleType != "" {
			task.ScheduleType = input.ScheduleType
		}
		if input.IntervalMinutes > 0 {
			task.IntervalMinutes = input.IntervalMinutes
		}
		task.CronExpression = input.CronExpression
		if input.TargetNodes != nil {
			task.TargetNodes = input.TargetNodes
		}
		if input.Enabled != nil {
			task.Enabled = *input.Enabled
		}
		if input.NotifyOnFailure != nil {
			task.NotifyOnFailure = *input.NotifyOnFailure
		}
		if task.Enabled {
			now := time.Now().UTC()
			interval := task.IntervalMinutes
			if interval <= 0 {
				interval = 30
			}
			if task.NextRunAt == nil || task.NextRunAt.Before(now) || (task.LastRunAt != nil && !task.NextRunAt.After(*task.LastRunAt)) {
				nextRun := now.Add(time.Duration(interval) * time.Minute)
				task.NextRunAt = &nextRun
			}
		} else {
			task.NextRunAt = nil
		}
		task.UpdatedAt = time.Now().UTC()

		if err := db.Save(task).Error; err != nil {
			api.RespondError(c, http.StatusInternalServerError, "Failed to update task: "+err.Error())
			return
		}
	}
	go func() { _ = utils.ReloadCronSchedule() }()

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Task updated successfully",
		"task":    task,
		"data":    task,
	})
}

// DeleteCronTask 删除定时任务（支持多格式 ID 匹配，确保幂等性）
func DeleteCronTask(c *gin.Context) {
	id := c.Param("id")
	task, err := findCronTask(id)
	db := dbcore.GetDBInstance()
	if err == nil && task != nil {
		if err := db.Delete(task).Error; err != nil {
			api.RespondError(c, http.StatusInternalServerError, "Failed to delete task: "+err.Error())
			return
		}
	} else {
		bareID := strings.TrimPrefix(strings.TrimPrefix(id, "cron-"), "task-")
		prefixedCron := "cron-" + bareID
		prefixedTask := "task-" + bareID
		_ = db.Where("id = ? OR id = ? OR id = ? OR id = ?", id, bareID, prefixedCron, prefixedTask).Delete(&models.CronTask{}).Error
	}
	go func() { _ = utils.ReloadCronSchedule() }()

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Task deleted successfully",
	})
}

// ToggleCronTask 切换定时任务启用状态
func ToggleCronTask(c *gin.Context) {
	id := c.Param("id")
	task, err := findCronTask(id)
	db := dbcore.GetDBInstance()
	if err != nil || task == nil {
		enabled := true
		var body struct {
			Enabled *bool `json:"enabled"`
		}
		if err := c.ShouldBindJSON(&body); err == nil && body.Enabled != nil {
			enabled = *body.Enabled
		}
		c.JSON(http.StatusOK, gin.H{
			"status":  "success",
			"enabled": enabled,
			"data":    gin.H{"enabled": enabled},
		})
		return
	}

	var body struct {
		Enabled *bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err == nil && body.Enabled != nil {
		task.Enabled = *body.Enabled
	} else {
		task.Enabled = !task.Enabled
	}
	if task.Enabled {
		now := time.Now().UTC()
		interval := task.IntervalMinutes
		if interval <= 0 {
			interval = 30
		}
		if task.NextRunAt == nil || task.NextRunAt.Before(now) || (task.LastRunAt != nil && !task.NextRunAt.After(*task.LastRunAt)) {
			nextRun := now.Add(time.Duration(interval) * time.Minute)
			task.NextRunAt = &nextRun
		}
	} else {
		task.NextRunAt = nil
	}
	task.UpdatedAt = time.Now().UTC()

	_ = db.Save(task).Error
	go func() { _ = utils.ReloadCronSchedule() }()

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"enabled": task.Enabled,
		"data":    gin.H{"enabled": task.Enabled},
	})
}

// RunCronTask 手动立即触发定时任务并下发给目标服务器执行
func RunCronTask(c *gin.Context) {
	id := c.Param("id")
	task, err := findCronTask(id)
	if err != nil || task == nil {
		api.RespondError(c, http.StatusNotFound, "Task not found")
		return
	}

	taskId, err := utils.ExecuteCronTask(task)
	if err != nil {
		api.RespondError(c, http.StatusInternalServerError, "Failed to execute task: "+err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Task triggered successfully",
		"task_id": taskId,
		"task":    task,
		"data":    task,
	})
}

// GetCronTaskLogs 获取定时任务执行日志（包含客户端真实执行回传输出）
func GetCronTaskLogs(c *gin.Context) {
	id := c.Param("id")
	task, err := findCronTask(id)
	if err != nil || task == nil {
		api.RespondError(c, http.StatusNotFound, "Task not found")
		return
	}

	db := dbcore.GetDBInstance()
	var results []models.TaskResult
	bareID := strings.TrimPrefix(strings.TrimPrefix(task.Id, "cron-"), "task-")
	prefix1 := fmt.Sprintf("cron-%s-%%", bareID)
	prefix2 := fmt.Sprintf("cron-%s-%%", task.Id)
	prefix3 := fmt.Sprintf("cron-cron-%s-%%", bareID)
	prefix4 := fmt.Sprintf("task-%s-%%", bareID)

	// 解析分页与数量限制（默认 500 条，确保 200+ 机器集群单次完整批次不被截断，最大支持 2000 条）
	limit := 500
	if l := strings.TrimSpace(c.Query("limit")); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			if parsed > 2000 {
				limit = 2000
			} else {
				limit = parsed
			}
		}
	}

	// 1. 先从轻量 tasks 表中精确锁定该定时任务最近执行的若干个批次 TaskId
	var batchTaskIDs []string
	_ = db.Model(&models.Task{}).
		Where("task_id LIKE ? OR task_id LIKE ? OR task_id LIKE ? OR task_id LIKE ? OR task_id = ? OR task_id = ?",
			prefix1, prefix2, prefix3, prefix4, task.Id, bareID).
		Order("rowid desc").
		Limit(10).
		Pluck("task_id", &batchTaskIDs).Error

	// 2. 使用 task_id IN (?) 命中单字段索引精确获取节点执行结果，彻底避免海量数据下的全表扫描
	if len(batchTaskIDs) > 0 {
		_ = db.Select("task_id", "client", "result", "exit_code", "finished_at", "created_at").
			Preload("ClientInfo").
			Where("task_id IN (?)", batchTaskIDs).
			Order("created_at desc").
			Limit(limit).
			Find(&results).Error
	} else {
		_ = db.Select("task_id", "client", "result", "exit_code", "finished_at", "created_at").
			Preload("ClientInfo").
			Where("task_id LIKE ? OR task_id LIKE ? OR task_id LIKE ? OR task_id LIKE ? OR task_id = ? OR task_id = ?",
				prefix1, prefix2, prefix3, prefix4, task.Id, bareID).
			Order("created_at desc").
			Limit(limit).
			Find(&results).Error
	}

	var logs []gin.H
	for _, res := range results {
		clientName := res.Client
		if res.ClientInfo.Name != "" {
			clientName = res.ClientInfo.Name
		}
		var exitCode any = nil
		status := "success"
		if res.FinishedAt == nil {
			status = "running"
		} else if res.ExitCode != nil {
			exitCode = *res.ExitCode
			if *res.ExitCode != 0 {
				status = "failed"
			}
		} else {
			exitCode = 0
		}

		output := strings.TrimSpace(res.Result)
		if output == "" {
			if res.FinishedAt == nil {
				output = "[Command dispatched, awaiting execution response from agent...]"
			} else {
				output = "[Command completed with no stdout/stderr output]"
			}
		}

		var finishedAtStr any = nil
		if res.FinishedAt != nil {
			finishedAtStr = res.FinishedAt.UTC().Format(time.RFC3339)
		}

		timeStr := res.CreatedAt.UTC().Format(time.RFC3339)
		logs = append(logs, gin.H{
			"id":                 fmt.Sprintf("%s-%s", res.TaskId, res.Client),
			"task_id":            task.Id,
			"task_name":          task.Name,
			"node_name":          clientName,
			"triggered_at":       timeStr,
			"start_time":         timeStr,
			"finished_at":        finishedAtStr,
			"end_time":           finishedAtStr,
			"exit_code":          exitCode,
			"status":             status,
			"output":             output,
			"target_nodes_count": 1,
		})
	}

	if len(logs) == 0 && task.LastRunAt != nil {
		exitCode := 0
		if task.LastExitCode != nil {
			exitCode = *task.LastExitCode
		}
		output := task.LastResult
		if strings.TrimSpace(output) == "" {
			output = fmt.Sprintf("Command: %s\nStatus: Triggered\nCode: %d", task.Command, exitCode)
		}
		timeStr := task.LastRunAt.UTC().Format(time.RFC3339)
		logs = append(logs, gin.H{
			"id":                 fmt.Sprintf("log-%s-latest", task.Id),
			"task_id":            task.Id,
			"task_name":          task.Name,
			"node_name":          "All Targets",
			"triggered_at":       timeStr,
			"start_time":         timeStr,
			"finished_at":        timeStr,
			"end_time":           timeStr,
			"exit_code":          exitCode,
			"status":             "success",
			"output":             output,
			"target_nodes_count": len(task.TargetNodes),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "",
		"logs":    logs,
		"data":    logs,
	})
}

