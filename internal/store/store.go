package store

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const historyRetentionDays = 3

// --- Data Models ---

type AIState struct {
	BaseURL   string `json:"baseUrl"`
	ModelName string `json:"modelName"`
	APIKey    string `json:"apiKey"`
}

type ConnectionRecord struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Engine      string `json:"engine"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	Database    string `json:"database"`
	FilePath    string `json:"filePath"`
	URL         string `json:"url"`
	Notes       string `json:"notes"`
	Group       string `json:"group"`
	GroupColor  string `json:"groupColor"`
	SSLMode     string `json:"sslMode"`     // "disable" | "require" | "verify-ca" | "verify-full"
	SSLCACert   string `json:"sslCaCert"`   // Path to CA certificate
	SSLClientCert string `json:"sslClientCert"` // Path to client certificate
	SSLClientKey  string `json:"sslClientKey"`  // Path to client key
	SSHHost     string `json:"sshHost"`     // SSH tunnel host
	SSHPort     int    `json:"sshPort"`     // SSH tunnel port
	SSHUser     string `json:"sshUser"`     // SSH tunnel username
	SSHPassword string `json:"sshPassword"` // SSH tunnel password
	SSHKeyFile  string `json:"sshKeyFile"`  // Path to SSH private key
	UseSSH      bool   `json:"useSSH"`      // Whether to use SSH tunnel
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type QueryHistoryRecord struct {
	ID            string `json:"id"`
	ConnectionID  string `json:"connectionId"`
	Engine        string `json:"engine"`
	Database      string `json:"database"`
	Statement     string `json:"statement"`
	ExecutedSQL   string `json:"executedSql"`
	StatementType string `json:"statementType"`
	RiskLevel     string `json:"riskLevel"`
	Success       bool   `json:"success"`
	DurationMS    int64  `json:"durationMs"`
	RowCount      int64  `json:"rowCount"`
	CreatedAt     string `json:"createdAt"`
}

type CrashLogEntry struct {
	ID        string `json:"id"`
	Message   string `json:"message"`
	Stack     string `json:"stack"`
	CreatedAt string `json:"createdAt"`
}

type AISnapshot struct {
	ID          string `json:"id"`
	SessionID   string `json:"sessionId"`
	Summary     string `json:"summary"`
	ContextHash string `json:"contextHash"`
	CreatedAt   string `json:"createdAt"`
}

// AppState holds connections only.
type AppState struct {
	Connections []ConnectionRecord `json:"connections"`
}

// AppConfig holds AI and general settings.
type AppConfig struct {
	AI AIState `json:"ai"`
}

// QueryHistoryState holds query history.
type QueryHistoryState struct {
	History []QueryHistoryRecord `json:"history"`
}

// CrashLogsState holds crash logs.
type CrashLogsState struct {
	Logs []CrashLogEntry `json:"logs"`
}

// AISnapshotsState holds AI conversation snapshots.
type AISnapshotsState struct {
	Snapshots []AISnapshot `json:"snapshots"`
}

// StorageFileInfo describes a single storage file.
type StorageFileInfo struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// StorageInfo is the summary of all storage files.
type StorageInfo struct {
	DataDir  string            `json:"dataDir"`
	Files    []StorageFileInfo `json:"files"`
	Total    int64             `json:"total"`
	Writable bool              `json:"writable"`
}

// Store manages multiple files in the data directory.
type Store struct {
	dataDir         string
	connectionsPath string
	configPath      string
	historyPath     string
	crashLogsPath   string
	aiSnapshotsPath string
	mu              sync.Mutex
}

func NewStore() (*Store, error) {
	dataDir, err := resolveDataDir()
	if err != nil {
		return nil, err
	}

	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, err
	}

	SetEncryptionKey(dataDir)

	return &Store{
		dataDir:         dataDir,
		connectionsPath: filepath.Join(dataDir, "app-state.json"),
		configPath:      filepath.Join(dataDir, "config.json"),
		historyPath:     filepath.Join(dataDir, "query-history.json"),
		crashLogsPath:   filepath.Join(dataDir, "crash-logs.json"),
		aiSnapshotsPath: filepath.Join(dataDir, "ai-snapshots.json"),
	}, nil
}

func (s *Store) DataDir() string {
	return s.dataDir
}

func (s *Store) ConnectionsPath() string {
	return s.connectionsPath
}

// SetDataDir changes the storage directory, migrating existing data.
func (s *Store) SetDataDir(newDir string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleaned := strings.TrimSpace(newDir)
	if cleaned == "" {
		return fmt.Errorf("storage path cannot be empty")
	}

	absDir, err := filepath.Abs(cleaned)
	if err != nil {
		return fmt.Errorf("invalid path: %w", err)
	}

	if err := os.MkdirAll(absDir, 0o700); err != nil {
		return fmt.Errorf("cannot create directory: %w", err)
	}

	files := map[string]string{
		"app-state.json":  filepath.Join(absDir, "app-state.json"),
		"config.json":     filepath.Join(absDir, "config.json"),
		"query-history.json": filepath.Join(absDir, "query-history.json"),
		"crash-logs.json": filepath.Join(absDir, "crash-logs.json"),
		"ai-snapshots.json": filepath.Join(absDir, "ai-snapshots.json"),
	}

	for oldName, oldPath := range map[string]string{
		"app-state.json":  s.connectionsPath,
		"config.json":     s.configPath,
		"query-history.json": s.historyPath,
		"crash-logs.json": s.crashLogsPath,
		"ai-snapshots.json": s.aiSnapshotsPath,
	} {
		newPath := files[oldName]
		if _, err := os.Stat(oldPath); err == nil {
			if _, err := os.Stat(newPath); err != nil {
				data, err := os.ReadFile(oldPath)
				if err != nil {
					return fmt.Errorf("cannot read %s: %w", oldName, err)
				}
				if err := os.WriteFile(newPath, data, 0o600); err != nil {
					return fmt.Errorf("cannot write %s to new location: %w", oldName, err)
				}
			}
		}
	}

	s.connectionsPath = files["app-state.json"]
	s.configPath = files["config.json"]
	s.historyPath = files["query-history.json"]
	s.crashLogsPath = files["crash-logs.json"]
	s.aiSnapshotsPath = files["ai-snapshots.json"]
	s.dataDir = absDir
	SetEncryptionKey(absDir)
	return nil
}

// --- Connections ---

func (s *Store) LoadConnections() (AppState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	state, err := s.loadConnectionsUnlocked()
	if err != nil {
		return state, err
	}
	s.decryptConnectionPasswords(&state)
	return state, nil
}

func (s *Store) loadConnectionsUnlocked() (AppState, error) {
	return loadJSON[AppState](s.connectionsPath)
}

func (s *Store) SaveConnections(state AppState) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.encryptConnectionPasswords(&state)
	return saveJSON(s.connectionsPath, state)
}

// encryptConnectionPasswords encrypts any plaintext passwords in the connections.
func (s *Store) encryptConnectionPasswords(state *AppState) {
	for i := range state.Connections {
		if state.Connections[i].Password != "" && !isEncrypted(state.Connections[i].Password) {
			enc, err := encrypt(state.Connections[i].Password)
			if err == nil {
				state.Connections[i].Password = enc
			}
		}
	}
}

// decryptConnectionPasswords decrypts encrypted passwords in the connections.
func (s *Store) decryptConnectionPasswords(state *AppState) {
	for i := range state.Connections {
		if state.Connections[i].Password != "" && isEncrypted(state.Connections[i].Password) {
			dec, err := decrypt(state.Connections[i].Password)
			if err == nil {
				state.Connections[i].Password = dec
			}
		}
	}
}

// --- Config ---

func (s *Store) LoadConfig() (AppConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return loadJSON[AppConfig](s.configPath)
}

func (s *Store) SaveConfig(config AppConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return saveJSON(s.configPath, config)
}

// --- Query History ---

func (s *Store) LoadHistory() (QueryHistoryState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return loadJSON[QueryHistoryState](s.historyPath)
}

func (s *Store) SaveHistory(state QueryHistoryState) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	state.History = s.filterOldHistory(state.History)
	return saveJSON(s.historyPath, state)
}

func (s *Store) AppendHistory(record QueryHistoryRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	state, _ := loadJSON[QueryHistoryState](s.historyPath)
	state.History = append([]QueryHistoryRecord{record}, state.History...)
	if len(state.History) > 200 {
		state.History = state.History[:200]
	}
	state.History = s.filterOldHistory(state.History)
	return saveJSON(s.historyPath, state)
}

func (s *Store) ClearHistory() error {
	return s.SaveHistory(QueryHistoryState{})
}

func (s *Store) filterOldHistory(items []QueryHistoryRecord) []QueryHistoryRecord {
	cutoff := time.Now().UTC().Add(-historyRetentionDays * 24 * time.Hour)
	result := make([]QueryHistoryRecord, 0, len(items))
	for _, item := range items {
		t, err := time.Parse(time.RFC3339, item.CreatedAt)
		if err != nil || t.After(cutoff) {
			result = append(result, item)
		}
	}
	return result
}

// --- Crash Logs ---

func (s *Store) LoadCrashLogs() (CrashLogsState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return loadJSON[CrashLogsState](s.crashLogsPath)
}

func (s *Store) AppendCrashLog(entry CrashLogEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	state, _ := loadJSON[CrashLogsState](s.crashLogsPath)
	state.Logs = append(state.Logs, entry)
	// Keep last 100 crash logs
	if len(state.Logs) > 100 {
		state.Logs = state.Logs[len(state.Logs)-100:]
	}
	return saveJSON(s.crashLogsPath, state)
}

func (s *Store) ClearCrashLogs() error {
	return saveJSON(s.crashLogsPath, CrashLogsState{})
}

// --- AI Snapshots ---

func (s *Store) LoadAISnapshots() (AISnapshotsState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return loadJSON[AISnapshotsState](s.aiSnapshotsPath)
}

func (s *Store) SaveAISnapshot(snapshot AISnapshot) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	state, _ := loadJSON[AISnapshotsState](s.aiSnapshotsPath)
	state.Snapshots = append([]AISnapshot{snapshot}, state.Snapshots...)
	if len(state.Snapshots) > 50 {
		state.Snapshots = state.Snapshots[:50]
	}
	return saveJSON(s.aiSnapshotsPath, state)
}

func (s *Store) ClearAISnapshots() error {
	return saveJSON(s.aiSnapshotsPath, AISnapshotsState{})
}

// --- Storage Info ---

func (s *Store) GetStorageInfo() StorageInfo {
	s.mu.Lock()
	dir := s.dataDir
	s.mu.Unlock()

	info := StorageInfo{
		DataDir:  dir,
		Files:    []StorageFileInfo{},
		Writable: false,
	}

	testFile := filepath.Join(dir, ".sql-compass-write-test")
	if err := os.WriteFile(testFile, []byte("test"), 0o600); err == nil {
		info.Writable = true
		os.Remove(testFile)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return info
	}

	var total int64
	for _, entry := range entries {
		name := entry.Name()
		if !isAppOwnedFile(name) {
			continue
		}

		fullPath := filepath.Join(dir, name)
		if entry.IsDir() {
			size := dirSize(fullPath)
			info.Files = append(info.Files, StorageFileInfo{
				Name: name + "/",
				Path: fullPath,
				Size: size,
			})
			total += size
		} else {
			fi, err := entry.Info()
			if err != nil {
				continue
			}
			info.Files = append(info.Files, StorageFileInfo{
				Name: name,
				Path: fullPath,
				Size: fi.Size(),
			})
			total += fi.Size()
		}
	}

	info.Total = total
	return info
}

// ClearDataByCategory clears a specific category of data.
func (s *Store) ClearDataByCategory(category string) error {
	switch strings.ToLower(strings.TrimSpace(category)) {
	case "history":
		return s.ClearHistory()
	case "crash":
		return s.ClearCrashLogs()
	case "ai-snapshots":
		return s.ClearAISnapshots()
	case "config":
		return s.SaveConfig(AppConfig{})
	case "connections":
		return s.SaveConnections(AppState{})
	default:
		return fmt.Errorf("unknown category: %s", category)
	}
}

// --- Helpers ---

func loadJSON[T any](path string) (T, error) {
	var zero T
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return zero, nil
		}
		return zero, err
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return zero, nil
	}
	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		return zero, err
	}
	return value, nil
}

func saveJSON(path string, value any) error {
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, payload, 0o600); err != nil {
		return err
	}
	return os.Rename(tempPath, path)
}

func dirSize(path string) int64 {
	var size int64
	filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size
}

func resolveDataDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv("SQLCOMPASS_DATA_DIR")); override != "" {
		return override, nil
	}

	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(configDir, "sql-compass"), nil
}

func isAppOwnedFile(name string) bool {
	switch name {
	case "app-state.json", "config.json", "query-history.json", "crash-logs.json", "ai-snapshots.json", ".sql-compass-write-test":
		return true
	default:
		return false
	}
}
