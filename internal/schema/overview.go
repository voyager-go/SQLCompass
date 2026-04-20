package schema

type RiskGuard struct {
	Action string `json:"action"`
	Level  string `json:"level"`
	Rule   string `json:"rule"`
}

func DefaultRiskGuards() []RiskGuard {
	return []RiskGuard{
		{
			Action: "Drop table or collection",
			Level:  "Critical",
			Rule:   "Always show the final statement preview and require an explicit destructive confirmation before execution.",
		},
		{
			Action: "Drop field or column",
			Level:  "High",
			Rule:   "Call out potential data loss and keep the DDL preview visible until the user confirms.",
		},
		{
			Action: "Bulk delete or update",
			Level:  "High",
			Rule:   "Highlight statements without a restrictive filter and require extra confirmation for production connections.",
		},
		{
			Action: "Natural-language structural changes",
			Level:  "Medium",
			Rule:   "Translate prompts into an intent plan first, then generate SQL or engine-specific commands from validated metadata.",
		},
	}
}
