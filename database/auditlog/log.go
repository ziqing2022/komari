package auditlog

import (
	logger "github.com/komari-monitor/komari/utils/log"
	"time"

	"github.com/komari-monitor/komari/database/dbcore"
	"github.com/komari-monitor/komari/database/models"
)

func Log(ip, uuid, message, msgType string) {
	db := dbcore.GetDBInstance()
	logEntry := &models.Log{
		IP:      ip,
		UUID:    uuid,
		Message: message,
		MsgType: msgType,
		Time:    time.Now().UTC(),
	}
	if err := db.Create(logEntry).Error; err != nil {
		logger.Error("audit", "failed to persist audit event", "error", err, "type", msgType)
	}
}

func EventLog(eventType, message string) {
	Log("", "", message, eventType)
}

// RemoveOldLogs 清理超过 7 天的老日志，并限制系统审计日志最多保留 5000 条
func RemoveOldLogs() {
	db := dbcore.GetDBInstance()
	threshold := time.Now().UTC().AddDate(0, 0, -7)
	if err := db.Where("time < ?", threshold).Delete(&models.Log{}).Error; err != nil {
		logger.ErrorArgs("audit", "Failed to remove old logs:", err)
	}

	var count int64
	if err := db.Model(&models.Log{}).Count(&count).Error; err == nil && count > 5000 {
		var cutoffID uint
		if err := db.Model(&models.Log{}).Select("id").Order("id desc").Offset(5000).Limit(1).Pluck("id", &cutoffID).Error; err == nil && cutoffID > 0 {
			_ = db.Where("id <= ?", cutoffID).Delete(&models.Log{}).Error
		}
	}
}
