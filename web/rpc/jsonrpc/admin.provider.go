package jsonrpc

import (
	"context"
	"encoding/json"

	"github.com/komari-monitor/komari/database"
	"github.com/komari-monitor/komari/database/models"
	"github.com/komari-monitor/komari/internal/config"
	"github.com/komari-monitor/komari/pkg/rpc"
	"github.com/komari-monitor/komari/utils/item"
	"github.com/komari-monitor/komari/utils/messageSender"
	msfactory "github.com/komari-monitor/komari/utils/messageSender/factory"
	"github.com/komari-monitor/komari/web/oauth"
	oauthfactory "github.com/komari-monitor/komari/web/oauth/factory"
)

// admin.provider.go
// 消息发送器与 OIDC 提供者配置 RPC2 方法（admin 命名空间）。

func init() {
	reg("getMessageSenderProvider", adminGetMessageSender, "Get message sender provider config or templates")
	reg("setMessageSenderProvider", adminSetMessageSender, "Set message sender provider config")
	reg("listNotificationChannels", adminListNotificationChannels, "List all available notification channels with configurations")
	reg("getNotificationChannelConfiguration", adminGetNotificationChannelConfiguration, "Get configuration schema and saved values for a notification channel")
	reg("setNotificationChannelConfiguration", adminSetNotificationChannelConfiguration, "Save configuration values for a notification channel")
	reg("getOidcProvider", adminGetOidc, "Get OIDC provider config or templates")
	reg("setOidcProvider", adminSetOidc, "Set OIDC provider config")
}

func buildChannelConfiguration(sender msfactory.IMessageSender) models.Configuration {
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
	return models.Configuration{
		Type: models.ThemeConfigurationManaged,
		Name: sender.GetName(),
		Data: formItems,
	}
}

func adminListNotificationChannels(_ context.Context, _ *rpc.JsonRpcRequest) (any, *rpc.JsonRpcError) {
	senders := msfactory.GetAllMessageSenders()
	type channelItem struct {
		ID            string               `json:"id"`
		Configuration models.Configuration `json:"configuration"`
	}
	var result []channelItem
	for name, sender := range senders {
		result = append(result, channelItem{
			ID:            name,
			Configuration: buildChannelConfiguration(sender),
		})
	}
	return result, nil
}

func adminGetNotificationChannelConfiguration(_ context.Context, req *rpc.JsonRpcRequest) (any, *rpc.JsonRpcError) {
	var params struct {
		ID string `json:"id"`
	}
	req.BindParams(&params)
	if params.ID == "" {
		return nil, rpc.MakeError(rpc.InvalidParams, "id is required", nil)
	}
	senders := msfactory.GetAllMessageSenders()
	sender, exists := senders[params.ID]
	if !exists {
		constructor, hasConstructor := msfactory.GetConstructor(params.ID)
		if !hasConstructor {
			return nil, rpc.MakeError(rpc.NotFound, "Notification channel not found", nil)
		}
		sender = constructor()
	}
	configuration := buildChannelConfiguration(sender)
	var values map[string]any = make(map[string]any)
	cfg, err := database.GetMessageSenderConfigByName(params.ID)
	if err == nil && cfg != nil && cfg.Addition != "" {
		_ = json.Unmarshal([]byte(cfg.Addition), &values)
	}
	return map[string]any{
		"configuration": configuration,
		"data":          values,
	}, nil
}

func adminSetNotificationChannelConfiguration(_ context.Context, req *rpc.JsonRpcRequest) (any, *rpc.JsonRpcError) {
	var params struct {
		ID   string         `json:"id"`
		Data map[string]any `json:"data"`
	}
	if err := req.BindParams(&params); err != nil {
		return nil, rpc.MakeError(rpc.InvalidParams, "Invalid configuration: "+err.Error(), nil)
	}
	if params.ID == "" {
		return nil, rpc.MakeError(rpc.InvalidParams, "id is required", nil)
	}
	if _, exists := msfactory.GetConstructor(params.ID); !exists {
		return nil, rpc.MakeError(rpc.NotFound, "Notification channel not found: "+params.ID, nil)
	}
	if params.Data == nil {
		params.Data = make(map[string]any)
	}
	additionBytes, err := json.Marshal(params.Data)
	if err != nil {
		return nil, rpc.MakeError(rpc.InvalidParams, "Failed to marshal configuration data: "+err.Error(), nil)
	}
	senderConfig := models.MessageSenderProvider{
		Name:     params.ID,
		Addition: string(additionBytes),
	}
	if err := database.SaveMessageSenderConfig(&senderConfig); err != nil {
		return nil, rpc.MakeError(rpc.InternalError, "Failed to save notification channel configuration: "+err.Error(), nil)
	}
	method, _ := config.GetAs[string](config.NotificationMethodKey, "none")
	if method == params.ID {
		if err := messageSender.LoadProvider(params.ID, senderConfig.Addition); err != nil {
			return nil, rpc.MakeError(rpc.InternalError, "Failed to load notification channel provider: "+err.Error(), nil)
		}
	}
	return map[string]any{"message": "Notification channel configuration saved successfully"}, nil
}

func adminGetMessageSender(_ context.Context, req *rpc.JsonRpcRequest) (any, *rpc.JsonRpcError) {
	var params struct {
		Provider string `json:"provider"`
	}
	req.BindParams(&params)
	if params.Provider != "" {
		cfg, err := database.GetMessageSenderConfigByName(params.Provider)
		if err != nil {
			return nil, rpc.MakeError(rpc.NotFound, "Provider not found: "+err.Error(), nil)
		}
		return cfg, nil
	}
	providers := msfactory.GetSenderConfigs()
	if len(providers) == 0 {
		return nil, rpc.MakeError(rpc.NotFound, "No message sender providers found", nil)
	}
	return providers, nil
}

func adminSetMessageSender(_ context.Context, req *rpc.JsonRpcRequest) (any, *rpc.JsonRpcError) {
	var senderConfig models.MessageSenderProvider
	if err := req.BindParams(&senderConfig); err != nil {
		return nil, rpc.MakeError(rpc.InvalidParams, "Invalid configuration: "+err.Error(), nil)
	}
	if senderConfig.Name == "" {
		return nil, rpc.MakeError(rpc.InvalidParams, "Provider name is required", nil)
	}
	if _, exists := msfactory.GetConstructor(senderConfig.Name); !exists {
		return nil, rpc.MakeError(rpc.NotFound, "Provider not found: "+senderConfig.Name, nil)
	}
	if err := database.SaveMessageSenderConfig(&senderConfig); err != nil {
		return nil, rpc.MakeError(rpc.InternalError, "Failed to save message sender provider configuration: "+err.Error(), nil)
	}
	method, _ := config.GetAs[string](config.NotificationMethodKey, "none")
	if method == senderConfig.Name { // 正在使用，重载
		if err := messageSender.LoadProvider(senderConfig.Name, senderConfig.Addition); err != nil {
			return nil, rpc.MakeError(rpc.InternalError, "Failed to load message sender provider: "+err.Error(), nil)
		}
	}
	return map[string]any{"message": "Message sender provider set successfully"}, nil
}

func adminGetOidc(_ context.Context, req *rpc.JsonRpcRequest) (any, *rpc.JsonRpcError) {
	var params struct {
		Provider string `json:"provider"`
	}
	req.BindParams(&params)
	if params.Provider != "" {
		cfg, err := database.GetOidcConfigByName(params.Provider)
		if err != nil {
			return nil, rpc.MakeError(rpc.NotFound, "Provider not found: "+err.Error(), nil)
		}
		return cfg, nil
	}
	providers := oauthfactory.GetProviderConfigs()
	if len(providers) == 0 {
		return nil, rpc.MakeError(rpc.NotFound, "No OIDC providers found", nil)
	}
	return providers, nil
}

func adminSetOidc(_ context.Context, req *rpc.JsonRpcRequest) (any, *rpc.JsonRpcError) {
	var oidcConfig models.OidcProvider
	if err := req.BindParams(&oidcConfig); err != nil {
		return nil, rpc.MakeError(rpc.InvalidParams, "Invalid configuration: "+err.Error(), nil)
	}
	if oidcConfig.Name == "" {
		return nil, rpc.MakeError(rpc.InvalidParams, "Provider name is required", nil)
	}
	if _, exists := oauthfactory.GetConstructor(oidcConfig.Name); !exists {
		return nil, rpc.MakeError(rpc.NotFound, "Provider not found: "+oidcConfig.Name, nil)
	}
	if err := database.SaveOidcConfig(&oidcConfig); err != nil {
		return nil, rpc.MakeError(rpc.InternalError, "Failed to save OIDC provider configuration: "+err.Error(), nil)
	}
	provider, _ := config.GetAs[string](config.OAuthProviderKey, "github")
	if provider == oidcConfig.Name { // 正在使用，重载
		if err := oauth.LoadProvider(oidcConfig.Name, oidcConfig.Addition); err != nil {
			return nil, rpc.MakeError(rpc.InternalError, "Failed to load OIDC provider: "+err.Error(), nil)
		}
	}
	return map[string]any{"message": "OIDC provider set successfully"}, nil
}
