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
	state, err := s.store.Load()
	if err != nil {
		return WorkspaceState{}, err
	}

	connections := make([]ConnectionProfile, 0, len(state.Connections))
	for _, record := range state.Connections {
		connections = append(connections, profileFromRecord(record))
	}

	sort.Slice(connections, func(i, j int) bool {
		return connections[i].UpdatedAt > connections[j].UpdatedAt
	})

	return WorkspaceState{
		Connections: connections,
		AI:          buildAISettingsView(state.AI),
		StoragePath: s.store.Path(),
	}, nil
}

func (s *Service) SaveConnection(input ConnectionInput) (ConnectionProfile, error) {
	normalized := normalizeConnectionInput(input)
	if err := validateConnectionInput(normalized, true); err != nil {
		return ConnectionProfile{}, err
	}

	state, err := s.store.Load()
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
		if err := s.store.Save(state); err != nil {
			return ConnectionProfile{}, err
		}

		return profileFromRecord(record), nil
	}

	record.ID = newID()
	record.CreatedAt = now
	record.UpdatedAt = now
	state.Connections = append(state.Connections, record)

	if err := s.store.Save(state); err != nil {
		return ConnectionProfile{}, err
	}

	return profileFromRecord(record), nil
}

func (s *Service) DeleteConnection(id string) error {
	trimmedID := strings.TrimSpace(id)
	if trimmedID == "" {
		return errors.New("connection id is required")
	}

	state, err := s.store.Load()
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
	return s.store.Save(state)
}

func (s *Service) TestConnection(input ConnectionInput) (ConnectionTestResult, error) {
	normalized := normalizeConnectionInput(input)
	if err := validateConnectionInput(normalized, false); err != nil {
		return ConnectionTestResult{}, err
	}

	switch normalized.Engine {
	case string(database.SQLite):
		return testSQLiteConnection(normalized.FilePath), nil
	case string(database.MySQL), string(database.MariaDB):
		return testMySQLConnection(normalized)
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
	state, err := s.store.Load()
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

	state.AI.BaseURL = baseURL
	state.AI.ModelName = modelName
	if strings.TrimSpace(input.APIKey) != "" {
		state.AI.APIKey = strings.TrimSpace(input.APIKey)
	}

	if err := s.store.Save(state); err != nil {
		return AISettingsView{}, err
	}

	return buildAISettingsView(state.AI), nil
}

func (s *Service) ClearAIAPIKey() (AISettingsView, error) {
	state, err := s.store.Load()
	if err != nil {
		return AISettingsView{}, err
	}

	state.AI.APIKey = ""
	if err := s.store.Save(state); err != nil {
		return AISettingsView{}, err
	}

	return buildAISettingsView(state.AI), nil
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
