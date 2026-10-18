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
	var rules []models.TunnelRule
	if err := db.Where("client_uuid = ?", clientUUID).Find(&rules).Error; err != nil {
		return err
	}

	var protoRules []v2.TunnelRule
	for _, r := range rules {
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
