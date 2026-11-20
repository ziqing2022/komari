package admin

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/komari-monitor/komari/cmd/flags"
	"github.com/komari-monitor/komari/database/dbcore"
	logger "github.com/komari-monitor/komari/utils/log"
	"github.com/komari-monitor/komari/web/api"
)

// copyFile 复制单个文件到目标路径（会确保父目录存在）
func copyFile(srcPath, destPath string) error {
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return fmt.Errorf("failed to create parent directory: %v", err)
	}

	src, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("failed to open source file: %v", err)
	}
	defer src.Close()

	dest, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %v", err)
	}
	defer dest.Close()

	if _, err = io.Copy(dest, src); err != nil {
		return fmt.Errorf("failed to copy file: %v", err)
	}
	return nil
}

// addFileToZip 流式将单个文件写入 zip，无需在磁盘中转多份拷贝
func addFileToZip(zw *zip.Writer, srcPath, zipRelPath string, method uint16) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = filepath.ToSlash(zipRelPath)
	header.Method = method
	header.Modified = info.ModTime().UTC()

	w, err := zw.CreateHeader(header)
	if err != nil {
		return err
	}

	_, err = io.Copy(w, f)
	return err
}

// addDirToZip 流式将整个目录写入 zip
func addDirToZip(zw *zip.Writer, srcDir, zipRelDir string) error {
	return filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		zipPath := filepath.ToSlash(filepath.Join(zipRelDir, rel))
		if info.IsDir() {
			_, err := zw.CreateHeader(&zip.FileHeader{
				Name:     zipPath + "/",
				Method:   zip.Deflate,
				Modified: info.ModTime().UTC(),
			})
			return err
		}
		return addFileToZip(zw, path, zipPath, zip.Deflate)
	})
}

// writeBackupMarkup 追加备份标记文件到 zip。
func writeBackupMarkup(zipWriter *zip.Writer) error {
	now := time.Now().UTC()
	markupContent := "此文件为 Komari 备份标记文件，请勿删除。\nThis is a Komari backup markup file, please do not delete.\n\n备份时间 / Backup Time: " + now.Format(time.RFC3339Nano)
	markupWriter, err := zipWriter.CreateHeader(&zip.FileHeader{
		Name:     "komari-backup-markup",
		Method:   zip.Deflate,
		Modified: now,
	})
	if err != nil {
		return err
	}
	_, err = markupWriter.Write([]byte(markupContent))
	return err
}

// backupSQLiteTo 使用 SQLite VACUUM INTO 将当前数据库一致性备份到指定路径。
func backupSQLiteTo(destDBPath string) error {
	if err := os.MkdirAll(filepath.Dir(destDBPath), 0o755); err != nil {
		return fmt.Errorf("failed to create parent directory for db: %v", err)
	}

	// 确保目标文件不存在（VACUUM INTO 要求目标文件不存在）
	_ = os.Remove(destDBPath)

	db := dbcore.GetDBInstance()
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("failed to get underlying database connection: %v", err)
	}

	// 优先执行 PASSIVE checkpoint，将 WAL 中的数据安全合并到数据库主文件
	_, _ = sqlDB.Exec("PRAGMA wal_checkpoint(PASSIVE);")

	// Windows 下 VACUUM INTO 传绝对路径时，统一使用正斜杠避免路径解析歧义
	safePath := filepath.ToSlash(destDBPath)
	safePath = strings.ReplaceAll(safePath, "'", "''")
	vacuumSQL := fmt.Sprintf("VACUUM INTO '%s'", safePath)
	if _, err = sqlDB.Exec(vacuumSQL); err != nil {
		logger.Warnf("admin", "sqlite VACUUM INTO failed (%v), falling back to wal_checkpoint and direct file copy", err)
		_, _ = sqlDB.Exec("PRAGMA wal_checkpoint(TRUNCATE);")
		srcDB := flags.DatabaseFile
		if srcDB == "" {
			srcDB = filepath.Join(".", "data", "komari.db")
		}
		if copyErr := copyFile(srcDB, destDBPath); copyErr != nil {
			return fmt.Errorf("fallback db copy failed: %v (original vacuum error: %v)", copyErr, err)
		}
	}
	return nil
}

// DownloadBackup 打包 ./data 下的核心配置及数据库文件为 zip 并下载。
// 归档直接保存在 ./data/backup/ 物理磁盘中，坚决不写入 /tmp 内存盘，避免 RAM 撑满被 OOM 强杀。
func DownloadBackup(c *gin.Context) {
	backupDir := filepath.Join(".", "data", "backup")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error creating backup directory: %v", err))
		return
	}

	// 解析参数与大小决策
	includeMetricsParam := strings.ToLower(strings.TrimSpace(c.Query("include_metrics")))
	skipMetricsParam := strings.ToLower(strings.TrimSpace(c.Query("skip_metrics")))

	metricsPath := filepath.Join(".", "data", "metrics.db")
	var metricsSize int64
	if fi, err := os.Stat(metricsPath); err == nil && !fi.IsDir() {
		metricsSize = fi.Size()
	}

	// 决策是否打包 metrics.db:
	// 1. 显式指定 ?include_metrics=false 或 ?skip_metrics=true 则排除
	// 2. 显式指定 ?include_metrics=true 则包含
	// 3. 默认情况下：若 metrics.db 超过 50MB（大体量多节点集群），自动排除监控指标，避免 CPU/RAM 暴毙；若 <= 50MB 则安全包含
	shouldIncludeMetrics := false
	if skipMetricsParam == "true" || includeMetricsParam == "false" || includeMetricsParam == "0" {
		shouldIncludeMetrics = false
	} else if includeMetricsParam == "true" || includeMetricsParam == "1" {
		shouldIncludeMetrics = (metricsSize > 0)
	} else {
		const autoSkipMetricsThreshold = 50 * 1024 * 1024 // 50 MB
		if metricsSize > 0 && metricsSize <= autoSkipMetricsThreshold {
			shouldIncludeMetrics = true
		} else if metricsSize > autoSkipMetricsThreshold {
			logger.Infof("admin", "[backup] metrics.db is %.2f MB (exceeds 50MB threshold), safely omitting from core backup archive to avoid RAM/CPU exhaustion (pass ?include_metrics=true to force include)", float64(metricsSize)/(1024*1024))
			shouldIncludeMetrics = false
		}
	}

	// 1) 在物理磁盘 ./data/backup/ 下创建暂存文件，避免占用 Linux /tmp 内存盘（tmpfs）
	ts := time.Now().UTC().Format("20060102-150405.000000")
	archiveName := fmt.Sprintf("backup-%s.zip", ts)
	archivePath := filepath.Join(backupDir, archiveName)

	stagingZip, err := os.CreateTemp(backupDir, ".backup-staging-*.zip")
	if err != nil {
		api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error creating staging zip file: %v", err))
		return
	}
	stagingPath := stagingZip.Name()
	defer func() {
		_ = stagingZip.Close()
		_ = os.Remove(stagingPath)
	}()

	zipWriter := zip.NewWriter(stagingZip)

	// 2) 逐项写入白名单中的静态配置/插件/主题（直接流式打包，0 中转磁盘占用）
	for _, relPath := range backupWhitelist {
		if relPath == "metrics.db" {
			continue // metrics.db 单独处理
		}
		src := filepath.Join(".", "data", relPath)
		info, err := os.Stat(src)
		if err != nil {
			continue
		}
		if info.IsDir() {
			if err := addDirToZip(zipWriter, src, relPath); err != nil {
				_ = zipWriter.Close()
				api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error adding %s to zip: %v", relPath, err))
				return
			}
		} else {
			if err := addFileToZip(zipWriter, src, relPath, zip.Deflate); err != nil {
				_ = zipWriter.Close()
				api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error adding %s to zip: %v", relPath, err))
				return
			}
		}
	}

	// 3) 备份核心配置与节点数据库 (komari.db)
	if flags.IsSQLite() {
		tempDB, err := os.CreateTemp(backupDir, ".komari-tmp-*.db")
		if err != nil {
			_ = zipWriter.Close()
			api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error creating temp db: %v", err))
			return
		}
		tempDBPath := tempDB.Name()
		_ = tempDB.Close()
		defer os.Remove(tempDBPath)

		if err := backupSQLiteTo(tempDBPath); err != nil {
			_ = zipWriter.Close()
			api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error backing up sqlite database: %v", err))
			return
		}
		if err := addFileToZip(zipWriter, tempDBPath, "komari.db", zip.Deflate); err != nil {
			_ = zipWriter.Close()
			api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error adding komari.db to zip: %v", err))
			return
		}
	} else if flags.DatabaseFile != "" {
		if _, err := os.Stat(flags.DatabaseFile); err == nil {
			if err := addFileToZip(zipWriter, flags.DatabaseFile, "komari.db", zip.Deflate); err != nil {
				_ = zipWriter.Close()
				api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error adding database file: %v", err))
				return
			}
		}
	}

	// 4) 若策略允许打包 metrics.db，采用 zip.Store（无压缩快速追加流），避免 zlib Deflate 持续吃满 CPU 并消耗数 GB 内存
	if shouldIncludeMetrics {
		method := uint16(zip.Store)
		if metricsSize < 10*1024*1024 {
			method = zip.Deflate
		}
		if err := addFileToZip(zipWriter, metricsPath, "metrics.db", method); err != nil {
			logger.Warnf("admin", "failed to stream metrics.db to zip: %v", err)
		}
	}

	// 5) 写入官方恢复标记文件
	if err := writeBackupMarkup(zipWriter); err != nil {
		_ = zipWriter.Close()
		api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error writing backup markup: %v", err))
		return
	}

	if err := zipWriter.Close(); err != nil {
		api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error finalizing zip: %v", err))
		return
	}
	if err := stagingZip.Close(); err != nil {
		api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error closing staging zip: %v", err))
		return
	}

	// 6) 将 staging zip 发布为正式归档文件
	if err := os.Rename(stagingPath, archivePath); err != nil {
		if err := copyFile(stagingPath, archivePath); err != nil {
			api.RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Error publishing backup archive: %v", err))
			return
		}
	}

	// 7) 流式发送给客户端
	c.Writer.Header().Set("Content-Type", "application/zip")
	c.Writer.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", archiveName))

	c.File(archivePath)
}
