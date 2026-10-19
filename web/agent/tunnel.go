package agent

import (
	"fmt"

	"github.com/komari-monitor/komari/database/dbcore"
	"github.com/komari-monitor/komari/database/models"
	v2 "github.com/komari-monitor/komari/protocol/v2"
)

// SyncClientTunnels 向指定客户端同步下发其配置的全部隧道规则
func SyncClientTunnels(clientUUID string) error {
	if clientUUID == "" {
		return fmt.Errorf("client uuid is empty")
	}

	db := dbcore.GetDBInstance()
	// 1. 本机作为 Target (服务源头或正向转发宿主) 的规则
	var targetRules []models.TunnelRule
	if err := db.Where("client_uuid = ?", clientUUID).Find(&targetRules).Error; err != nil {
		return err
	}

	// 2. 本机作为 Bridge (公网暴露宿主) 的反向穿透规则
	var bridgeRules []models.TunnelRule
	if err := db.Where("bridge_client_uuid = ? AND is_reverse = ?", clientUUID, true).Find(&bridgeRules).Error; err != nil {
		return err
	}

	var protoRules []v2.TunnelRule
	for _, r := range targetRules {
		role := "target"
		if !r.IsReverse {
			role = ""
		}
		protoRules = append(protoRules, v2.TunnelRule{
			ID:               r.Id,
			Name:             r.Name,
			RuleType:         r.RuleType,
			ListenPort:       r.ListenPort,
			Protocol:         r.Protocol,
			TargetType:       r.TargetType,
			TargetHost:       r.TargetHost,
			TargetPort:       r.TargetPort,
			AutoOpenFirewall: r.AutoOpenFirewall,
			Enabled:          r.Enabled,
			UUID:             r.UUID,
			Password:         r.Password,
			Username:         r.Username,
			Method:           r.Method,
			SNI:              r.SNI,
			PrivateKey:       r.PrivateKey,
			PublicKey:        r.PublicKey,
			ShortID:          r.ShortID,
			IsReverse:        r.IsReverse,
			BridgeClientUUID: r.BridgeClientUUID,
			BridgeHost:       r.BridgeHost,
			BridgePort:       r.BridgePort,
			ControlPort:      r.ControlPort,
			TunnelSecret:     r.TunnelSecret,
			Role:             role,
		})
	}

	for _, r := range bridgeRules {
		protoRules = append(protoRules, v2.TunnelRule{
			ID:               r.Id,
			Name:             r.Name + " [公网入口]",
			RuleType:         r.RuleType,
			ListenPort:       r.BridgePort, // 公网机对外监听端口
			Protocol:         r.Protocol,
			TargetType:       r.TargetType,
			TargetHost:       r.TargetHost,
			TargetPort:       r.TargetPort,
			AutoOpenFirewall: r.AutoOpenFirewall,
			Enabled:          r.Enabled,
			UUID:             r.UUID,
			Password:         r.Password,
			Username:         r.Username,
			Method:           r.Method,
			SNI:              r.SNI,
			PrivateKey:       r.PrivateKey,
			PublicKey:        r.PublicKey,
			ShortID:          r.ShortID,
			IsReverse:        r.IsReverse,
			BridgeClientUUID: r.BridgeClientUUID,
			BridgeHost:       r.BridgeHost,
			BridgePort:       r.BridgePort,
			ControlPort:      r.ControlPort,
			TunnelSecret:     r.TunnelSecret,
			Role:             "bridge",
		})
	}

	// 通过 v2 事件下发给 Agent
	dispatched := DispatchV2Event(clientUUID, v2.MethodAgentTunnel, v2.TunnelConfigParams{
		Rules: protoRules,
	})

	if !dispatched {
		// 客户端离线时已存入 DB，等待其上线后在拉取/重连时生效
		return nil
	}

	return nil
}
