package tasks

import "github.com/komari-monitor/komari/utils"

// ReloadCronSchedule 触发重新加载系统定时任务时间表
func ReloadCronSchedule() error {
	return utils.ReloadCronSchedule()
}
