package database

type Kind string

const (
	MySQL      Kind = "mysql"
	MariaDB    Kind = "mariadb"
	PostgreSQL Kind = "postgresql"
	SQLite     Kind = "sqlite"
	ClickHouse Kind = "clickhouse"
	MongoDB    Kind = "mongodb"
	Redis      Kind = "redis"
)

type Capability struct {
	QueryEditor     bool `json:"queryEditor"`
	SchemaBrowser   bool `json:"schemaBrowser"`
	TableDesigner   bool `json:"tableDesigner"`
	DDLPreview      bool `json:"ddlPreview"`
	AIAssist        bool `json:"aiAssist"`
	IntentPreview   bool `json:"intentPreview"`
	CSVImport       bool `json:"csvImport"`
	ExcelImport     bool `json:"excelImport"`
	DataExport      bool `json:"dataExport"`
	StructureExport bool `json:"structureExport"`
}

type EngineDescriptor struct {
	ID            Kind       `json:"id"`
	Name          string     `json:"name"`
	Category      string     `json:"category"`
	QueryLanguage string     `json:"queryLanguage"`
	Summary       string     `json:"summary"`
	Capability    Capability `json:"capability"`
}

func SupportedEngines() []EngineDescriptor {
	return []EngineDescriptor{
		{
			ID:            MySQL,
			Name:          "MySQL",
			Category:      "relational",
			QueryLanguage: "SQL",
			Summary:       "Primary first-class engine for schema design, DDL preview, SQL history, and AI-assisted query workflows.",
			Capability: Capability{
				QueryEditor:     true,
				SchemaBrowser:   true,
				TableDesigner:   true,
				DDLPreview:      true,
				AIAssist:        true,
				IntentPreview:   true,
				CSVImport:       true,
				ExcelImport:     true,
				DataExport:      true,
				StructureExport: true,
			},
		},
		{
			ID:            MariaDB,
			Name:          "MariaDB",
			Category:      "relational",
			QueryLanguage: "SQL",
			Summary:       "MySQL-adjacent workflow with shared schema editor patterns and dialect-specific DDL rendering.",
			Capability: Capability{
				QueryEditor:     true,
				SchemaBrowser:   true,
				TableDesigner:   true,
				DDLPreview:      true,
				AIAssist:        true,
				IntentPreview:   true,
				CSVImport:       true,
				ExcelImport:     true,
				DataExport:      true,
				StructureExport: true,
			},
		},
		{
			ID:            PostgreSQL,
			Name:          "PostgreSQL",
			Category:      "relational",
			QueryLanguage: "SQL",
			Summary:       "SQL editor, schema browser, and change preview stay first-class, while advanced PostgreSQL-specific objects stay out of scope for v1.",
			Capability: Capability{
				QueryEditor:     true,
				SchemaBrowser:   true,
				TableDesigner:   true,
				DDLPreview:      true,
				AIAssist:        true,
				IntentPreview:   true,
				CSVImport:       true,
				ExcelImport:     true,
				DataExport:      true,
				StructureExport: true,
			},
		},
		{
			ID:            SQLite,
			Name:          "SQLite",
			Category:      "embedded relational",
			QueryLanguage: "SQL",
			Summary:       "Single-file workflows with lightweight schema editing and export/import conveniences.",
			Capability: Capability{
				QueryEditor:     true,
				SchemaBrowser:   true,
				TableDesigner:   true,
				DDLPreview:      true,
				AIAssist:        true,
				IntentPreview:   true,
				CSVImport:       true,
				ExcelImport:     true,
				DataExport:      true,
				StructureExport: true,
			},
		},
		{
			ID:            ClickHouse,
			Name:          "ClickHouse",
			Category:      "columnar",
			QueryLanguage: "SQL",
			Summary:       "Analytics-oriented workbench with query, structure inspection, and export pipelines tuned for large result sets.",
			Capability: Capability{
				QueryEditor:     true,
				SchemaBrowser:   true,
				TableDesigner:   true,
				DDLPreview:      true,
				AIAssist:        true,
				IntentPreview:   true,
				CSVImport:       true,
				ExcelImport:     true,
				DataExport:      true,
				StructureExport: true,
			},
		},
		{
			ID:            MongoDB,
			Name:          "MongoDB",
			Category:      "document",
			QueryLanguage: "JSON pipeline",
			Summary:       "Collection explorer and AI prompt-to-query flow replace a strict table designer, while import/export stays available.",
			Capability: Capability{
				QueryEditor:     true,
				SchemaBrowser:   true,
				TableDesigner:   false,
				DDLPreview:      false,
				AIAssist:        true,
				IntentPreview:   true,
				CSVImport:       true,
				ExcelImport:     true,
				DataExport:      true,
				StructureExport: true,
			},
		},
		{
			ID:            Redis,
			Name:          "Redis",
			Category:      "cache",
			QueryLanguage: "Command",
			Summary:       "Key browser and command console use safety-gated destructive operations rather than a relational schema editor.",
			Capability: Capability{
				QueryEditor:     true,
				SchemaBrowser:   true,
				TableDesigner:   false,
				DDLPreview:      false,
				AIAssist:        true,
				IntentPreview:   true,
				CSVImport:       false,
				ExcelImport:     false,
				DataExport:      true,
				StructureExport: false,
			},
		},
	}
}
