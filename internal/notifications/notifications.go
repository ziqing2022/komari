// Package notifications wires the built-in notification channels into the
// shared messageSender registry.
package notifications

import (
	"encoding/json"
	"errors"

	"github.com/komari-monitor/komari/database"
	"github.com/komari-monitor/komari/database/models"
	"github.com/komari-monitor/komari/internal/managedconfig"
	"github.com/komari-monitor/komari/utils/messageSender"
	"github.com/komari-monitor/komari/utils/messageSender/javascript"
	"github.com/komari-monitor/komari/utils/messageSender/webhook"

	_ "github.com/komari-monitor/komari/utils/messageSender/bark"
	_ "github.com/komari-monitor/komari/utils/messageSender/email"
	_ "github.com/komari-monitor/komari/utils/messageSender/empty"
	_ "github.com/komari-monitor/komari/utils/messageSender/serverchan3"
	_ "github.com/komari-monitor/komari/utils/messageSender/serverchanturbo"
	_ "github.com/komari-monitor/komari/utils/messageSender/telegram"
)

// Initialize registers the built-in channels and seeds their defaults.
func Initialize() (err error) {
	if err := webhook.Register(); err != nil {
		return err
	}
	registered := []string{"webhook"}
	defer func() {
		if err != nil {
			for _, id := range registered {
				err = errors.Join(err, messageSender.UnregisterNotificationChannel(id))
			}
		}
	}()
	if err := javascript.Register(); err != nil {
		return err
	}
	registered = append(registered, javascript.ChannelID)
	messageSender.RegisterFactoryChannels()
	for _, item := range messageSender.ListNotificationChannels() {
		if _, err := database.GetMessageSenderConfigByName(item.ID); err == nil {
			continue
		}
		values := map[string]any{}
		for _, field := range managedconfig.Items(item.Configuration) {
			if field.Key != "" {
				values[field.Key] = managedconfig.DefaultValue(field)
			}
		}
		raw, err := json.Marshal(values)
		if err != nil {
			return err
		}
		if err := database.SaveMessageSenderConfig(&models.MessageSenderProvider{
			Name:     item.ID,
			Addition: string(raw),
		}); err != nil {
			return err
		}
	}
	return nil
}

// Shutdown unregisters the built-in channels and releases their runtimes.
func Shutdown() error {
	var err error
	for _, ch := range messageSender.ListNotificationChannels() {
		err = errors.Join(err, messageSender.UnregisterNotificationChannel(ch.ID))
	}
	return err
}
