package models

import "time"

// CronTask 定时任务模型
type CronTask struct {
	Id              string      `json:"id" gorm:"type:varchar(64);primaryKey"`
	Name            string      `json:"name" gorm:"type:varchar(255);not null"`
	Command         string      `json:"command" gorm:"type:text;not null"`
	ScheduleType    string      `json:"schedule_type" gorm:"type:varchar(32);not null;default:'preset'"`
	IntervalMinutes int         `json:"interval_minutes" gorm:"type:int;not null;default:30"`
	CronExpression  string      `json:"cron_expression,omitempty" gorm:"type:varchar(128)"`
	TargetNodes     StringArray `json:"target_nodes" gorm:"type:longtext"`
	Enabled         bool        `json:"enabled" gorm:"not null;default:true"`
	LastRunAt       *time.Time  `json:"last_run_at,omitempty"`
	LastExitCode    *int        `json:"last_exit_code,omitempty" gorm:"type:int"`
	LastResult      string      `json:"last_result,omitempty" gorm:"type:longtext"`
	NextRunAt       *time.Time  `json:"next_run_at,omitempty"`
	CreatedAt       time.Time   `json:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at"`
}
