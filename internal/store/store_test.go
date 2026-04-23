package store

import (
	"path/filepath"
	"testing"
	"time"
)

func TestNewStore(t *testing.T) {
	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if store.DataDir() == "" {
		t.Error("DataDir() should not be empty")
	}
}

func TestSaveAndLoadConnections(t *testing.T) {
	tmpDir := t.TempDir()
	store := &Store{
		dataDir:         tmpDir,
		connectionsPath: filepath.Join(tmpDir, "app-state.json"),
		configPath:      filepath.Join(tmpDir, "config.json"),
		historyPath:     filepath.Join(tmpDir, "query-history.json"),
		crashLogsPath:   filepath.Join(tmpDir, "crash-logs.json"),
		aiSnapshotsPath: filepath.Join(tmpDir, "ai-snapshots.json"),
	}

	conn := ConnectionRecord{
		ID:        "test-1",
		Name:      "Test MySQL",
		Engine:    "mysql",
		Host:      "127.0.0.1",
		Port:      3306,
		Username:  "root",
		Password:  "secret123",
		Database:  "testdb",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}

	err := store.SaveConnections(AppState{Connections: []ConnectionRecord{conn}})
	if err != nil {
		t.Fatalf("SaveConnections() error = %v", err)
	}

	state, err := store.LoadConnections()
	if err != nil {
		t.Fatalf("LoadConnections() error = %v", err)
	}

	if len(state.Connections) != 1 {
		t.Fatalf("expected 1 connection, got %d", len(state.Connections))
	}

	got := state.Connections[0]
	if got.ID != conn.ID {
		t.Errorf("ID = %q, want %q", got.ID, conn.ID)
	}
	if got.Name != conn.Name {
		t.Errorf("Name = %q, want %q", got.Name, conn.Name)
	}
	if got.Engine != conn.Engine {
		t.Errorf("Engine = %q, want %q", got.Engine, conn.Engine)
	}
	if got.Password != conn.Password {
		t.Errorf("Password not properly decrypted, got %q, want %q", got.Password, conn.Password)
	}
}

func TestPasswordEncryption(t *testing.T) {
	tmpDir := t.TempDir()
	SetEncryptionKey(tmpDir)

	store := &Store{
		dataDir:         tmpDir,
		connectionsPath: filepath.Join(tmpDir, "app-state.json"),
		configPath:      filepath.Join(tmpDir, "config.json"),
		historyPath:     filepath.Join(tmpDir, "query-history.json"),
		crashLogsPath:   filepath.Join(tmpDir, "crash-logs.json"),
		aiSnapshotsPath: filepath.Join(tmpDir, "ai-snapshots.json"),
	}

	password := "my-super-secret-password"
	conn := ConnectionRecord{
		ID:        "test-enc-1",
		Name:      "Encrypted Test",
		Engine:    "mysql",
		Host:      "127.0.0.1",
		Port:      3306,
		Username:  "root",
		Password:  password,
		Database:  "testdb",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}

	err := store.SaveConnections(AppState{Connections: []ConnectionRecord{conn}})
	if err != nil {
		t.Fatalf("SaveConnections() error = %v", err)
	}

	// Read raw file to verify password is encrypted
	rawState, err := loadJSON[AppState](store.connectionsPath)
	if err != nil {
		t.Fatalf("loadJSON() error = %v", err)
	}
	if len(rawState.Connections) != 1 {
		t.Fatal("expected 1 connection in raw file")
	}
	rawPassword := rawState.Connections[0].Password
	if rawPassword == password {
		t.Error("password should be encrypted in the file, but found plaintext")
	}
	if !isEncrypted(rawPassword) {
		t.Errorf("password should have 'enc:' prefix, got %q", rawPassword[:20])
	}

	// Load and verify decryption
	state, err := store.LoadConnections()
	if err != nil {
		t.Fatalf("LoadConnections() error = %v", err)
	}
	if state.Connections[0].Password != password {
		t.Errorf("decrypted password = %q, want %q", state.Connections[0].Password, password)
	}
}

func TestAppendHistory(t *testing.T) {
	tmpDir := t.TempDir()
	store := &Store{
		dataDir:         tmpDir,
		connectionsPath: filepath.Join(tmpDir, "app-state.json"),
		configPath:      filepath.Join(tmpDir, "config.json"),
		historyPath:     filepath.Join(tmpDir, "query-history.json"),
		crashLogsPath:   filepath.Join(tmpDir, "crash-logs.json"),
		aiSnapshotsPath: filepath.Join(tmpDir, "ai-snapshots.json"),
	}

	record := QueryHistoryRecord{
		ID:            "hist-1",
		ConnectionID:  "conn-1",
		Engine:        "mysql",
		Database:      "testdb",
		Statement:     "SELECT 1",
		ExecutedSQL:   "SELECT 1",
		StatementType: "SELECT",
		RiskLevel:     "low",
		Success:       true,
		DurationMS:    10,
		RowCount:      1,
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
	}

	err := store.AppendHistory(record)
	if err != nil {
		t.Fatalf("AppendHistory() error = %v", err)
	}

	state, err := store.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory() error = %v", err)
	}

	if len(state.History) != 1 {
		t.Fatalf("expected 1 history record, got %d", len(state.History))
	}

	if state.History[0].Statement != "SELECT 1" {
		t.Errorf("Statement = %q, want %q", state.History[0].Statement, "SELECT 1")
	}
}

func TestClearHistory(t *testing.T) {
	tmpDir := t.TempDir()
	store := &Store{
		dataDir:         tmpDir,
		connectionsPath: filepath.Join(tmpDir, "app-state.json"),
		configPath:      filepath.Join(tmpDir, "config.json"),
		historyPath:     filepath.Join(tmpDir, "query-history.json"),
		crashLogsPath:   filepath.Join(tmpDir, "crash-logs.json"),
		aiSnapshotsPath: filepath.Join(tmpDir, "ai-snapshots.json"),
	}

	record := QueryHistoryRecord{
		ID:            "hist-1",
		ConnectionID:  "conn-1",
		Engine:        "mysql",
		Statement:     "SELECT 1",
		StatementType: "SELECT",
		RiskLevel:     "low",
		Success:       true,
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
	}
	_ = store.AppendHistory(record)

	err := store.ClearHistory()
	if err != nil {
		t.Fatalf("ClearHistory() error = %v", err)
	}

	state, err := store.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory() error = %v", err)
	}

	if len(state.History) != 0 {
		t.Errorf("expected 0 history records after clear, got %d", len(state.History))
	}
}

func TestLoadJSON_NonexistentFile(t *testing.T) {
	result, err := loadJSON[AppState]("/nonexistent/path.json")
	if err != nil {
		t.Fatalf("loadJSON should not error on missing file: %v", err)
	}
	if len(result.Connections) != 0 {
		t.Error("expected empty state for missing file")
	}
}

func TestIsAppOwnedFile(t *testing.T) {
	tests := []struct {
		name string
		file string
		want bool
	}{
		{"app-state", "app-state.json", true},
		{"config", "config.json", true},
		{"history", "query-history.json", true},
		{"crash-logs", "crash-logs.json", true},
		{"ai-snapshots", "ai-snapshots.json", true},
		{"random", "random-file.txt", false},
		{"dir", "some-dir", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isAppOwnedFile(tt.file); got != tt.want {
				t.Errorf("isAppOwnedFile(%q) = %v, want %v", tt.file, got, tt.want)
			}
		})
	}
}

func TestEncryptionRoundTrip(t *testing.T) {
	SetEncryptionKey("test-key-material")

	tests := []string{
		"simple",
		"with spaces and symbols !@#$%",
		"unicode 你好世界",
		"very long password that goes on and on and on and on and on and on",
		"",
	}

	for _, plain := range tests {
		t.Run(plain[:min(len(plain), 20)], func(t *testing.T) {
			enc, err := encrypt(plain)
			if err != nil {
				t.Fatalf("encrypt() error = %v", err)
			}
			if plain == "" {
				if enc != "" {
					t.Errorf("empty string should encrypt to empty, got %q", enc)
				}
				return
			}
			if enc == plain {
				t.Error("encrypted value should differ from plaintext")
			}
			if !isEncrypted(enc) {
				t.Error("encrypted value should have enc: prefix")
			}
			dec, err := decrypt(enc)
			if err != nil {
				t.Fatalf("decrypt() error = %v", err)
			}
			if dec != plain {
				t.Errorf("decrypt() = %q, want %q", dec, plain)
			}
		})
	}
}

func TestDecryptPlaintextPassthrough(t *testing.T) {
	SetEncryptionKey("test-key")
	plain := "not-encrypted-password"
	result, err := decrypt(plain)
	if err != nil {
		t.Fatalf("decrypt() error = %v", err)
	}
	if result != plain {
		t.Errorf("decrypt of plaintext should return as-is, got %q", result)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
