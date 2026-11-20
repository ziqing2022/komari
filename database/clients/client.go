package clients

import (
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/komari-monitor/komari/database/dbcore"
	"github.com/komari-monitor/komari/database/models"
	"github.com/komari-monitor/komari/database/tasks"
	logger "github.com/komari-monitor/komari/utils/log"

	"github.com/google/uuid"
)

var basicInfoFingerprints sync.Map // clientUUID (string) -> string fingerprint

func InvalidateClientBasicInfoFingerprint(clientUUID string) {
	if clientUUID != "" {
		basicInfoFingerprints.Delete(clientUUID)
	}
}

func clientInfoFingerprint(m map[string]interface{}) string {
	return fmt.Sprintf("%v|%v|%v|%v|%v|%v|%v|%v|%v|%v|%v|%v|%v|%v|%v|%v",
		m["cpu_name"], m["cpu_cores"], m["cpu_physical_cores"], m["arch"],
		m["os"], m["kernel_version"], m["ipv4"], m["ipv6"],
		m["mem_total"], m["swap_total"], m["disk_total"],
		m["gpu_name"], m["virtualization"], m["version"],
		m["region"], m["container_id"],
	)
}

func DeleteClient(clientUuid string) error {
	InvalidateClientBasicInfoFingerprint(clientUuid)
	return dbcore.GetDBInstance().Delete(&models.Client{}, "uuid = ?", clientUuid).Error
}

func SaveClientInfo(update map[string]interface{}) error {
	clientUUID, ok := update["uuid"].(string)
	if !ok || clientUUID == "" {
		return fmt.Errorf("invalid client UUID")
	}

	fp := clientInfoFingerprint(update)
	if prev, ok := basicInfoFingerprints.Load(clientUUID); ok && prev.(string) == fp {
		// 客户端基础硬件与网络信息未发生变化，跳过高频 SQLite 磁盘写事务，避免锁争抢与性能抖动
		return nil
	}

	db := dbcore.GetDBInstance()
	update["updated_at"] = time.Now().UTC()

	toFloat64 := func(value interface{}) (float64, bool) {
		switch v := value.(type) {
		case float64:
			return v, true
		case int:
			return float64(v), true
		case int64:
			return float64(v), true
		default:
			return 0, false
		}
	}

	if memTotal, exists := update["mem_total"]; exists {
		if val, ok := toFloat64(memTotal); ok {
			if val < 0 || val > math.MaxInt64-1 {
				return fmt.Errorf("invalid mem_total: %v", memTotal)
			}
		}
	}

	if swapTotal, exists := update["swap_total"]; exists {
		if val, ok := toFloat64(swapTotal); ok {
			if val < 0 || val > math.MaxInt64-1 {
				return fmt.Errorf("invalid swap_total: %v", swapTotal)
			}
		}
	}

	if diskTotal, exists := update["disk_total"]; exists {
		if val, ok := toFloat64(diskTotal); ok {
			if val < 0 || val > math.MaxInt64-1 {
				return fmt.Errorf("invalid disk_total: %v", diskTotal)
			}
		}
	}

	if cpuCores, exists := update["cpu_cores"]; exists {
		if val, ok := cpuCores.(int); ok {
			if val < 0 || val > math.MaxInt32-1 {
				return fmt.Errorf("invalid cpu_cores: %v", cpuCores)
			}
		}
	}

	if cpuPhysicalCores, exists := update["cpu_physical_cores"]; exists {
		if val, ok := cpuPhysicalCores.(int); ok {
			if val < 0 || val > math.MaxInt32-1 {
				return fmt.Errorf("invalid cpu_physical_cores: %v", cpuPhysicalCores)
			}
		}
	}

	if gpuCount, exists := update["gpu_count"]; exists {
		if val, ok := gpuCount.(int); ok {
			if val < 0 || val > math.MaxInt32-1 {
				return fmt.Errorf("invalid gpu_count: %v", gpuCount)
			}
		}
	}

	if err := db.Model(&models.Client{}).Where("uuid = ?", clientUUID).Updates(update).Error; err != nil {
		return err
	}
	basicInfoFingerprints.Store(clientUUID, fp)
	return nil
}

// CreateClient 创建新客户端
func CreateClient() (clientUUID, token string, err error) {
	db := dbcore.GetDBInstance()
	clientUUID = uuid.New().String()
	token = uuid.New().String()

	client := models.Client{
		UUID:      clientUUID,
		Token:     token,
		UpdatedAt: time.Now().UTC(),
	}

	if err := db.Create(&client).Error; err != nil {
		return "", "", err
	}
	if err := tasks.AddDefaultOnClientUUID(clientUUID); err != nil {
		logger.Error("client", "failed to add default tasks on client creation", "error", err, "client", clientUUID)
	}
	return clientUUID, token, nil
}

func CreateClientWithName(name string) (clientUUID, token string, err error) {
	db := dbcore.GetDBInstance()
	clientUUID = uuid.New().String()
	token = uuid.New().String()

	client := models.Client{
		UUID:      clientUUID,
		Name:      name,
		Token:     token,
		UpdatedAt: time.Now().UTC(),
	}

	if err := db.Create(&client).Error; err != nil {
		return "", "", err
	}
	if err := tasks.AddDefaultOnClientUUID(clientUUID); err != nil {
		logger.Error("client", "failed to add default tasks on client creation", "error", err, "client", clientUUID)
	}
	return clientUUID, token, nil
}

func GetClientByUUID(uuid string) (models.Client, error) {
	var client models.Client
	if err := dbcore.GetDBInstance().Where("uuid = ?", uuid).First(&client).Error; err != nil {
		return models.Client{}, err
	}
	return client, nil
}

func GetClientTokenByUUID(uuid string) (string, error) {
	var client models.Client
	if err := dbcore.GetDBInstance().Where("uuid = ?", uuid).First(&client).Error; err != nil {
		return "", err
	}
	return client.Token, nil
}

func GetAllClientBasicInfo() ([]models.Client, error) {
	var clients []models.Client
	if err := dbcore.GetDBInstance().Find(&clients).Error; err != nil {
		return nil, err
	}
	return clients, nil
}

func SaveClient(updates map[string]interface{}) error {
	db := dbcore.GetDBInstance()
	clientUUID, ok := updates["uuid"].(string)
	if !ok || clientUUID == "" {
		return fmt.Errorf("invalid client UUID")
	}

	if v, exists := updates["traffic_limit"]; exists {
		if val, ok := v.(float64); ok {
			if val < 0 || val > math.MaxInt64-1 {
				return fmt.Errorf("invalid traffic_limit: %v", val)
			}
		}
	}

	if v, exists := updates["billing_cycle"]; exists {
		if val, ok := v.(int); ok {
			if val < 0 || val > math.MaxInt32-1 {
				return fmt.Errorf("invalid billing_cycle: %v", val)
			}
		}
	}

	if v, exists := updates["group"]; exists {
		if val, ok := v.(string); ok {
			if len(val) > 255 {
				return fmt.Errorf("invalid group: %v", val)
			}
		}
	}

	if v, exists := updates["weight"]; exists {
		if val, ok := v.(int); ok {
			if val < 0 || val > math.MaxInt32-1 {
				return fmt.Errorf("invalid weight: %v", val)
			}
		}
	}

	updates["updated_at"] = time.Now().UTC()

	return db.Model(&models.Client{}).Where("uuid = ?", clientUUID).Updates(updates).Error
}
