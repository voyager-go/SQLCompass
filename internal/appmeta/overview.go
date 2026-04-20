package appmeta

import (
	"sqltool/internal/ai"
	"sqltool/internal/database"
	"sqltool/internal/history"
	"sqltool/internal/impexp"
	"sqltool/internal/schema"
)

type NavigationItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type DeliveryPhase struct {
	Name       string   `json:"name"`
	Outcome    string   `json:"outcome"`
	Highlights []string `json:"highlights"`
}

type ProductOverview struct {
	AppName       string                      `json:"appName"`
	Tagline       string                      `json:"tagline"`
	Summary       string                      `json:"summary"`
	DesktopTarget string                      `json:"desktopTarget"`
	Navigation    []NavigationItem            `json:"navigation"`
	Engines       []database.EngineDescriptor `json:"engines"`
	AI            ai.Overview                 `json:"ai"`
	History       history.Overview            `json:"history"`
	ImportExport  impexp.Overview             `json:"importExport"`
	Safeguards    []schema.RiskGuard          `json:"safeguards"`
	Roadmap       []DeliveryPhase             `json:"roadmap"`
	Constraints   []string                    `json:"constraints"`
}

func DefaultProductOverview() ProductOverview {
	return ProductOverview{
		AppName:       "SQLPilot",
		Tagline:       "A desktop client for practical database work: schema edits, query history, AI-assisted SQL, and controlled change previews.",
		Summary:       "The scaffold focuses on a polished desktop shell that can grow into a serious multi-engine workbench without pretending every engine should look relational. MySQL and other SQL engines keep the richest design flow, while MongoDB and Redis get query-first interfaces shaped to their actual operating model.",
		DesktopTarget: "Wails + React + Go desktop application",
		Navigation: []NavigationItem{
			{ID: "connections", Title: "Connections", Description: "Manage MySQL, MariaDB, PostgreSQL, SQLite, ClickHouse, MongoDB, and Redis profiles from one desktop shell."},
			{ID: "explorer", Title: "Explorer", Description: "Browse databases, schemas, tables, collections, and keys without dragging in low-frequency admin features."},
			{ID: "schema-lab", Title: "Schema Lab", Description: "Design tables and fields visually, then inspect the exact change statement before it can execute."},
			{ID: "query-studio", Title: "Query Studio", Description: "Write, format, correct, and rerun SQL or engine-specific commands with persistent history."},
			{ID: "ai-copilot", Title: "AI Copilot", Description: "Use prompt-based SQL generation, SQL cleanup, and natural-language structural changes with strict preview guards."},
			{ID: "transfer-center", Title: "Transfer Center", Description: "Import and export structure or data through SQL, CSV, Excel, and JSON oriented jobs."},
			{ID: "settings", Title: "Settings", Description: "Configure desktop appearance, result behavior, and AI provider details without exposing secrets in the repo."},
		},
		Engines:      database.SupportedEngines(),
		AI:           ai.DefaultOverview(),
		History:      history.DefaultOverview(),
		ImportExport: impexp.DefaultOverview(),
		Safeguards:   schema.DefaultRiskGuards(),
		Roadmap: []DeliveryPhase{
			{
				Name:    "Phase 1",
				Outcome: "Deliver a polished MySQL-first desktop shell with reusable abstractions",
				Highlights: []string{
					"Connection management, schema browser, table designer, DDL preview, SQL formatting, and query history",
					"AI settings page plus prompt-to-SQL and SQL beautify flows with explicit preview controls",
					"CSV, Excel, and SQL import/export jobs for MySQL tables and result grids",
				},
			},
			{
				Name:    "Phase 2",
				Outcome: "Extend the relational feature set across MariaDB, PostgreSQL, SQLite, and ClickHouse",
				Highlights: []string{
					"Dialect-aware DDL generation and schema inspection adapters",
					"Connection capability matrix that selectively enables unsupported workflows",
					"Cross-engine query history and reusable snippets",
				},
			},
			{
				Name:    "Phase 3",
				Outcome: "Add adapted query-first experiences for MongoDB and Redis",
				Highlights: []string{
					"Collection explorer, aggregation builder, and JSON import/export for MongoDB",
					"Key browser, command palette, and safety-gated destructive command review for Redis",
					"AI prompt translation tuned to document and key-value workflows",
				},
			},
		},
		Constraints: []string{
			"Views, foreign keys, triggers, and stored procedures stay out of the main happy path for v1.",
			"AI-generated output is always previewed and never auto-executed.",
			"MongoDB and Redis support is real, but their UX should not be squeezed into a fake table designer.",
			"Secret values must come from secure local storage or environment variables, never committed source files.",
		},
	}
}
