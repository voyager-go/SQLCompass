package workspace

import (
	"testing"
)

func TestChooseActiveDatabase(t *testing.T) {
	dbs := []string{"information_schema", "mysql", "mydb", "testdb"}

	tests := []struct {
		name      string
		preferred string
		fallback  string
		items     []string
		want      string
	}{
		{"preferred exists", "mydb", "", dbs, "mydb"},
		{"preferred missing, fallback exists", "missing", "testdb", dbs, "testdb"},
		{"both missing, first non-system", "missing", "missing", dbs, "mydb"},
		{"empty list", "mydb", "testdb", []string{}, ""},
		{"only system dbs", "missing", "missing", []string{"information_schema", "mysql"}, "information_schema"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := chooseActiveDatabase(tt.preferred, tt.fallback, tt.items)
			if got != tt.want {
				t.Errorf("chooseActiveDatabase() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestIsSystemDatabase(t *testing.T) {
	tests := []struct {
		name string
		db   string
		want bool
	}{
		{"information_schema", "information_schema", true},
		{"performance_schema", "performance_schema", true},
		{"mysql", "mysql", true},
		{"sys", "sys", true},
		{"user_db", "mydb", false},
		{"uppercase same as system", "MySQL", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isSystemDatabase(tt.db); got != tt.want {
				t.Errorf("isSystemDatabase(%q) = %v, want %v", tt.db, got, tt.want)
			}
		})
	}
}

func TestEscapeIdentifier(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"simple", "users", "users"},
		{"with backtick", "user`s", "user``s"},
		{"with spaces", "user table", "user table"},
		{"empty", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := escapeIdentifier(tt.input); got != tt.want {
				t.Errorf("escapeIdentifier() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSplitSchemaAndTable(t *testing.T) {
	tests := []struct {
		name          string
		value         string
		defaultSchema string
		wantSchema    string
		wantTable     string
	}{
		{"with schema", "public.users", "public", "public", "users"},
		{"without schema", "users", "public", "public", "users"},
		{"with dots", "my.schema.table", "public", "my", "schema.table"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			schema, table := splitSchemaAndTable(tt.value, tt.defaultSchema)
			if schema != tt.wantSchema || table != tt.wantTable {
				t.Errorf("splitSchemaAndTable() = (%q, %q), want (%q, %q)",
					schema, table, tt.wantSchema, tt.wantTable)
			}
		})
	}
}

func TestDefaultDatabaseForEngine(t *testing.T) {
	tests := []struct {
		engine string
		want   string
	}{
		{"postgresql", "postgres"},
		{"clickhouse", "default"},
		{"sqlite", "main"},
		{"redis", "db0"},
		{"mysql", ""},
		{"unknown", ""},
	}

	for _, tt := range tests {
		t.Run(tt.engine, func(t *testing.T) {
			if got := defaultDatabaseForEngine(tt.engine); got != tt.want {
				t.Errorf("defaultDatabaseForEngine(%q) = %q, want %q", tt.engine, got, tt.want)
			}
		})
	}
}

func TestBuildPaginatedSQL(t *testing.T) {
	result := buildPaginatedSQL("SELECT * FROM users", 2, 50)
	expected := "SELECT * FROM users LIMIT 50 OFFSET 50"
	if result != expected {
		t.Errorf("buildPaginatedSQL() = %q, want %q", result, expected)
	}
}

func TestBuildPaginatedSQL_FirstPage(t *testing.T) {
	result := buildPaginatedSQL("SELECT * FROM users", 1, 20)
	expected := "SELECT * FROM users LIMIT 20 OFFSET 0"
	if result != expected {
		t.Errorf("buildPaginatedSQL() = %q, want %q", result, expected)
	}
}

func TestApplyDefaultPagination_SelectNoLimit(t *testing.T) {
	sql, autoLimited := applyDefaultPagination("SELECT * FROM users", 1, 50)
	if !autoLimited {
		t.Error("expected autoLimited = true for SELECT without LIMIT")
	}
	if sql == "" {
		t.Error("expected non-empty SQL")
	}
}

func TestApplyDefaultPagination_SelectWithLimit(t *testing.T) {
	sql, autoLimited := applyDefaultPagination("SELECT * FROM users LIMIT 10", 1, 50)
	if autoLimited {
		t.Error("expected autoLimited = false for SELECT with LIMIT")
	}
	_ = sql
}

func TestApplyDefaultPagination_NonSelect(t *testing.T) {
	sql, autoLimited := applyDefaultPagination("UPDATE users SET name='test'", 1, 50)
	if autoLimited {
		t.Error("expected autoLimited = false for non-SELECT")
	}
	if sql != "UPDATE users SET name='test'" {
		t.Errorf("expected unchanged SQL, got %q", sql)
	}
}

func TestDiagnoseIndexes_NoIndexes(t *testing.T) {
	diagnostics := diagnoseIndexes([]TableField{{Name: "id", Primary: true}}, []TableIndex{})
	if len(diagnostics) == 0 {
		t.Error("expected at least one diagnostic")
	}
}

func TestDiagnoseIndexes_WithPrimaryKey(t *testing.T) {
	fields := []TableField{{Name: "id", Primary: true}}
	indexes := []TableIndex{{Name: "PRIMARY", Columns: []string{"id"}, Unique: true}}
	diagnostics := diagnoseIndexes(fields, indexes)
	for _, d := range diagnostics {
		if d.Title == "缺少主键" {
			t.Error("should not have missing primary key warning when PRIMARY exists")
		}
	}
}

func TestDiagnoseIndexes_DuplicateIndexes(t *testing.T) {
	fields := []TableField{{Name: "id", Primary: true}, {Name: "name"}}
	indexes := []TableIndex{
		{Name: "idx1", Columns: []string{"name"}},
		{Name: "idx2", Columns: []string{"name"}},
	}
	diagnostics := diagnoseIndexes(fields, indexes)
	found := false
	for _, d := range diagnostics {
		if d.Title == "重复索引" {
			found = true
		}
	}
	if !found {
		t.Error("expected duplicate index diagnostic")
	}
}

func TestDiagnoseIndexes_MissingPrimaryKey(t *testing.T) {
	fields := []TableField{{Name: "id", Primary: false}, {Name: "name", Primary: false}}
	indexes := []TableIndex{}
	diagnostics := diagnoseIndexes(fields, indexes)
	found := false
	for _, d := range diagnostics {
		if d.Title == "缺少主键" && d.Level == "high" {
			found = true
		}
	}
	if !found {
		t.Error("expected missing primary key diagnostic")
	}
}

func TestFirstNonEmpty(t *testing.T) {
	tests := []struct {
		values []string
		want   string
	}{
		{[]string{"", "hello", "world"}, "hello"},
		{[]string{"first", "second"}, "first"},
		{[]string{"", "", "last"}, "last"},
		{[]string{"", ""}, ""},
	}

	for _, tt := range tests {
		got := firstNonEmpty(tt.values...)
		if got != tt.want {
			t.Errorf("firstNonEmpty(%v) = %q, want %q", tt.values, got, tt.want)
		}
	}
}

func TestMaxInt(t *testing.T) {
	if maxInt(3, 5) != 5 {
		t.Error("maxInt(3, 5) should be 5")
	}
	if maxInt(10, 2) != 10 {
		t.Error("maxInt(10, 2) should be 10")
	}
}
