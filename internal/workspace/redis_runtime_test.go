package workspace

import "testing"

func TestSplitRedisCommandKeepsQuotedValues(t *testing.T) {
	got := splitRedisCommand(`SET greeting "hello world"`)
	want := []string{"SET", "greeting", "hello world"}
	if len(got) != len(want) {
		t.Fatalf("splitRedisCommand length = %d, want %d: %#v", len(got), len(want), got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("splitRedisCommand[%d] = %q, want %q", index, got[index], want[index])
		}
	}
}

func TestSplitRedisCommandEscapedQuote(t *testing.T) {
	got := splitRedisCommand(`SET quote "a \"quoted\" value"`)
	want := []string{"SET", "quote", `a "quoted" value`}
	if len(got) != len(want) {
		t.Fatalf("splitRedisCommand length = %d, want %d: %#v", len(got), len(want), got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("splitRedisCommand[%d] = %q, want %q", index, got[index], want[index])
		}
	}
}
