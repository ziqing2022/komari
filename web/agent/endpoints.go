package agent

import (
	"strings"

	"github.com/komari-monitor/komari/internal/config"
	v2 "github.com/komari-monitor/komari/protocol/v2"
)

// GetConfiguredEndpoints 获取主控配置的主备端点列表
func GetConfiguredEndpoints() []string {
	var endpoints []string
	primary, _ := config.GetAs[string]("agent_primary_endpoint")
	if primary == "" {
		primary, _ = config.GetAs[string]("script_domain")
	}
	primary = strings.TrimSpace(primary)
	if primary != "" {
		endpoints = append(endpoints, primary)
	}

	backupsStr, _ := config.GetAs[string]("agent_backup_endpoints")
	for _, ep := range strings.Split(backupsStr, "\n") {
		for _, part := range strings.Split(ep, ",") {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				endpoints = append(endpoints, trimmed)
			}
		}
	}
	return endpoints
}

// SyncClientEndpoints 向指定客户端下发主备地址池
func SyncClientEndpoints(clientUUID string) {
	if clientUUID == "" {
		return
	}
	eps := GetConfiguredEndpoints()
	if len(eps) == 0 {
		return
	}
	DispatchV2Event(clientUUID, v2.MethodAgentEndpoints, v2.EndpointsParams{
		Endpoints: eps,
	})
}

// SyncAllClientEndpoints 广播向所有在线客户端下发最新地址池
func SyncAllClientEndpoints() {
	eps := GetConfiguredEndpoints()
	if len(eps) == 0 {
		return
	}
	for _, uuid := range GetAllOnlineUUIDs() {
		DispatchV2Event(uuid, v2.MethodAgentEndpoints, v2.EndpointsParams{
			Endpoints: eps,
		})
	}
}
