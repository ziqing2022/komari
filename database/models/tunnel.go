package models

import "time"

// TunnelRule 节点网络隧道 / 端口映射 / 代理节点协议模型
type TunnelRule struct {
	Id               string    `json:"id" gorm:"type:varchar(64);primaryKey"`
	ClientUUID       string    `json:"client_uuid" gorm:"type:varchar(64);index;not null"`
	Name             string    `json:"name" gorm:"type:varchar(128);not null"`
	RuleType         string    `json:"rule_type" gorm:"type:varchar(32);not null;default:'forward'"` // forward, vless, socks5, shadowsocks, trojan, hysteria2
	ListenPort       int       `json:"listen_port" gorm:"type:int;not null"`
	Protocol         string    `json:"protocol" gorm:"type:varchar(16);not null;default:'tcp'"` // tcp, udp, both
	TargetType       string    `json:"target_type" gorm:"type:varchar(16);not null;default:'local'"` // local, custom
	TargetHost       string    `json:"target_host" gorm:"type:varchar(255);not null;default:'127.0.0.1'"`
	TargetPort       int       `json:"target_port" gorm:"type:int;not null"`
	AutoOpenFirewall bool      `json:"auto_open_firewall" gorm:"not null;default:true"`
	Enabled          bool      `json:"enabled" gorm:"not null;default:true"`
	Status           string    `json:"status" gorm:"type:varchar(32);default:'active'"`
	LastMessage      string    `json:"last_message" gorm:"type:text"`

	// 高级协议专用字段 (VLESS / SOCKS5 / Shadowsocks / Trojan / Hysteria2)
	UUID       string `json:"uuid" gorm:"type:varchar(64)"`
	Password   string `json:"password" gorm:"type:varchar(255)"`
	Username   string `json:"username" gorm:"type:varchar(64)"`
	Method     string `json:"method" gorm:"type:varchar(64)"` // shadowsocks 加密方式
	SNI        string `json:"sni" gorm:"type:varchar(255)"` // 伪装域名 / server_name
	PrivateKey string `json:"private_key" gorm:"type:varchar(255)"` // Reality x25519 私钥
	PublicKey  string `json:"public_key" gorm:"type:varchar(255)"` // Reality x25519 公钥 (用于生成客户端链接)
	ShortID    string `json:"short_id" gorm:"type:varchar(64)"` // Reality Short ID
	Fingerprint string `json:"fingerprint" gorm:"type:varchar(64);default:'ios'"` // Reality 客户端 TLS 指纹 (ios, edge, chrome, random)

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
