package workspace

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"sqltool/internal/config"
	"sqltool/internal/database"
	"sqltool/internal/store"
)

type WorkspaceState struct {
	Connections []ConnectionProfile `json:"connections"`
	AI          AISettingsView      `json:"ai"`
	StoragePath string              `json:"storagePath"`
}

type ConnectionInput struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Engine     string `json:"engine"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	Database   string `json:"database"`
	FilePath   string `json:"filePath"`
	URL        string `json:"url"`
	Notes      string `json:"notes"`
	Group      string `json:"group"`
	GroupColor string `json:"groupColor"`
}

type ConnectionProfile struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Engine      string `json:"engine"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	Database    string `json:"database"`
	FilePath    string `json:"filePath"`
	URL         string `json:"url"`
	Notes       string `json:"notes"`
	Group       string `json:"group"`
	GroupColor  string `json:"groupColor"`
	PasswordSet bool   `json:"passwordSet"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type ConnectionTestResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Detail  string `json:"detail"`
}

type AISettingsInput struct {
	BaseURL   string `json:"baseUrl"`
	ModelName string `json:"modelName"`
	APIKey    string `json:"apiKey"`
}

type AISettingsView struct {
	BaseURL          string `json:"baseUrl"`
	ModelName        string `json:"modelName"`
	APIKeyConfigured bool   `json:"apiKeyConfigured"`
	APIKeySource     string `json:"apiKeySource"`
	APIKeyPreview    string `json:"apiKeyPreview"`
	StorageMode      string `json:"storageMode"`
}

type Service struct {
	store *store.Store
}

func NewService(stateStore *store.Store) *Service {
	return &Service{store: stateStore}
}

func (s *Service) GetWorkspaceState() (WorkspaceState, error) {
	connState, err := s.store.LoadConnections()
	if err != nil {
		return WorkspaceState{}, err
	}

	config, err := s.store.LoadConfig()
	if err != nil {
		return WorkspaceState{}, err
	}

	connections := make([]ConnectionProfile, 0, len(connState.Connections))
	for _, record := range connState.Connections {
		connections = append(connections, profileFromRecord(record))
	}

	sort.Slice(connections, func(i, j int) bool {
		return connections[i].UpdatedAt > connections[j].UpdatedAt
	})

	return WorkspaceState{
		Connections: connections,
		AI:          buildAISettingsView(config.AI),
		StoragePath: s.store.ConnectionsPath(),
	}, nil
}

func (s *Service) SaveConnection(input ConnectionInput) (ConnectionProfile, error) {
	normalized := normalizeConnectionInput(input)
	if err := validateConnectionInput(normalized, true); err != nil {
		return ConnectionProfile{}, err
	}

	state, err := s.store.LoadConnections()
	if err != nil {
		return ConnectionProfile{}, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	record := connectionRecordFromInput(normalized)

	for index, existing := range state.Connections {
		if existing.ID != normalized.ID {
			continue
		}

		record.ID = existing.ID
		record.CreatedAt = existing.CreatedAt
		record.UpdatedAt = now
		if record.Password == "" {
			record.Password = existing.Password
		}

		state.Connections[index] = record
		if err := s.store.SaveConnections(state); err != nil {
			return ConnectionProfile{}, err
		}

		return profileFromRecord(record), nil
	}

	record.ID = newID()
	record.CreatedAt = now
	record.UpdatedAt = now
	state.Connections = append(state.Connections, record)

	if err := s.store.SaveConnections(state); err != nil {
		return ConnectionProfile{}, err
	}

	return profileFromRecord(record), nil
}

func (s *Service) DeleteConnection(id string) error {
	trimmedID := strings.TrimSpace(id)
	if trimmedID == "" {
		return errors.New("connection id is required")
	}

	state, err := s.store.LoadConnections()
	if err != nil {
		return err
	}

	filtered := state.Connections[:0]
	found := false
	for _, record := range state.Connections {
		if record.ID == trimmedID {
			found = true
			continue
		}

		filtered = append(filtered, record)
	}

	if !found {
		return errors.New("connection not found")
	}

	state.Connections = filtered
	return s.store.SaveConnections(state)
}

func (s *Service) TestConnection(input ConnectionInput) (ConnectionTestResult, error) {
	normalized := normalizeConnectionInput(input)
	if err := validateConnectionInput(normalized, false); err != nil {
		return ConnectionTestResult{}, err
	}

	switch normalized.Engine {
	case string(database.SQLite):
		fileValidation := testSQLiteConnection(normalized.FilePath)
		if !fileValidation.Success {
			return fileValidation, nil
		}
		return testSQLiteDriverConnection(normalized)
	case string(database.MySQL), string(database.MariaDB):
		return testMySQLConnection(normalized)
	case string(database.PostgreSQL):
		return testPostgreSQLConnection(normalized)
	case string(database.ClickHouse):
		return testClickHouseConnection(normalized)
	case string(database.Redis):
		return testRedisConnection(normalized)
	}

	target, detail, err := resolveNetworkTarget(normalized)
	if err != nil {
		return ConnectionTestResult{}, err
	}

	conn, err := net.DialTimeout("tcp", target, 2*time.Second)
	if err != nil {
		return ConnectionTestResult{
			Success: false,
			Message: "Connection failed",
			Detail:  fmt.Sprintf("Basic reachability test to %s failed: %v", target, err),
		}, nil
	}
	defer conn.Close()

	return ConnectionTestResult{
		Success: true,
		Message: "Network target is reachable",
		Detail:  fmt.Sprintf("Connected to %s. This is a basic reachability test; driver-level authentication comes next.", detail),
	}, nil
}

func (s *Service) SaveAISettings(input AISettingsInput) (AISettingsView, error) {
	configState, err := s.store.LoadConfig()
	if err != nil {
		return AISettingsView{}, err
	}

	defaults := config.LoadAISettings()
	baseURL := strings.TrimSpace(input.BaseURL)
	if baseURL == "" {
		baseURL = defaults.BaseURL
	}

	modelName := strings.TrimSpace(input.ModelName)
	if modelName == "" {
		modelName = defaults.ModelName
	}

	configState.AI.BaseURL = baseURL
	configState.AI.ModelName = modelName
	if strings.TrimSpace(input.APIKey) != "" {
		configState.AI.APIKey = strings.TrimSpace(input.APIKey)
	}

	if err := s.store.SaveConfig(configState); err != nil {
		return AISettingsView{}, err
	}

	return buildAISettingsView(configState.AI), nil
}

func (s *Service) ClearAIAPIKey() (AISettingsView, error) {
	configState, err := s.store.LoadConfig()
	if err != nil {
		return AISettingsView{}, err
	}

	configState.AI.APIKey = ""
	if err := s.store.SaveConfig(configState); err != nil {
		return AISettingsView{}, err
	}

	return buildAISettingsView(configState.AI), nil
}

func normalizeConnectionInput(input ConnectionInput) ConnectionInput {
	group := strings.TrimSpace(input.Group)
	if group == "" {
		group = "默认分组"
	}
	return ConnectionInput{
		ID:         strings.TrimSpace(input.ID),
		Name:       strings.TrimSpace(input.Name),
		Engine:     strings.ToLower(strings.TrimSpace(input.Engine)),
		Host:       strings.TrimSpace(input.Host),
		Port:       input.Port,
		Username:   strings.TrimSpace(input.Username),
		Password:   strings.TrimSpace(input.Password),
		Database:   strings.TrimSpace(input.Database),
		FilePath:   strings.TrimSpace(input.FilePath),
		URL:        strings.TrimSpace(input.URL),
		Notes:      strings.TrimSpace(input.Notes),
		Group:      group,
		GroupColor: strings.TrimSpace(input.GroupColor),
	}
}

func validateConnectionInput(input ConnectionInput, requireName bool) error {
	if requireName && input.Name == "" {
		return errors.New("connection name is required")
	}

	if !isSupportedEngine(input.Engine) {
		return errors.New("unsupported database engine")
	}

	if input.Engine == string(database.SQLite) {
		if input.FilePath == "" {
			return errors.New("sqlite file path is required")
		}

		return nil
	}

	if input.URL != "" {
		parsed, err := url.Parse(input.URL)
		if err != nil {
			return fmt.Errorf("invalid URL: %w", err)
		}

		if parsed.Host == "" {
			return errors.New("URL must include a host")
		}

		return nil
	}

	if input.Host == "" {
		return errors.New("host is required")
	}

	if input.Port <= 0 {
		return errors.New("port must be greater than zero")
	}

	return nil
}

func isSupportedEngine(engine string) bool {
	switch engine {
	case string(database.MySQL),
		string(database.MariaDB),
		string(database.PostgreSQL),
		string(database.SQLite),
		string(database.ClickHouse),
		string(database.MongoDB),
		string(database.Redis):
		return true
	default:
		return false
	}
}

func connectionRecordFromInput(input ConnectionInput) store.ConnectionRecord {
	return store.ConnectionRecord{
		ID:         input.ID,
		Name:       input.Name,
		Engine:     input.Engine,
		Host:       input.Host,
		Port:       input.Port,
		Username:   input.Username,
		Password:   input.Password,
		Database:   input.Database,
		FilePath:   input.FilePath,
		URL:        input.URL,
		Notes:      input.Notes,
		Group:      input.Group,
		GroupColor: input.GroupColor,
	}
}

func profileFromRecord(record store.ConnectionRecord) ConnectionProfile {
	group := record.Group
	if group == "" {
		group = "默认分组"
	}
	return ConnectionProfile{
		ID:          record.ID,
		Name:        record.Name,
		Engine:      record.Engine,
		Host:        record.Host,
		Port:        record.Port,
		Username:    record.Username,
		Database:    record.Database,
		FilePath:    record.FilePath,
		URL:         record.URL,
		Notes:       record.Notes,
		Group:       group,
		GroupColor:  record.GroupColor,
		PasswordSet: record.Password != "",
		CreatedAt:   record.CreatedAt,
		UpdatedAt:   record.UpdatedAt,
	}
}

func resolveNetworkTarget(input ConnectionInput) (string, string, error) {
	if input.URL != "" {
		parsed, err := url.Parse(input.URL)
		if err != nil {
			return "", "", err
		}

		host := parsed.Host
		if host == "" {
			return "", "", errors.New("URL must include a host")
		}

		if parsed.Port() == "" && !strings.Contains(host, ":") {
			host = net.JoinHostPort(host, strconv.Itoa(defaultPortForEngine(input.Engine)))
		}

		return host, host, nil
	}

	target := net.JoinHostPort(input.Host, strconv.Itoa(input.Port))
	return target, target, nil
}

func testSQLiteConnection(filePath string) ConnectionTestResult {
	cleanPath := filepath.Clean(filePath)
	info, err := os.Stat(cleanPath)
	if err == nil {
		if info.IsDir() {
			return ConnectionTestResult{
				Success: false,
				Message: "SQLite target is a directory",
				Detail:  "Please point the connection at a .db or .sqlite file instead of a directory.",
			}
		}

		return ConnectionTestResult{
			Success: true,
			Message: "SQLite file is accessible",
			Detail:  fmt.Sprintf("Found %s", cleanPath),
		}
	}

	if !os.IsNotExist(err) {
		return ConnectionTestResult{
			Success: false,
			Message: "SQLite path is not readable",
			Detail:  err.Error(),
		}
	}

	parentDir := filepath.Dir(cleanPath)
	if _, dirErr := os.Stat(parentDir); dirErr != nil {
		return ConnectionTestResult{
			Success: false,
			Message: "SQLite parent directory is missing",
			Detail:  dirErr.Error(),
		}
	}

	return ConnectionTestResult{
		Success: true,
		Message: "SQLite path is valid",
		Detail:  "The file does not exist yet, but the parent directory is available for a new database file.",
	}
}

func buildAISettingsView(saved store.AIState) AISettingsView {
	defaults := config.LoadAISettings()
	baseURL := firstNonEmpty(saved.BaseURL, defaults.BaseURL)
	modelName := firstNonEmpty(saved.ModelName, defaults.ModelName)

	apiKey := strings.TrimSpace(saved.APIKey)
	source := "Not configured"
	if apiKey != "" {
		source = "Local app settings"
	} else if defaults.APIKeyConfigured {
		source = "Environment variable"
		apiKey = strings.TrimSpace(os.Getenv("LLM_API_KEY"))
	}

	return AISettingsView{
		BaseURL:          baseURL,
		ModelName:        modelName,
		APIKeyConfigured: apiKey != "",
		APIKeySource:     source,
		APIKeyPreview:    maskSecret(apiKey),
		StorageMode:      "Restricted local config file with 0600 permissions; env fallback supported",
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}

	return ""
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func maskSecret(value string) string {
	if value == "" {
		return ""
	}

	runes := []rune(value)
	if len(runes) <= 8 {
		return strings.Repeat("*", len(runes))
	}

	return string(runes[:4]) + strings.Repeat("*", len(runes)-8) + string(runes[len(runes)-4:])
}

// StorageInfoView is the frontend view of storage information.
type StorageInfoView struct {
	DataDir  string             `json:"dataDir"`
	Files    []StorageFileEntry `json:"files"`
	Total    int64              `json:"total"`
	TotalHR  string             `json:"totalHR"`
	Writable bool               `json:"writable"`
}

// StorageFileEntry describes a single storage file for the frontend.
type StorageFileEntry struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SizeHR string `json:"sizeHR"`
}

// SetStoragePathResult is the result of changing storage path.
type SetStoragePathResult struct {
	Success bool   `json:"success"`
	NewPath string `json:"newPath"`
	Message string `json:"message"`
}

func (s *Service) GetStorageInfo() StorageInfoView {
	info := s.store.GetStorageInfo()
	files := make([]StorageFileEntry, 0, len(info.Files))
	for _, f := range info.Files {
		files = append(files, StorageFileEntry{
			Name:   f.Name,
			Path:   f.Path,
			Size:   f.Size,
			SizeHR: humanSize(f.Size),
		})
	}
	return StorageInfoView{
		DataDir:  info.DataDir,
		Files:    files,
		Total:    info.Total,
		TotalHR:  humanSize(info.Total),
		Writable: info.Writable,
	}
}

func (s *Service) SetStoragePath(newPath string) SetStoragePathResult {
	if err := s.store.SetDataDir(newPath); err != nil {
		return SetStoragePathResult{
			Success: false,
			Message: err.Error(),
		}
	}
	return SetStoragePathResult{
		Success: true,
		NewPath: s.store.DataDir(),
		Message: "存储路径已更新",
	}
}

func (s *Service) GrantStoragePermission() SetStoragePathResult {
	dir := s.store.DataDir()
	if err := os.Chmod(dir, 0o700); err != nil {
		return SetStoragePathResult{
			Success: false,
			Message: fmt.Sprintf("无法设置权限: %v", err),
		}
	}
	return SetStoragePathResult{
		Success: true,
		NewPath: dir,
		Message: "读写权限已授予",
	}
}

func (s *Service) GetCrashLogs() (store.CrashLogsState, error) {
	return s.store.LoadCrashLogs()
}

func (s *Service) LogCrash(message string, stack string) error {
	entry := store.CrashLogEntry{
		ID:        newID(),
		Message:   message,
		Stack:     stack,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	return s.store.AppendCrashLog(entry)
}

func (s *Service) ClearStorageData(category string) SetStoragePathResult {
	if err := s.store.ClearDataByCategory(category); err != nil {
		return SetStoragePathResult{
			Success: false,
			Message: err.Error(),
		}
	}

	label := "数据"
	switch strings.ToLower(strings.TrimSpace(category)) {
	case "history":
		label = "SQL查询历史"
	case "crash":
		label = "崩溃日志"
	case "ai-snapshots":
		label = "AI对话快照"
	case "config":
		label = "配置文件"
	case "connections":
		label = "连接配置"
	}

	return SetStoragePathResult{
		Success: true,
		Message: fmt.Sprintf("%s已清除", label),
	}
}

func humanSize(bytes int64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)
	switch {
	case bytes >= GB:
		return fmt.Sprintf("%.2f GB", float64(bytes)/float64(GB))
	case bytes >= MB:
		return fmt.Sprintf("%.2f MB", float64(bytes)/float64(MB))
	case bytes >= KB:
		return fmt.Sprintf("%.2f KB", float64(bytes)/float64(KB))
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}

func newID() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 10)
	}

	return hex.EncodeToString(buffer)
}

func defaultPortForEngine(engine string) int {
	switch engine {
	case string(database.MySQL), string(database.MariaDB):
		return 3306
	case string(database.PostgreSQL):
		return 5432
	case string(database.ClickHouse):
		return 8123
	case string(database.MongoDB):
		return 27017
	case string(database.Redis):
		return 6379
	default:
		return 0
	}
}
