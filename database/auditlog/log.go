package auditlog

import (
	"time"

	"github.com/komari-monitor/komari/database/dbcore"
	"github.com/komari-monitor/komari/database/models"
	logger "github.com/komari-monitor/komari/utils/log"
)

func Log(ip, uuid, message, msgType string) {
	_ = LogWithID(ip, uuid, message, msgType)
}

// LogWithID persists an audit log entry and returns its database ID so callers
// representing a single lifecycle event (such as a terminal session) can update
// the entry in place instead of emitting duplicate rows.
func LogWithID(ip, uuid, message, msgType string) uint {
	db := dbcore.GetDBInstance()
	logEntry := &models.Log{
		IP:      ip,
		UUID:    uuid,
		Message: Truncate(message, maxAuditMessageRunes),
		MsgType: msgType,
		Time:    time.Now().UTC(),
	}
	if err := db.Create(logEntry).Error; err != nil {
		logger.Error("audit", "failed to persist audit event", "error", err, "type", msgType)
		return 0
	}
	return logEntry.ID
}

// UpdateMessage updates the message text of an existing audit log entry.
func UpdateMessage(id uint, message string) {
	if id == 0 {
		return
	}
	db := dbcore.GetDBInstance()
	if err := db.Model(&models.Log{}).Where("id = ?", id).Update("message", Truncate(message, maxAuditMessageRunes)).Error; err != nil {
		logger.Error("audit", "failed to update audit event", "error", err, "id", id)
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
