package workspace

import (
	"strings"
	"testing"
)

func TestGenerateFakeValueByType_Integer(t *testing.T) {
	result := generateFakeValueByType("integer", 1, "int")
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestGenerateFakeValueByType_Email(t *testing.T) {
	result := generateFakeValueByType("email", 1, "varchar(255)")
	str, ok := result.(string)
	if !ok {
		t.Fatal("expected string result")
	}
	if !strings.Contains(str, "@") {
		t.Errorf("email %q doesn't contain @", str)
	}
}

func TestGenerateFakeValueByType_Mobile(t *testing.T) {
	result := generateFakeValueByType("mobile", 1, "varchar(20)")
	str, ok := result.(string)
	if !ok {
		t.Fatal("expected string result")
	}
	if len(str) < 11 {
		t.Errorf("mobile %q too short", str)
	}
}

func TestGenerateFakeValueByType_UUID(t *testing.T) {
	result := generateFakeValueByType("uuid", 1, "varchar(36)")
	str, ok := result.(string)
	if !ok {
		t.Fatal("expected string result")
	}
	parts := strings.Split(str, "-")
	if len(parts) != 5 {
		t.Errorf("UUID %q should have 5 parts separated by -", str)
	}
}

func TestGenerateFakeValueByType_Boolean(t *testing.T) {
	result := generateFakeValueByType("boolean", 1, "tinyint")
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestGenerateFakeValueByType_Date(t *testing.T) {
	result := generateFakeValueByType("date", 1, "date")
	str, ok := result.(string)
	if !ok {
		t.Fatal("expected string result")
	}
	if len(str) != 10 {
		t.Errorf("date %q should be YYYY-MM-DD format (10 chars)", str)
	}
}

func TestGenerateFakeValueByType_DefaultFallback(t *testing.T) {
	result := generateFakeValueByType("unknown_type", 1, "varchar(255)")
	if result == nil {
		t.Error("expected non-nil result for unknown fake type")
	}
}

func TestGenerateFakeValue_IntType(t *testing.T) {
	result := generateFakeValue("int", 5)
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestGenerateFakeValue_VarcharType(t *testing.T) {
	result := generateFakeValue("varchar(32)", 5)
	str, ok := result.(string)
	if !ok {
		t.Fatal("expected string result")
	}
	if len(str) > 32 {
		t.Errorf("varchar value %q exceeds 32 chars", str)
	}
}

func TestGenerateFakeValue_DatetimeType(t *testing.T) {
	result := generateFakeValue("datetime", 5)
	str, ok := result.(string)
	if !ok {
		t.Fatal("expected string result")
	}
	if len(str) != 19 {
		t.Errorf("datetime %q should be YYYY-MM-DD HH:MM:SS format (19 chars)", str)
	}
}

func TestGenerateFakeValue_BoolType(t *testing.T) {
	result := generateFakeValue("bool", 0)
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestGenerateFakeValue_JsonType(t *testing.T) {
	result := generateFakeValue("json", 1)
	str, ok := result.(string)
	if !ok {
		t.Fatal("expected string result for json type")
	}
	if !strings.Contains(str, "{") {
		t.Errorf("json value %q should look like JSON", str)
	}
}

func TestParseFieldMeta_Varchar(t *testing.T) {
	meta := parseFieldMeta("varchar(255)")
	if meta.kind != "varchar" {
		t.Errorf("kind = %q, want varchar", meta.kind)
	}
	if meta.length != 255 {
		t.Errorf("length = %d, want 255", meta.length)
	}
}

func TestParseFieldMeta_Decimal(t *testing.T) {
	meta := parseFieldMeta("decimal(10,2)")
	if meta.kind != "decimal" {
		t.Errorf("kind = %q, want decimal", meta.kind)
	}
	if meta.precision != 10 {
		t.Errorf("precision = %d, want 10", meta.precision)
	}
	if meta.scale != 2 {
		t.Errorf("scale = %d, want 2", meta.scale)
	}
}

func TestParseFieldMeta_PlainType(t *testing.T) {
	meta := parseFieldMeta("int")
	if meta.kind != "int" {
		t.Errorf("kind = %q, want int", meta.kind)
	}
	if meta.length != 0 {
		t.Errorf("length = %d, want 0", meta.length)
	}
}

func TestParseFieldMeta_NormalizesAliases(t *testing.T) {
	tests := []struct {
		input  string
		wantK  string
	}{
		{"INTEGER", "int"},
		{"NUMERIC(8,4)", "decimal"},
		{"CHARACTER VARYING(100)", "varchar"},
		{"DOUBLE PRECISION", "double"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			meta := parseFieldMeta(tt.input)
			if meta.kind != tt.wantK {
				t.Errorf("parseFieldMeta(%q).kind = %q, want %q", tt.input, meta.kind, tt.wantK)
			}
		})
	}
}

func TestRandomUUID(t *testing.T) {
	uuid1 := randomUUID()
	uuid2 := randomUUID()
	if uuid1 == uuid2 {
		t.Errorf("two UUIDs should be different: %q == %q", uuid1, uuid2)
	}
	parts := strings.Split(uuid1, "-")
	if len(parts) != 5 {
		t.Errorf("UUID should have 5 parts: %q", uuid1)
	}
	if len(parts[0]) != 8 {
		t.Errorf("first part should be 8 hex chars: %q", parts[0])
	}
}

func TestRandomUUID_Format(t *testing.T) {
	uuid := randomUUID()
	parts := strings.Split(uuid, "-")
	if len(parts) != 5 {
		t.Fatalf("UUID should have 5 parts, got %d", len(parts))
	}
	// Version 4: 3rd group starts with '4'
	if len(parts[2]) != 4 || parts[2][0] != '4' {
		t.Errorf("UUID v4 version nibble should be '4xxx', got %q", parts[2])
	}
	// Variant: 4th group starts with '8', '9', 'a', or 'b'
	if len(parts[3]) != 4 {
		t.Errorf("4th part should be 4 chars, got %q", parts[3])
	}
	variantChar := parts[3][0]
	if variantChar != '8' && variantChar != '9' && variantChar != 'a' && variantChar != 'b' {
		t.Errorf("UUID v4 variant nibble should be 8/9/a/b, got %c", variantChar)
	}
}

func TestRandomUUID_Uniqueness(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		uuid := randomUUID()
		if seen[uuid] {
			t.Errorf("duplicate UUID generated: %q", uuid)
		}
		seen[uuid] = true
	}
}

func TestClampStringByFieldType(t *testing.T) {
	result := clampStringByFieldType("hello world this is a very long string", "varchar(10)")
	if len(result) > 10 {
		t.Errorf("clamped string should be at most 10 chars, got %d: %q", len(result), result)
	}
}

func TestClampIntByFieldType(t *testing.T) {
	tests := []struct {
		value  int
		ftype  string
		maxVal int
	}{
		{127, "tinyint", 10},
		{32767, "smallint", 32767},
		{100, "int", 100},
	}
	for _, tt := range tests {
		t.Run(tt.ftype, func(t *testing.T) {
			result := clampIntByFieldType(tt.value, tt.ftype)
			if tt.ftype == "tinyint" && result >= 10 {
				t.Errorf("tinyint result %d should be < 10", result)
			}
		})
	}
}

func TestFormatDecimalByFieldType(t *testing.T) {
	result := formatDecimalByFieldType(123.456, "decimal(10,2)")
	if !strings.Contains(result, ".") {
		t.Errorf("decimal result %q should contain decimal point", result)
	}
}
