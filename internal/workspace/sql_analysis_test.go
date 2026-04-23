package workspace

import (
	"testing"
)

func TestAnalyzeSQL_Select(t *testing.T) {
	tests := []struct {
		name           string
		sql            string
		wantType       string
		wantRisk       string
		wantConfirm    bool
		wantWarningCnt int
	}{
		{"simple select", "SELECT * FROM users", "SELECT", "low", false, 1},
		{"select with limit", "SELECT * FROM users LIMIT 10", "SELECT", "low", false, 0},
		{"select with CTE", "WITH cte AS (SELECT 1) SELECT * FROM cte", "SELECT", "low", false, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := analyzeSQL(tt.sql)
			if got.StatementType != tt.wantType {
				t.Errorf("StatementType = %q, want %q", got.StatementType, tt.wantType)
			}
			if got.RiskLevel != tt.wantRisk {
				t.Errorf("RiskLevel = %q, want %q", got.RiskLevel, tt.wantRisk)
			}
			if got.RequiresConfirm != tt.wantConfirm {
				t.Errorf("RequiresConfirm = %v, want %v", got.RequiresConfirm, tt.wantConfirm)
			}
			if len(got.Warnings) != tt.wantWarningCnt {
				t.Errorf("len(Warnings) = %d, want %d", len(got.Warnings), tt.wantWarningCnt)
			}
		})
	}
}

func TestAnalyzeSQL_UpdateDelete(t *testing.T) {
	tests := []struct {
		name        string
		sql         string
		wantType    string
		wantRisk    string
		wantConfirm bool
	}{
		{"update with where", "UPDATE users SET name='test' WHERE id=1", "UPDATE", "high", true},
		{"update without where", "UPDATE users SET name='test'", "UPDATE", "critical", true},
		{"delete with where", "DELETE FROM users WHERE id=1", "DELETE", "high", true},
		{"delete without where", "DELETE FROM users", "DELETE", "critical", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := analyzeSQL(tt.sql)
			if got.StatementType != tt.wantType {
				t.Errorf("StatementType = %q, want %q", got.StatementType, tt.wantType)
			}
			if got.RiskLevel != tt.wantRisk {
				t.Errorf("RiskLevel = %q, want %q", got.RiskLevel, tt.wantRisk)
			}
			if got.RequiresConfirm != tt.wantConfirm {
				t.Errorf("RequiresConfirm = %v, want %v", got.RequiresConfirm, tt.wantConfirm)
			}
		})
	}
}

func TestAnalyzeSQL_DDL(t *testing.T) {
	tests := []struct {
		name        string
		sql         string
		wantType    string
		wantRisk    string
		wantConfirm bool
	}{
		{"drop table", "DROP TABLE users", "DDL", "critical", true},
		{"truncate", "TRUNCATE TABLE users", "DDL", "critical", true},
		{"create table", "CREATE TABLE test (id INT)", "DDL", "medium", false},
		{"alter table", "ALTER TABLE users ADD COLUMN age INT", "ALTER", "high", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := analyzeSQL(tt.sql)
			if got.StatementType != tt.wantType {
				t.Errorf("StatementType = %q, want %q", got.StatementType, tt.wantType)
			}
			if got.RiskLevel != tt.wantRisk {
				t.Errorf("RiskLevel = %q, want %q", got.RiskLevel, tt.wantRisk)
			}
			if got.RequiresConfirm != tt.wantConfirm {
				t.Errorf("RequiresConfirm = %v, want %v", got.RequiresConfirm, tt.wantConfirm)
			}
		})
	}
}

func TestAnalyzeSQL_CommentBypass(t *testing.T) {
	// Test that comments are stripped before analysis
	got := analyzeSQL("-- DELETE FROM users\nSELECT * FROM users")
	if got.StatementType != "SELECT" {
		t.Errorf("StatementType after stripping comment = %q, want SELECT", got.StatementType)
	}
	if got.RiskLevel != "low" {
		t.Errorf("RiskLevel after stripping comment = %q, want low", got.RiskLevel)
	}
}

func TestAnalyzeSQL_BlockComment(t *testing.T) {
	got := analyzeSQL("/* DELETE FROM users */ SELECT * FROM users")
	if got.StatementType != "SELECT" {
		t.Errorf("StatementType after stripping block comment = %q, want SELECT", got.StatementType)
	}
}

func TestAnalyzeSQL_MultiStatement(t *testing.T) {
	got := analyzeSQL("SELECT 1; DELETE FROM users")
	if len(got.Warnings) == 0 {
		t.Error("Expected warning for multi-statement, got none")
	}
}

func TestStripSQLComments(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		want string
	}{
		{"line comment", "SELECT * -- comment\nFROM t", "SELECT * \nFROM t"},
		{"block comment", "SELECT /* comment */ * FROM t", "SELECT   * FROM t"},
		{"string with dashes", "SELECT 'not--a comment' FROM t", "SELECT 'not--a comment' FROM t"},
		{"no comments", "SELECT * FROM t", "SELECT * FROM t"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := stripSQLComments(tt.sql)
			if got != tt.want {
				t.Errorf("stripSQLComments() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestContainsMultiStatement(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		want bool
	}{
		{"single statement", "SELECT * FROM users", false},
		{"multi statement", "SELECT 1; DELETE FROM users", true},
		{"semicolon in string", "SELECT 'a;b' FROM t", false},
		{"trailing semicolon", "SELECT 1;", true}, // containsMultiStatement counts any semicolons
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := containsMultiStatement(tt.sql); got != tt.want {
				t.Errorf("containsMultiStatement() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAnalyzeSQL_InsertReplace(t *testing.T) {
	tests := []struct {
		name        string
		sql         string
		wantType    string
		wantRisk    string
		wantConfirm bool
	}{
		{"insert", "INSERT INTO users (name) VALUES ('test')", "INSERT", "medium", false},
		{"replace", "REPLACE INTO users (id, name) VALUES (1, 'test')", "INSERT", "medium", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := analyzeSQL(tt.sql)
			if got.StatementType != tt.wantType {
				t.Errorf("StatementType = %q, want %q", got.StatementType, tt.wantType)
			}
			if got.RiskLevel != tt.wantRisk {
				t.Errorf("RiskLevel = %q, want %q", got.RiskLevel, tt.wantRisk)
			}
			if got.RequiresConfirm != tt.wantConfirm {
				t.Errorf("RequiresConfirm = %v, want %v", got.RequiresConfirm, tt.wantConfirm)
			}
		})
	}
}

func TestAnalyzeSQL_Meta(t *testing.T) {
	tests := []struct {
		name     string
		sql      string
		wantType string
	}{
		{"show", "SHOW TABLES", "META"},
		{"describe", "DESCRIBE users", "META"},
		{"desc", "DESC users", "META"},
		{"explain", "EXPLAIN SELECT * FROM users", "META"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := analyzeSQL(tt.sql)
			if got.StatementType != tt.wantType {
				t.Errorf("StatementType = %q, want %q", got.StatementType, tt.wantType)
			}
		})
	}
}

func TestAnalyzeSQL_Unknown(t *testing.T) {
	got := analyzeSQL("SOME UNKNOWN COMMAND")
	if got.StatementType != "UNKNOWN" {
		t.Errorf("StatementType = %q, want UNKNOWN", got.StatementType)
	}
}
