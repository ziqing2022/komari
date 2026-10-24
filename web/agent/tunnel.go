package agent

import (
	"fmt"
	"sync"

	"github.com/komari-monitor/komari/database/dbcore"
	"github.com/komari-monitor/komari/database/models"
	v2 "github.com/komari-monitor/komari/protocol/v2"
)

var (
	tunnelRulesMu         sync.RWMutex
	targetRulesCache      map[string][]models.TunnelRule // clientUUID -> rules
	bridgeRulesCache      map[string][]models.TunnelRule // bridgeClientUUID -> rules
	tunnelRulesCacheReady bool
)

// InvalidateTunnelRulesCache 清除/刷新隧道规则缓存
func InvalidateTunnelRulesCache() {
	tunnelRulesMu.Lock()
	tunnelRulesCacheReady = false
	tunnelRulesMu.Unlock()
}

func getCachedRules(clientUUID string) ([]models.TunnelRule, []models.TunnelRule, error) {
	tunnelRulesMu.RLock()
	ready := tunnelRulesCacheReady
	var target []models.TunnelRule
	var bridge []models.TunnelRule
	if ready {
		target = targetRulesCache[clientUUID]
		bridge = bridgeRulesCache[clientUUID]
	}
	tunnelRulesMu.RUnlock()

	if ready {
		return target, bridge, nil
	}

	// 缓存未初始化或已失效，从数据库全量加载（隧道规则表体量通常极小，仅数条至数十条）
	db := dbcore.GetDBInstance()
	var allRules []models.TunnelRule
	if err := db.Find(&allRules).Error; err != nil {
		return nil, nil, err
	}

	newTarget := make(map[string][]models.TunnelRule)
	newBridge := make(map[string][]models.TunnelRule)
	for _, r := range allRules {
		newTarget[r.ClientUUID] = append(newTarget[r.ClientUUID], r)
		if r.IsReverse && r.BridgeClientUUID != "" {
			newBridge[r.BridgeClientUUID] = append(newBridge[r.BridgeClientUUID], r)
		}
	}

	tunnelRulesMu.Lock()
	targetRulesCache = newTarget
	bridgeRulesCache = newBridge
	tunnelRulesCacheReady = true
	target = targetRulesCache[clientUUID]
	bridge = bridgeRulesCache[clientUUID]
	tunnelRulesMu.Unlock()

	return target, bridge, nil
}

// SyncClientTunnels 向指定客户端同步下发其配置的全部隧道规则
func SyncClientTunnels(clientUUID string) error {
	if clientUUID == "" {
		return fmt.Errorf("client uuid is empty")
	}

	targetRules, bridgeRules, err := getCachedRules(clientUUID)
	if err != nil {
		return err
	}

	if len(targetRules) == 0 && len(bridgeRules) == 0 {
		return nil
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
