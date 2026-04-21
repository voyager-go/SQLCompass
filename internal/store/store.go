package store

import (
	"bytes"
	"encoding/json"
	"fmt"
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

// StorageFileInfo describes a single storage file.
type StorageFileInfo struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// StorageInfo is the summary of all storage files.
type StorageInfo struct {
	DataDir string            `json:"dataDir"`
	Files   []StorageFileInfo `json:"files"`
	Total   int64             `json:"total"`
	Writable bool             `json:"writable"`
}

type Store struct {
	filePath string
	dataDir  string
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
		dataDir:  dataDir,
	}, nil
}

func (s *Store) Path() string {
	return s.filePath
}

func (s *Store) DataDir() string {
	return s.dataDir
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

	newFilePath := filepath.Join(absDir, "app-state.json")

	// Migrate existing data if the old file exists and new one doesn't.
	if _, err := os.Stat(s.filePath); err == nil {
		if _, err := os.Stat(newFilePath); err != nil {
			data, err := os.ReadFile(s.filePath)
			if err != nil {
				return fmt.Errorf("cannot read existing data: %w", err)
			}
			if err := os.WriteFile(newFilePath, data, 0o600); err != nil {
				return fmt.Errorf("cannot write to new location: %w", err)
			}
		}
	}

	s.filePath = newFilePath
	s.dataDir = absDir
	return nil
}

// GetStorageInfo returns information about app-owned storage files only.
func (s *Store) GetStorageInfo() StorageInfo {
	s.mu.Lock()
	dir := s.dataDir
	s.mu.Unlock()

	info := StorageInfo{
		DataDir:  dir,
		Files:    []StorageFileInfo{},
		Writable: false,
	}

	// Check writability
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

// ClearHistory removes all query history from the store.
func (s *Store) ClearHistory() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.loadUnlocked()
	if err != nil {
		return err
	}

	state.History = nil
	return s.saveUnlocked(state)
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

// isAppOwnedFile checks whether a file name belongs to the application,
// preventing exposure of user's private data in the storage directory.
func isAppOwnedFile(name string) bool {
	switch name {
	case "app-state.json", ".sql-compass-write-test":
		return true
	default:
		return false
	}
}
