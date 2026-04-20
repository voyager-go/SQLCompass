package ai

import "sqltool/internal/config"

type Workflow struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	Summary         string   `json:"summary"`
	RequiresPreview bool     `json:"requiresPreview"`
	RiskNotes       []string `json:"riskNotes"`
}

type Overview struct {
	Settings   config.AISettings `json:"settings"`
	Features   []Workflow        `json:"features"`
	Safeguards []string          `json:"safeguards"`
}

func DefaultOverview() Overview {
	return Overview{
		Settings: config.LoadAISettings(),
		Features: []Workflow{
			{
				ID:              "beautify-and-fix",
				Title:           "Beautify and correct SQL",
				Summary:         "Normalize formatting, catch obvious syntax problems, and suggest safer rewrites before a query runs.",
				RequiresPreview: false,
				RiskNotes: []string{
					"Show the rewritten SQL side by side with the original input.",
					"Call out risky clauses such as full-table delete or update statements without filters.",
				},
			},
			{
				ID:              "prompt-to-sql",
				Title:           "Generate SQL from a prompt",
				Summary:         "Turn intent like analytics questions or CRUD requests into executable SQL with schema-aware hints.",
				RequiresPreview: true,
				RiskNotes: []string{
					"Use the live schema snapshot so generated SQL stays grounded in actual tables and columns.",
					"Keep execution manual even when the AI output looks safe.",
				},
			},
			{
				ID:              "natural-language-schema-change",
				Title:           "Translate natural language into structural changes",
				Summary:         "Break down requests such as adding fields, renaming columns, or dropping tables into a reviewed change plan.",
				RequiresPreview: true,
				RiskNotes: []string{
					"DDL is generated after the AI proposes intent, not directly from the prompt.",
					"Destructive actions require explicit confirmation before execution.",
				},
			},
		},
		Safeguards: []string{
			"AI never executes SQL directly.",
			"Every generated DDL or DML statement must pass through a preview and confirmation step.",
			"High-risk operations require a second confirmation dialog with a clear warning.",
			"Driver-specific schema inspection runs before prompt-to-SQL generation whenever metadata is available.",
		},
	}
}
