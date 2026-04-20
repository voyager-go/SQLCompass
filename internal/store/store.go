package store

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

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

type AppState struct {
	AI          AIState              `json:"ai"`
	Connections []ConnectionRecord   `json:"connections"`
	History     []QueryHistoryRecord `json:"history"`
}

type Store struct {
	filePath string
	mu       sync.Mutex
}

func NewStore() (*Store, error) {
	dataDir, err := resolveDataDir()
	if err != nil {
		return nil, err
	}

	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, err
	}

	return &Store{
		filePath: filepath.Join(dataDir, "app-state.json"),
	}, nil
}

func (s *Store) Path() string {
	return s.filePath
}

func (s *Store) Load() (AppState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.loadUnlocked()
}

func (s *Store) Save(state AppState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.saveUnlocked(state)
}

func (s *Store) loadUnlocked() (AppState, error) {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return AppState{}, nil
		}

		return AppState{}, err
	}

	if len(bytes.TrimSpace(data)) == 0 {
		return AppState{}, nil
	}

	var state AppState
	if err := json.Unmarshal(data, &state); err != nil {
		return AppState{}, err
	}

	return state, nil
}

func (s *Store) saveUnlocked(state AppState) error {
	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	tempPath := s.filePath + ".tmp"
	if err := os.WriteFile(tempPath, payload, 0o600); err != nil {
		return err
	}

	return os.Rename(tempPath, s.filePath)
}

func resolveDataDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv("SQLTOOL_DATA_DIR")); override != "" {
		return override, nil
	}

	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(configDir, "sqltool-studio"), nil
}
