package notifier

import (
	"fmt"
	"time"

	"github.com/komari-monitor/komari/database/clients"
	"github.com/komari-monitor/komari/database/models"
	messageevent "github.com/komari-monitor/komari/database/models/messageEvent"
	logger "github.com/komari-monitor/komari/utils/log"
	"github.com/komari-monitor/komari/utils/messageSender"
)

// NotifyCronFailure 在定时任务执行失败或节点离线时发送告警通知
func NotifyCronFailure(task *models.CronTask, clientUUID string, exitCode int, output string) {
	if task == nil || !task.NotifyOnFailure {
		return
	}

	go func() {
		var eventClients []models.Client
		nodeLabel := "全部目标节点"
		if clientUUID != "" {
			if client, err := clients.GetClientByUUID(clientUUID); err == nil {
				eventClients = append(eventClients, client)
				nodeLabel = client.Name
				if nodeLabel == "" {
					nodeLabel = clientUUID
				}
			} else {
				nodeLabel = clientUUID
			}
		}

		cleanOutput := output
		if len(cleanOutput) > 300 {
			cleanOutput = cleanOutput[:300] + "...(truncated)"
		}

		msg := fmt.Sprintf("定时任务 [%s] 在节点 [%s] 执行失败 (退出码: %d)\n输出: %s",
			task.Name, nodeLabel, exitCode, cleanOutput)

		if err := messageSender.SendNotification(models.EventMessage{
			Event:   messageevent.CronFailed,
			Clients: eventClients,
			Time:    time.Now().UTC(),
			Message: msg,
			Emoji:   "⚠️",
		}); err != nil {
			logger.ErrorArgs("notifier", "Failed to send cron failure notification:", err)
		}
	}()
}
