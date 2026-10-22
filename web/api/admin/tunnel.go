package admin

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/komari-monitor/komari/database/dbcore"
	"github.com/komari-monitor/komari/database/models"
	agent_runtime "github.com/komari-monitor/komari/web/agent"
	"github.com/komari-monitor/komari/web/api"
)

type TunnelRuleInput struct {
	Id               string `json:"id"`
	ClientUUID       string `json:"client_uuid"`
	Name             string `json:"name"`
	RuleType         string `json:"rule_type"` // forward, vless, socks5, shadowsocks, trojan, hysteria2
	ListenPort       int    `json:"listen_port"`
	Protocol         string `json:"protocol"` // tcp, udp, both
	TargetType       string `json:"target_type"` // local, custom
	TargetHost       string `json:"target_host"`
	TargetPort       int    `json:"target_port"`
	AutoOpenFirewall *bool  `json:"auto_open_firewall"`
	Enabled          *bool  `json:"enabled"`

	// 高级协议专用字段
	UUID       string `json:"uuid"`
	Password   string `json:"password"`
	Username   string `json:"username"`
	Method     string `json:"method"`
	SNI        string `json:"sni"`
	PrivateKey string `json:"private_key"`
	PublicKey  string `json:"public_key"`
	ShortID    string `json:"short_id"`
	Fingerprint string `json:"fingerprint"`

	// 跨节点反向穿透专用字段
	IsReverse        *bool  `json:"is_reverse"`
	BridgeClientUUID string `json:"bridge_client_uuid"`
	BridgeHost       string `json:"bridge_host"`
	BridgePort       int    `json:"bridge_port"`
	ControlPort      int    `json:"control_port"`
	TunnelSecret     string `json:"tunnel_secret"`
}

// ListTunnels 获取指定节点或全部节点的隧道与代理规则列表
func ListTunnels(c *gin.Context) {
	clientUUID := c.Query("client_uuid")
	db := dbcore.GetDBInstance()
	var rules []models.TunnelRule

	query := db.Order("created_at desc")
	if clientUUID != "" {
		query = query.Where("client_uuid = ?", clientUUID)
	}
	if err := query.Find(&rules).Error; err != nil {
		api.RespondError(c, http.StatusInternalServerError, "Failed to query tunnels: "+err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "",
		"data":    rules,
		"rules":   rules,
	})
}

// GenerateTunnelKeys 一键生成 VLESS Reality / SOCKS5 / Shadowsocks 随机凭据
func GenerateTunnelKeys(c *gin.Context) {
	// 生成 UUID
	newUUID := uuid.New().String()

	// 生成 X25519 密钥对 (Reality) - 使用与 sing-box 官方完全一致的标准 ecdh
	privKey, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "message": err.Error()})
		return
	}
	privKeyBase64 := base64.RawURLEncoding.EncodeToString(privKey.Bytes())
	pubKeyBase64 := base64.RawURLEncoding.EncodeToString(privKey.PublicKey().Bytes())

	// 生成 8 字节 Hex ShortID
	shortIDBytes := make([]byte, 4)
	_, _ = rand.Read(shortIDBytes)
	shortID := hex.EncodeToString(shortIDBytes)

	// 生成通用密码 (16 字节标准 Base64 密钥，完美兼容 Shadowsocks-2022 与传统 SS)
	passBytes := make([]byte, 16)
	_, _ = rand.Read(passBytes)
	passStr := base64.StdEncoding.EncodeToString(passBytes)

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data": gin.H{
			"uuid":        newUUID,
			"private_key": privKeyBase64,
			"public_key":  pubKeyBase64,
			"short_id":    shortID,
			"password":    passStr,
			"default_sni": "gateway.icloud.com",
			"fingerprint": "ios",
		},
	})
}

// CreateTunnel 创建新的隧道规则并同步下发给 Agent
func CreateTunnel(c *gin.Context) {
	var input TunnelRuleInput
	if err := c.ShouldBindJSON(&input); err != nil {
		api.RespondError(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	if input.ClientUUID == "" || input.Name == "" || input.ListenPort <= 0 || input.ListenPort > 65535 {
		api.RespondError(c, http.StatusBadRequest, "Client, name and valid listen port (1-65535) are required")
		return
	}

	ruleType := strings.ToLower(strings.TrimSpace(input.RuleType))
	if ruleType == "" {
		ruleType = "forward"
	}

	targetType := input.TargetType
	if targetType != "custom" {
		targetType = "local"
	}
	targetHost := strings.TrimSpace(input.TargetHost)
	if targetType == "local" || targetHost == "" {
		targetHost = "127.0.0.1"
	}
	targetPort := input.TargetPort
	if targetPort <= 0 {
		targetPort = input.ListenPort
	}
	if targetPort > 65535 {
		api.RespondError(c, http.StatusBadRequest, "Target port must be between 1 and 65535")
		return
	}
	protocol := strings.ToLower(strings.TrimSpace(input.Protocol))
	if protocol == "" {
		protocol = "tcp"
	}

	autoOpenFirewall := true
	if input.AutoOpenFirewall != nil {
		autoOpenFirewall = *input.AutoOpenFirewall
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}

	// 跨节点反向穿透逻辑
	isReverse := false
	if input.IsReverse != nil {
		isReverse = *input.IsReverse
	}
	bridgeClientUUID := strings.TrimSpace(input.BridgeClientUUID)
	bridgeHost := strings.TrimSpace(input.BridgeHost)
	bridgePort := input.BridgePort
	if isReverse && bridgePort <= 0 {
		bridgePort = input.ListenPort
	}
	if isReverse && (bridgePort <= 0 || bridgePort > 65535) {
		api.RespondError(c, http.StatusBadRequest, "Bridge port must be between 1 and 65535")
		return
	}
	controlPort := input.ControlPort
	if isReverse && controlPort <= 0 {
		controlPort = 27888
	}
	if isReverse && (controlPort <= 0 || controlPort > 65535) {
		api.RespondError(c, http.StatusBadRequest, "Control port must be between 1 and 65535")
		return
	}
	tunnelSecret := strings.TrimSpace(input.TunnelSecret)
	if isReverse && tunnelSecret == "" {
		secBytes := make([]byte, 16)
		_, _ = rand.Read(secBytes)
		tunnelSecret = hex.EncodeToString(secBytes)
	}

	db := dbcore.GetDBInstance()
	if isReverse && bridgeClientUUID != "" && bridgeClientUUID != "custom" && bridgeHost == "" {
		var bridgeClient models.Client
		if err := db.Where("uuid = ?", bridgeClientUUID).First(&bridgeClient).Error; err == nil {
			bridgeHost = bridgeClient.IPv4
		}
	}

	id := input.Id
	if id == "" {
		id = fmt.Sprintf("tunnel-%d", time.Now().UnixNano()/1e6)
	}

	rule := models.TunnelRule{
		Id:               id,
		ClientUUID:       input.ClientUUID,
		Name:             input.Name,
		RuleType:         ruleType,
		ListenPort:       input.ListenPort,
		Protocol:         protocol,
		TargetType:       targetType,
		TargetHost:       targetHost,
		TargetPort:       targetPort,
		AutoOpenFirewall: autoOpenFirewall,
		Enabled:          enabled,
		Status:           "active",
		UUID:             input.UUID,
		Password:         input.Password,
		Username:         input.Username,
		Method:           input.Method,
		SNI:              input.SNI,
		PrivateKey:       input.PrivateKey,
		PublicKey:        input.PublicKey,
		ShortID:          input.ShortID,
		Fingerprint:      input.Fingerprint,
		IsReverse:        isReverse,
		BridgeClientUUID: bridgeClientUUID,
		BridgeHost:       bridgeHost,
		BridgePort:       bridgePort,
		ControlPort:      controlPort,
		TunnelSecret:     tunnelSecret,
		CreatedAt:        time.Now().UTC(),
		UpdatedAt:        time.Now().UTC(),
	}

	if err := db.Create(&rule).Error; err != nil {
		api.RespondError(c, http.StatusInternalServerError, "Failed to create tunnel: "+err.Error())
		return
	}

	// 实时下发至 Target Node (内网端)
	_ = agent_runtime.SyncClientTunnels(rule.ClientUUID)
	// 若为反向穿透且 Bridge 为已有节点，同时实时下发至 Bridge Node (公网端)
	if rule.IsReverse && rule.BridgeClientUUID != "" && rule.BridgeClientUUID != "custom" {
		_ = agent_runtime.SyncClientTunnels(rule.BridgeClientUUID)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Tunnel created successfully",
		"data":    rule,
	})
}

// UpdateTunnel 更新隧道配置并同步下发给 Agent
func UpdateTunnel(c *gin.Context) {
	id := c.Param("id")
	var input TunnelRuleInput
	if err := c.ShouldBindJSON(&input); err != nil {
		api.RespondError(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	db := dbcore.GetDBInstance()
	var rule models.TunnelRule
	if err := db.Where("id = ?", id).First(&rule).Error; err != nil {
		api.RespondError(c, http.StatusNotFound, "Tunnel rule not found")
		return
	}

	if input.Name != "" {
		rule.Name = input.Name
	}
	if input.RuleType != "" {
		rule.RuleType = strings.ToLower(input.RuleType)
	}
	if input.ListenPort > 0 {
		if input.ListenPort > 65535 {
			api.RespondError(c, http.StatusBadRequest, "Listen port must be between 1 and 65535")
			return
		}
		rule.ListenPort = input.ListenPort
	}
	if input.Protocol != "" {
		rule.Protocol = strings.ToLower(input.Protocol)
	}
	if input.TargetType != "" {
		rule.TargetType = input.TargetType
	}
	if input.TargetHost != "" {
		rule.TargetHost = input.TargetHost
	}
	if rule.TargetType == "local" {
		rule.TargetHost = "127.0.0.1"
	}
	if input.TargetPort > 0 {
		if input.TargetPort > 65535 {
			api.RespondError(c, http.StatusBadRequest, "Target port must be between 1 and 65535")
			return
		}
		rule.TargetPort = input.TargetPort
	}
	if input.AutoOpenFirewall != nil {
		rule.AutoOpenFirewall = *input.AutoOpenFirewall
	}
	if input.Enabled != nil {
		rule.Enabled = *input.Enabled
	}

	// 更新高级协议字段
	if input.UUID != "" {
		rule.UUID = input.UUID
	}
	if input.Password != "" {
		rule.Password = input.Password
	}
	if input.Username != "" {
		rule.Username = input.Username
	}
	if input.Method != "" {
		rule.Method = input.Method
	}
	if input.SNI != "" {
		rule.SNI = input.SNI
	}
	if input.PrivateKey != "" {
		rule.PrivateKey = input.PrivateKey
	}
	if input.PublicKey != "" {
		rule.PublicKey = input.PublicKey
	}
	if input.ShortID != "" {
		rule.ShortID = input.ShortID
	}
	if input.Fingerprint != "" {
		rule.Fingerprint = input.Fingerprint
	}

	// 更新反向穿透字段
	oldBridgeUUID := rule.BridgeClientUUID
	if input.IsReverse != nil {
		rule.IsReverse = *input.IsReverse
	}
	if input.BridgeClientUUID != "" {
		rule.BridgeClientUUID = input.BridgeClientUUID
	}
	if input.BridgeHost != "" {
		rule.BridgeHost = input.BridgeHost
	}
	if rule.IsReverse && rule.BridgeClientUUID != "" && rule.BridgeClientUUID != "custom" && rule.BridgeHost == "" {
		var bridgeClient models.Client
		if err := db.Where("uuid = ?", rule.BridgeClientUUID).First(&bridgeClient).Error; err == nil {
			rule.BridgeHost = bridgeClient.IPv4
		}
	}
	if input.BridgePort > 0 {
		if input.BridgePort > 65535 {
			api.RespondError(c, http.StatusBadRequest, "Bridge port must be between 1 and 65535")
			return
		}
		rule.BridgePort = input.BridgePort
	}
	if input.ControlPort > 0 {
		if input.ControlPort > 65535 {
			api.RespondError(c, http.StatusBadRequest, "Control port must be between 1 and 65535")
			return
		}
		rule.ControlPort = input.ControlPort
	}
	if input.TunnelSecret != "" {
		rule.TunnelSecret = input.TunnelSecret
	}

	rule.UpdatedAt = time.Now().UTC()

	if err := db.Save(&rule).Error; err != nil {
		api.RespondError(c, http.StatusInternalServerError, "Failed to update tunnel: "+err.Error())
		return
	}

	_ = agent_runtime.SyncClientTunnels(rule.ClientUUID)
	if rule.IsReverse && rule.BridgeClientUUID != "" && rule.BridgeClientUUID != "custom" {
		_ = agent_runtime.SyncClientTunnels(rule.BridgeClientUUID)
	}
	if oldBridgeUUID != "" && oldBridgeUUID != rule.BridgeClientUUID && oldBridgeUUID != "custom" {
		_ = agent_runtime.SyncClientTunnels(oldBridgeUUID)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Tunnel updated successfully",
		"data":    rule,
	})
}

// DeleteTunnel 删除隧道规则并触发 Agent 释放端口与防火墙规则
func DeleteTunnel(c *gin.Context) {
	id := c.Param("id")
	db := dbcore.GetDBInstance()
	var rule models.TunnelRule
	if err := db.Where("id = ?", id).First(&rule).Error; err != nil {
		api.RespondError(c, http.StatusNotFound, "Tunnel rule not found")
		return
	}

	clientUUID := rule.ClientUUID
	bridgeUUID := rule.BridgeClientUUID
	isReverse := rule.IsReverse

	if err := db.Delete(&rule).Error; err != nil {
		api.RespondError(c, http.StatusInternalServerError, "Failed to delete tunnel: "+err.Error())
		return
	}

	_ = agent_runtime.SyncClientTunnels(clientUUID)
	if isReverse && bridgeUUID != "" && bridgeUUID != "custom" {
		_ = agent_runtime.SyncClientTunnels(bridgeUUID)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Tunnel deleted successfully",
	})
}

// ToggleTunnel 一键暂停或启用隧道
func ToggleTunnel(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		api.RespondError(c, http.StatusBadRequest, "Invalid request payload")
		return
	}

	db := dbcore.GetDBInstance()
	var rule models.TunnelRule
	if err := db.Where("id = ?", id).First(&rule).Error; err != nil {
		api.RespondError(c, http.StatusNotFound, "Tunnel rule not found")
		return
	}

	rule.Enabled = req.Enabled
	rule.UpdatedAt = time.Now().UTC()
	if err := db.Save(&rule).Error; err != nil {
		api.RespondError(c, http.StatusInternalServerError, "Failed to toggle tunnel: "+err.Error())
		return
	}

	_ = agent_runtime.SyncClientTunnels(rule.ClientUUID)
	if rule.IsReverse && rule.BridgeClientUUID != "" && rule.BridgeClientUUID != "custom" {
		_ = agent_runtime.SyncClientTunnels(rule.BridgeClientUUID)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Tunnel toggled successfully",
		"data":    rule,
	})
}
