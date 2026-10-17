package messageSender

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/komari-monitor/komari/database/models"
	"github.com/komari-monitor/komari/utils/item"
	"github.com/komari-monitor/komari/utils/messageSender/factory"
)

type factoryChannelAdapter struct {
	name string
}

func (a *factoryChannelAdapter) Send(_ context.Context, notification Notification, config map[string]any) error {
	constructor, ok := factory.GetConstructor(a.name)
	if !ok {
		return fmt.Errorf("provider %s not found", a.name)
	}
	sender := constructor()
	if config != nil {
		raw, err := json.Marshal(config)
		if err == nil {
			_ = json.Unmarshal(raw, sender.GetConfiguration())
		}
	}
	if err := sender.Init(); err != nil {
		return err
	}
	defer sender.Destroy()

	if eventSender, ok := sender.(factory.IEventMessageSender); ok {
		return eventSender.SendEvent(notification.Event)
	}
	return sender.SendTextMessage(notification.Message, notification.Title)
}

func (a *factoryChannelAdapter) Unload() error {
	return nil
}

// RegisterFactoryChannels 将通过 factory 注册的自定义渠道适配并接入到 1.6.0 的 notificationChannels 注册中心
func RegisterFactoryChannels() {
	for name, sender := range factory.GetAllMessageSenders() {
		if strings.EqualFold(name, "webhook") || strings.EqualFold(name, "javascript") {
			continue // webhook 和 javascript 已由 1.6.0 原生实现处理
		}
		rawConfig := sender.GetConfiguration()
		items := item.Parse(rawConfig)
		var formItems []models.ManagedThemeConfigurationItem
		for _, it := range items {
			formItems = append(formItems, models.ManagedThemeConfigurationItem{
				Key:      it.Name,
				Name:     it.Name,
				Required: it.Required,
				Type:     it.Type,
				Options:  it.Options,
				Default:  it.Default,
				Help:     it.Help,
			})
		}
		cfg := models.Configuration{
			Type: models.ThemeConfigurationManaged,
			Name: name,
			Data: formItems,
		}
		_ = RegisterNotificationChannel(name, cfg, &factoryChannelAdapter{name: name})
	}
}
