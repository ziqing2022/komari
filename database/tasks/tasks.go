package tasks

import (
	"fmt"
	"strings"
	"time"

	"github.com/komari-monitor/komari/database/dbcore"
	"github.com/komari-monitor/komari/database/models"
)

func CreateTask(taskId string, clients []string, command string) error {
	db := dbcore.GetDBInstance()
	// Create a new task in the database with clients as JSON array
	task := models.Task{
		TaskId:  taskId,
		Clients: models.StringArray(clients),
		Command: command,
	}
	if err := db.Create(&task).Error; err != nil {
		return err
	}
	var taskResults []models.TaskResult
	for _, client := range clients {
		taskResults = append(taskResults, models.TaskResult{
			TaskId:     taskId,
			Client:     client,
			Result:     "",
			ExitCode:   nil,
			FinishedAt: nil,
			CreatedAt:  time.Now().UTC(),
		})
	}
	if len(taskResults) > 0 {
		return db.Create(&taskResults).Error
	}
	return nil
}
func GetTaskByTaskId(taskId string) (*models.Task, error) {
	var task models.Task
	if err := dbcore.GetDBInstance().Where("task_id = ?", taskId).First(&task).Error; err != nil {
		return nil, err
	}
	return &task, nil
}
func GetTasksByClientId(clientId string) ([]models.Task, error) {
	var tasks []models.Task
	if err := dbcore.GetDBInstance().Where("clients LIKE ?", "%"+clientId+"%").Find(&tasks).Error; err != nil {
		return nil, err
	}
	return tasks, nil
}

func GetSpecificTaskResult(taskId, clientId string) (*models.TaskResult, error) {
	var result models.TaskResult
	if err := dbcore.GetDBInstance().Where("task_id = ? AND client = ?", taskId, clientId).First(&result).Error; err != nil {
		return nil, err
	}
	return &result, nil
}

func GetAllTasks() ([]models.Task, error) {
	var tasks []models.Task
	if err := dbcore.GetDBInstance().Find(&tasks).Error; err != nil {
		return nil, err
	}
	return tasks, nil
}

func GetTaskResultsByTaskId(taskId string) ([]models.TaskResult, error) {
	var results []models.TaskResult
	if err := dbcore.GetDBInstance().Where("task_id = ?", taskId).Find(&results).Error; err != nil {
		return nil, err
	}
	return results, nil
}
func SaveTaskResult(taskId, clientId, result string, exitCode int, timestamp time.Time) error {
	return dbcore.GetDBInstance().
		Model(&models.TaskResult{}).
		Where("task_id = ? AND client = ?", taskId, clientId).
		Updates(map[string]interface{}{
			"result":      result,
			"exit_code":   exitCode,
			"finished_at": timestamp.UTC(),
		}).Error
}

func ClearTaskResultsByTimeBefore(before time.Time) error {
	db := dbcore.GetDBInstance()
	if err := db.Where("created_at < ?", before.UTC()).Delete(&models.TaskResult{}).Error; err != nil {
		return err
	}
	// 清理没有对应 task_results 的旧 task 记录，避免孤儿记录长期堆积
	_ = db.Where("task_id NOT IN (SELECT DISTINCT task_id FROM task_results)").Delete(&models.Task{}).Error
	return nil
}

// CleanCronTaskHistory 保留每个定时任务最近 maxBatches 个执行批次（默认 2 次），清理更早的历史结果，防止高频定时任务打爆数据库
func CleanCronTaskHistory(maxBatches int) error {
	if maxBatches <= 0 {
		maxBatches = 2
	}
	db := dbcore.GetDBInstance()

	var cronTasks []models.CronTask
	if err := db.Select("id").Find(&cronTasks).Error; err != nil {
		return err
	}

	for _, ct := range cronTasks {
		_ = CleanSingleCronTaskHistory(ct.Id, maxBatches)
	}
	// 顺便清理没有对应 task_results 的旧 task 记录，避免孤儿记录长期堆积
	_ = db.Where("task_id NOT IN (SELECT DISTINCT task_id FROM task_results)").Delete(&models.Task{}).Error
	return nil
}

// CleanSingleCronTaskHistory 保留指定定时任务最近 maxBatches 个执行批次（默认 2 次），清理更早的历史结果
func CleanSingleCronTaskHistory(cronTaskId string, maxBatches int) error {
	if maxBatches <= 0 {
		maxBatches = 2
	}
	db := dbcore.GetDBInstance()

	bareID := strings.TrimPrefix(strings.TrimPrefix(cronTaskId, "cron-"), "task-")
	prefix1 := fmt.Sprintf("cron-%s-%%", bareID)
	prefix2 := fmt.Sprintf("cron-%s-%%", cronTaskId)
	prefix3 := fmt.Sprintf("cron-cron-%s-%%", bareID)
	prefix4 := fmt.Sprintf("task-%s-%%", bareID)

	var oldTaskIDs []string
	_ = db.Model(&models.Task{}).
		Where("task_id LIKE ? OR task_id LIKE ? OR task_id LIKE ? OR task_id LIKE ? OR task_id = ? OR task_id = ?",
			prefix1, prefix2, prefix3, prefix4, cronTaskId, bareID).
		Order("rowid desc").
		Offset(maxBatches).
		Limit(1000).
		Pluck("task_id", &oldTaskIDs).Error

	if len(oldTaskIDs) > 0 {
		_ = db.Where("task_id IN (?)", oldTaskIDs).Delete(&models.TaskResult{}).Error
		_ = db.Where("task_id IN (?)", oldTaskIDs).Delete(&models.Task{}).Error
	}
	return nil
}
