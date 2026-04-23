package workspace

import (
	"fmt"
	"regexp"
	"strings"

	"sqltool/internal/database"
)

// --- DDL helper functions ---

func quoteIdentifierByEngine(engine string, value string) string {
	trimmed := strings.TrimSpace(value)
	switch strings.ToLower(engine) {
	case "postgresql", "sqlite":
		return `"` + strings.ReplaceAll(trimmed, `"`, `""`) + `"`
	default:
		return "`" + strings.ReplaceAll(trimmed, "`", "``") + "`"
	}
}

func getIndexTypeClause(engine string, indexType string) string {
	normalizedEngine := strings.ToLower(engine)
	typ := strings.TrimSpace(indexType)
	if typ == "" {
		return ""
	}
	if normalizedEngine == "postgresql" || normalizedEngine == "mysql" || normalizedEngine == "mariadb" {
		return " USING " + typ
	}
	return ""
}

var numericPattern = regexp.MustCompile(`^-?\d+(\.\d+)?$`)

func stringifySQLValue(value string) string {
	if value == "" {
		return "NULL"
	}
	if numericPattern.MatchString(value) {
		return value
	}
	if strings.ToUpper(value) == "CURRENT_TIMESTAMP" {
		return value
	}
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func getDefaultFieldType(engine string) string {
	switch strings.ToLower(engine) {
	case "clickhouse":
		return "String"
	case "sqlite":
		return "TEXT"
	case "postgresql":
		return "varchar(255)"
	default:
		return "varchar(255)"
	}
}

func buildFieldDefinition(engine string, field SchemaFieldInput) string {
	identifier := quoteIdentifierByEngine(engine, field.Name)
	if identifier == quoteIdentifierByEngine(engine, "") {
		identifier = quoteIdentifierByEngine(engine, "new_column")
	}

	fieldType := strings.TrimSpace(field.Type)
	if fieldType == "" {
		fieldType = getDefaultFieldType(engine)
	}

	parts := []string{identifier, fieldType}

	if field.Nullable {
		parts = append(parts, "NULL")
	} else {
		parts = append(parts, "NOT NULL")
	}

	if strings.TrimSpace(field.DefaultValue) != "" {
		parts = append(parts, "DEFAULT "+stringifySQLValue(strings.TrimSpace(field.DefaultValue)))
	}

	if field.AutoIncrement {
		if engine == "postgresql" {
			// PostgreSQL usually uses serial/identity types instead of a suffix.
		} else if engine != "sqlite" && engine != "clickhouse" {
			parts = append(parts, "AUTO_INCREMENT")
		}
	}

	if strings.TrimSpace(field.Comment) != "" && engine != "postgresql" && engine != "sqlite" && engine != "clickhouse" {
		parts = append(parts, "COMMENT '"+strings.ReplaceAll(strings.TrimSpace(field.Comment), "'", "''")+"'")
	}

	return strings.Join(parts, " ")
}

func fieldSignatureFromInput(field SchemaFieldInput) string {
	return strings.Join([]string{
		strings.TrimSpace(field.Name),
		strings.TrimSpace(field.Type),
		boolStr(field.Nullable),
		strings.TrimSpace(field.DefaultValue),
		strings.TrimSpace(field.Comment),
		boolStr(field.Primary),
		boolStr(field.AutoIncrement),
	}, "|")
}

func fieldSignatureFromTable(field TableField) string {
	return strings.Join([]string{
		strings.TrimSpace(field.Name),
		strings.TrimSpace(field.Type),
		boolStr(field.Nullable),
		strings.TrimSpace(field.DefaultValue),
		strings.TrimSpace(field.Comment),
		boolStr(field.Primary),
		boolStr(field.AutoIncrement),
	}, "|")
}

func boolStr(v bool) string {
	if v {
		return "1"
	}
	return "0"
}

// --- BuildAlterSQL generates ALTER TABLE SQL from the current table and draft fields/indexes ---

func (s *Service) BuildAlterSQL(input BuildAlterSQLRequest) (BuildAlterSQLResult, error) {
	if strings.TrimSpace(input.ConnectionID) == "" {
		return BuildAlterSQLResult{}, fmt.Errorf("connectionId is required")
	}
	if strings.TrimSpace(input.Database) == "" {
		return BuildAlterSQLResult{}, fmt.Errorf("database is required")
	}
	if strings.TrimSpace(input.Table) == "" {
		return BuildAlterSQLResult{}, fmt.Errorf("table is required")
	}

	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return BuildAlterSQLResult{}, err
	}

	engine := strings.ToLower(record.Engine)

	// Only support relational engines for ALTER DDL
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB), string(database.PostgreSQL),
		string(database.SQLite), string(database.ClickHouse):
		// supported
	default:
		return BuildAlterSQLResult{SQL: "", Message: fmt.Sprintf("%s 暂未接入 ALTER DDL 生成", record.Engine)}, nil
	}

	// Load current table detail
	tableDetail, err := s.getTableDetailByRecord(record, input.Database, input.Table)
	if err != nil {
		return BuildAlterSQLResult{}, fmt.Errorf("failed to load table detail: %w", err)
	}

	sql := buildAlterSQLFromDetail(engine, &tableDetail, input.Table, input.Fields, input.Indexes, input.Scope)
	message := "ALTER SQL 已生成"
	if strings.HasPrefix(sql, "--") {
		message = "没有可执行的变更"
	}

	return BuildAlterSQLResult{SQL: sql, Message: message}, nil
}

func buildAlterSQLFromDetail(engine string, tableDetail *TableDetail, tableName string, draftFields []SchemaFieldInput, draftIndexes []SchemaIndexInput, scope string) string {
	if tableDetail == nil {
		return "-- 请选择一张真实表"
	}

	statements := []string{}
	postStatements := []string{}

	tableIdentifier := tableName
	if engine == "postgresql" {
		parts := strings.Split(tableName, ".")
		quoted := make([]string, len(parts))
		for i, part := range parts {
			quoted[i] = quoteIdentifierByEngine(engine, part)
		}
		tableIdentifier = strings.Join(quoted, ".")
	} else {
		tableIdentifier = quoteIdentifierByEngine(engine, tableName)
	}

	if scope == "" || scope == "fields" {
		originals := map[string]TableField{}
		for _, field := range tableDetail.Fields {
			originals[field.Name] = field
		}
		draftNames := map[string]bool{}
		for _, field := range draftFields {
			originName := strings.TrimSpace(field.Name)
			draftNames[originName] = true
		}

		// Dropped columns
		for _, field := range tableDetail.Fields {
			if !draftNames[field.Name] {
				if engine == "sqlite" {
					statements = append(statements, fmt.Sprintf("-- SQLite 删除列通常需要重建整张表: %s", field.Name))
				} else {
					statements = append(statements, "DROP COLUMN "+quoteIdentifierByEngine(engine, field.Name))
				}
			}
		}

		// Added or modified columns
		for _, field := range draftFields {
			field := field // capture
			originName := strings.TrimSpace(field.Name)

			if originName == "" {
				// New field (no originName means it's newly added)
				statements = append(statements, "ADD COLUMN "+buildFieldDefinition(engine, field))
				if engine == "postgresql" && strings.TrimSpace(field.Comment) != "" {
					postStatements = append(postStatements, fmt.Sprintf(
						"COMMENT ON COLUMN %s.%s IS '%s';",
						tableIdentifier,
						quoteIdentifierByEngine(engine, field.Name),
						strings.ReplaceAll(strings.TrimSpace(field.Comment), "'", "''"),
					))
				}
				continue
			}

			original, exists := originals[originName]
			if !exists {
				// Origin doesn't exist in table — treat as add
				statements = append(statements, "ADD COLUMN "+buildFieldDefinition(engine, field))
				continue
			}

			// Check if renamed
			if original.Name != strings.TrimSpace(field.Name) {
				// Note: SchemaFieldInput doesn't have originName separate from name,
				// so rename detection is limited. The frontend sends the current name.
				// For now, if name differs from an original, it could be a rename
				// but since we don't have originName in SchemaFieldInput, we skip rename logic.
			}

			// Check for modifications
			if fieldSignatureFromTable(original) != fieldSignatureFromInput(field) {
				if engine == "postgresql" {
					if original.Type != strings.TrimSpace(field.Type) {
						statements = append(statements, fmt.Sprintf(
							"ALTER COLUMN %s TYPE %s",
							quoteIdentifierByEngine(engine, field.Name),
							strings.TrimSpace(field.Type),
						))
					}
					if original.Nullable != field.Nullable {
						if field.Nullable {
							statements = append(statements, fmt.Sprintf(
								"ALTER COLUMN %s DROP NOT NULL",
								quoteIdentifierByEngine(engine, field.Name),
							))
						} else {
							statements = append(statements, fmt.Sprintf(
								"ALTER COLUMN %s SET NOT NULL",
								quoteIdentifierByEngine(engine, field.Name),
							))
						}
					}
					if strings.TrimSpace(original.DefaultValue) != strings.TrimSpace(field.DefaultValue) {
						if strings.TrimSpace(field.DefaultValue) != "" {
							statements = append(statements, fmt.Sprintf(
								"ALTER COLUMN %s SET DEFAULT %s",
								quoteIdentifierByEngine(engine, field.Name),
								stringifySQLValue(strings.TrimSpace(field.DefaultValue)),
							))
						} else {
							statements = append(statements, fmt.Sprintf(
								"ALTER COLUMN %s DROP DEFAULT",
								quoteIdentifierByEngine(engine, field.Name),
							))
						}
					}
					if strings.TrimSpace(original.Comment) != strings.TrimSpace(field.Comment) {
						if strings.TrimSpace(field.Comment) != "" {
							postStatements = append(postStatements, fmt.Sprintf(
								"COMMENT ON COLUMN %s.%s IS '%s';",
								tableIdentifier,
								quoteIdentifierByEngine(engine, field.Name),
								strings.ReplaceAll(strings.TrimSpace(field.Comment), "'", "''"),
							))
						} else {
							postStatements = append(postStatements, fmt.Sprintf(
								"COMMENT ON COLUMN %s.%s IS NULL;",
								tableIdentifier,
								quoteIdentifierByEngine(engine, field.Name),
							))
						}
					}
				} else if engine == "sqlite" {
					statements = append(statements, fmt.Sprintf("-- SQLite 修改列定义通常需要重建整张表: %s", field.Name))
				} else {
					statements = append(statements, "MODIFY COLUMN "+buildFieldDefinition(engine, field))
				}
			}
		}
	}

	if (scope == "" || scope == "indexes") && draftIndexes != nil {
		originalIndexNames := map[string]bool{}
		for _, idx := range tableDetail.Indexes {
			originalIndexNames[idx.Name] = true
		}
		draftIndexNames := map[string]bool{}
		for _, idx := range draftIndexes {
			name := strings.TrimSpace(idx.Name)
			if name != "" {
				draftIndexNames[name] = true
			}
		}

		// Dropped indexes
		for _, idx := range tableDetail.Indexes {
			if !draftIndexNames[idx.Name] {
				if engine == "sqlite" {
					statements = append(statements, fmt.Sprintf("-- SQLite 删除索引/主键通常需要重建表或单独 DROP INDEX: %s", idx.Name))
				} else if idx.Name == "PRIMARY" || idx.Name == "PRIMARY_KEY" {
					statements = append(statements, "DROP PRIMARY KEY")
				} else {
					if engine == "postgresql" {
						postStatements = append(postStatements, fmt.Sprintf("DROP INDEX %s;", quoteIdentifierByEngine(engine, idx.Name)))
					} else {
						statements = append(statements, "DROP INDEX "+quoteIdentifierByEngine(engine, idx.Name))
					}
				}
			}
		}

		// Added or modified indexes
		for _, idx := range draftIndexes {
			idx := idx // capture
			indexTypeClause := getIndexTypeClause(engine, idx.IndexType)

			original, origExists := findOriginalIndex(tableDetail.Indexes, idx.Name)

			if !origExists {
				// New index
				unique := ""
				if idx.Unique {
					unique = "UNIQUE "
				}
				if engine == "postgresql" {
					postStatements = append(postStatements, fmt.Sprintf(
						"CREATE %sINDEX %s ON %s%s (%s);",
						unique,
						quoteIdentifierByEngine(engine, idx.Name),
						tableIdentifier,
						indexTypeClause,
						quoteIndexColumns(engine, idx.Columns),
					))
				} else if engine == "sqlite" {
					postStatements = append(postStatements, fmt.Sprintf(
						"CREATE %sINDEX %s ON %s (%s);",
						unique,
						quoteIdentifierByEngine(engine, idx.Name),
						tableIdentifier,
						quoteIndexColumns(engine, idx.Columns),
					))
				} else {
					statements = append(statements, fmt.Sprintf(
						"ADD %sINDEX %s%s (%s)",
						unique,
						quoteIdentifierByEngine(engine, idx.Name),
						indexTypeClause,
						quoteIndexColumns(engine, idx.Columns),
					))
				}
				continue
			}

			// Check for changes
			nameChanged := original.Name != idx.Name
			colsChanged := strings.Join(original.Columns, ",") != strings.Join(idx.Columns, ",")
			uniqueChanged := original.Unique != idx.Unique
			typeChanged := original.IndexType != idx.IndexType

			if nameChanged || colsChanged || uniqueChanged || typeChanged {
				if engine == "sqlite" {
					statements = append(statements, fmt.Sprintf("-- SQLite 调整索引通常需要 DROP/CREATE 或重建表: %s", idx.Name))
				} else if original.Name == "PRIMARY" || original.Name == "PRIMARY_KEY" {
					statements = append(statements, "DROP PRIMARY KEY")
					statements = append(statements, fmt.Sprintf("ADD PRIMARY KEY (%s)", quoteIndexColumns(engine, idx.Columns)))
				} else {
					if engine == "postgresql" {
						postStatements = append(postStatements, fmt.Sprintf("DROP INDEX %s;", quoteIdentifierByEngine(engine, original.Name)))
					} else {
						statements = append(statements, "DROP INDEX "+quoteIdentifierByEngine(engine, original.Name))
					}
					unique := ""
					if idx.Unique {
						unique = "UNIQUE "
					}
					if engine == "postgresql" {
						postStatements = append(postStatements, fmt.Sprintf(
							"CREATE %sINDEX %s ON %s%s (%s);",
							unique,
							quoteIdentifierByEngine(engine, idx.Name),
							tableIdentifier,
							indexTypeClause,
							quoteIndexColumns(engine, idx.Columns),
						))
					} else if engine == "sqlite" {
						postStatements = append(postStatements, fmt.Sprintf(
							"CREATE %sINDEX %s ON %s (%s);",
							unique,
							quoteIdentifierByEngine(engine, idx.Name),
							tableIdentifier,
							quoteIndexColumns(engine, idx.Columns),
						))
					} else {
						statements = append(statements, fmt.Sprintf(
							"ADD %sINDEX %s%s (%s)",
							unique,
							quoteIdentifierByEngine(engine, idx.Name),
							indexTypeClause,
							quoteIndexColumns(engine, idx.Columns),
						))
					}
				}
			}
		}
	}

	if len(statements) == 0 && len(postStatements) == 0 {
		return "-- 当前没有结构变更"
	}

	if engine == "postgresql" {
		alterStatements := make([]string, 0, len(statements))
		for _, stmt := range statements {
			alterStatements = append(alterStatements, fmt.Sprintf("ALTER TABLE %s\n  %s;", tableIdentifier, stmt))
		}
		return strings.Join(append(alterStatements, postStatements...), "\n\n")
	}

	if engine == "sqlite" {
		return strings.Join(append(statements, postStatements...), "\n")
	}

	result := fmt.Sprintf("ALTER TABLE %s\n  %s;", tableIdentifier, strings.Join(statements, ",\n  "))
	if len(postStatements) > 0 {
		result += "\n\n" + strings.Join(postStatements, "\n\n")
	}
	return result
}

func findOriginalIndex(indexes []TableIndex, name string) (TableIndex, bool) {
	for _, idx := range indexes {
		if idx.Name == name {
			return idx, true
		}
	}
	return TableIndex{}, false
}

func quoteIndexColumns(engine string, columns []string) string {
	quoted := make([]string, len(columns))
	for i, col := range columns {
		quoted[i] = quoteIdentifierByEngine(engine, strings.TrimSpace(col))
	}
	return strings.Join(quoted, ", ")
}

// --- BuildCreateTableSQL generates CREATE TABLE SQL for preview ---

func (s *Service) BuildCreateTableSQL(input BuildCreateTableSQLRequest) (BuildCreateTableSQLResult, error) {
	if strings.TrimSpace(input.ConnectionID) == "" {
		return BuildCreateTableSQLResult{}, fmt.Errorf("connectionId is required")
	}

	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return BuildCreateTableSQLResult{}, err
	}

	engine := strings.ToLower(record.Engine)

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB), string(database.PostgreSQL),
		string(database.SQLite), string(database.ClickHouse):
		// supported
	default:
		return BuildCreateTableSQLResult{Message: fmt.Sprintf("%s 暂未接入 CREATE TABLE DDL 生成", record.Engine)}, nil
	}

	sql := buildCreateTableSQL(engine, input)
	return BuildCreateTableSQLResult{SQL: sql, Message: "CREATE TABLE SQL 已生成"}, nil
}

func buildCreateTableSQL(engine string, input BuildCreateTableSQLRequest) string {
	tableName := strings.TrimSpace(input.TableName)
	database := strings.TrimSpace(input.Database)
	if tableName == "" {
		tableName = "new_table"
	}

	switch engine {
	case "mysql", "mariadb":
		return buildMySQLCreateTableSQL(database, tableName, input)
	case "postgresql":
		return buildPostgreSQLCreateTableSQL(database, tableName, input)
	case "sqlite":
		return buildSQLiteCreateTableSQL(database, tableName, input)
	case "clickhouse":
		return buildClickHouseCreateTableSQL(database, tableName, input)
	default:
		return "-- unsupported engine"
	}
}

func buildMySQLCreateTableSQL(database string, tableName string, input BuildCreateTableSQLRequest) string {
	fieldDefs := []string{}
	primaryCols := []string{}

	for _, f := range input.Fields {
		name := strings.TrimSpace(f.Name)
		if name == "" {
			continue
		}
		fieldDefs = append(fieldDefs, buildFieldDefinition("mysql", f))
		if f.Primary {
			primaryCols = append(primaryCols, quoteIdentifierByEngine("mysql", name))
		}
	}

	if len(primaryCols) > 0 {
		fieldDefs = append(fieldDefs, fmt.Sprintf("PRIMARY KEY (%s)", strings.Join(primaryCols, ", ")))
	}

	for _, idx := range input.Indexes {
		name := strings.TrimSpace(idx.Name)
		if name == "" || len(idx.Columns) == 0 {
			continue
		}
		unique := ""
		if idx.Unique {
			unique = "UNIQUE "
		}
		indexTypeClause := getIndexTypeClause("mysql", idx.IndexType)
		fieldDefs = append(fieldDefs, fmt.Sprintf("%sINDEX %s%s (%s)", unique, quoteIdentifierByEngine("mysql", name), indexTypeClause, quoteIndexColumns("mysql", idx.Columns)))
	}

	if database != "" {
		result := fmt.Sprintf("CREATE TABLE %s.%s (\n  %s\n)", quoteIdentifierByEngine("mysql", database), quoteIdentifierByEngine("mysql", tableName), strings.Join(fieldDefs, ",\n  "))
		if strings.TrimSpace(input.PartitionBy) != "" {
			result += fmt.Sprintf("\n%s", strings.TrimSpace(input.PartitionBy))
		}
		return result + ";"
	}
	result := fmt.Sprintf("CREATE TABLE %s (\n  %s\n)", quoteIdentifierByEngine("mysql", tableName), strings.Join(fieldDefs, ",\n  "))
	if strings.TrimSpace(input.PartitionBy) != "" {
		result += fmt.Sprintf("\n%s", strings.TrimSpace(input.PartitionBy))
	}
	return result + ";"
}

func buildPostgreSQLCreateTableSQL(database string, tableName string, input BuildCreateTableSQLRequest) string {
	schemaName := firstNonEmpty(strings.TrimSpace(input.Schema), "public")
	_, bareTable := splitSchemaAndTable(tableName, schemaName)
	tableIdentifier := fmt.Sprintf("%s.%s", quoteIdentifierByEngine("postgresql", schemaName), quoteIdentifierByEngine("postgresql", bareTable))

	fieldDefs := []string{}
	postStatements := []string{}
	primaryCols := []string{}

	for _, f := range input.Fields {
		name := strings.TrimSpace(f.Name)
		if name == "" {
			continue
		}
		def := fmt.Sprintf("%s %s", quoteIdentifierByEngine("postgresql", name), strings.TrimSpace(f.Type))
		if strings.TrimSpace(f.Type) == "" {
			def = fmt.Sprintf("%s %s", quoteIdentifierByEngine("postgresql", name), getDefaultFieldType("postgresql"))
		}
		if !f.Nullable {
			def += " NOT NULL"
		}
		if strings.TrimSpace(f.DefaultValue) != "" {
			def += fmt.Sprintf(" DEFAULT %s", stringifySQLValue(strings.TrimSpace(f.DefaultValue)))
		}
		fieldDefs = append(fieldDefs, def)
		if f.Primary {
			primaryCols = append(primaryCols, quoteIdentifierByEngine("postgresql", name))
		}
		if strings.TrimSpace(f.Comment) != "" {
			postStatements = append(postStatements, fmt.Sprintf("COMMENT ON COLUMN %s.%s IS '%s';", tableIdentifier, quoteIdentifierByEngine("postgresql", name), strings.ReplaceAll(strings.TrimSpace(f.Comment), "'", "''")))
		}
	}

	if len(primaryCols) > 0 {
		fieldDefs = append(fieldDefs, fmt.Sprintf("PRIMARY KEY (%s)", strings.Join(primaryCols, ", ")))
	}

	for _, idx := range input.Indexes {
		name := strings.TrimSpace(idx.Name)
		if name == "" || len(idx.Columns) == 0 {
			continue
		}
		unique := ""
		if idx.Unique {
			unique = "UNIQUE "
		}
		indexTypeClause := getIndexTypeClause("postgresql", idx.IndexType)
		postStatements = append(postStatements, fmt.Sprintf("CREATE %sINDEX %s ON %s%s (%s);", unique, quoteIdentifierByEngine("postgresql", name), tableIdentifier, indexTypeClause, quoteIndexColumns("postgresql", idx.Columns)))
	}

	result := fmt.Sprintf("CREATE TABLE %s (\n  %s\n);", tableIdentifier, strings.Join(fieldDefs, ",\n  "))
	if len(postStatements) > 0 {
		result += "\n\n" + strings.Join(postStatements, "\n")
	}
	return result
}

func buildSQLiteCreateTableSQL(_ string, tableName string, input BuildCreateTableSQLRequest) string {
	fieldDefs := []string{}
	primaryCols := []string{}

	for _, f := range input.Fields {
		name := strings.TrimSpace(f.Name)
		if name == "" {
			continue
		}
		def := fmt.Sprintf("%s %s", quoteIdentifierByEngine("sqlite", name), strings.TrimSpace(f.Type))
		if strings.TrimSpace(f.Type) == "" {
			def = fmt.Sprintf("%s %s", quoteIdentifierByEngine("sqlite", name), getDefaultFieldType("sqlite"))
		}
		if !f.Nullable {
			def += " NOT NULL"
		}
		if strings.TrimSpace(f.DefaultValue) != "" {
			def += fmt.Sprintf(" DEFAULT %s", stringifySQLValue(strings.TrimSpace(f.DefaultValue)))
		}
		fieldDefs = append(fieldDefs, def)
		if f.Primary {
			primaryCols = append(primaryCols, quoteIdentifierByEngine("sqlite", name))
		}
	}

	if len(primaryCols) > 0 {
		fieldDefs = append(fieldDefs, fmt.Sprintf("PRIMARY KEY (%s)", strings.Join(primaryCols, ", ")))
	}

	return fmt.Sprintf("CREATE TABLE %s (\n  %s\n);", quoteIdentifierByEngine("sqlite", tableName), strings.Join(fieldDefs, ",\n  "))
}

func buildClickHouseCreateTableSQL(database string, tableName string, input BuildCreateTableSQLRequest) string {
	if database == "" {
		database = "default"
	}

	fieldDefs := []string{}
	orderColumns := []string{}

	for _, f := range input.Fields {
		name := strings.TrimSpace(f.Name)
		if name == "" {
			continue
		}
		def := fmt.Sprintf("%s %s", quoteIdentifierByEngine("clickhouse", name), strings.TrimSpace(f.Type))
		if strings.TrimSpace(f.Type) == "" {
			def = fmt.Sprintf("%s %s", quoteIdentifierByEngine("clickhouse", name), getDefaultFieldType("clickhouse"))
		}
		if strings.TrimSpace(f.Comment) != "" {
			def += fmt.Sprintf(" COMMENT '%s'", strings.ReplaceAll(strings.TrimSpace(f.Comment), "'", "''"))
		}
		fieldDefs = append(fieldDefs, def)
		if f.Primary {
			orderColumns = append(orderColumns, quoteIdentifierByEngine("clickhouse", name))
		}
	}

	primaryKey := strings.TrimSpace(input.PrimaryKey)
	orderBy := strings.TrimSpace(input.OrderBy)
	if primaryKey == "" && len(orderColumns) > 0 {
		primaryKey = "(" + strings.Join(orderColumns, ", ") + ")"
	}
	if orderBy == "" {
		orderBy = primaryKey
	}
	if orderBy == "" {
		orderBy = "tuple()"
	}

	result := fmt.Sprintf("CREATE TABLE %s.%s (\n  %s\n) ENGINE = MergeTree()",
		quoteIdentifierByEngine("clickhouse", database),
		quoteIdentifierByEngine("clickhouse", tableName),
		strings.Join(fieldDefs, ",\n  "),
	)

	if strings.TrimSpace(input.PartitionBy) != "" {
		result += fmt.Sprintf("\nPARTITION BY %s", strings.TrimSpace(input.PartitionBy))
	}
	if primaryKey != "" {
		result += fmt.Sprintf("\nPRIMARY KEY %s", primaryKey)
	}
	result += fmt.Sprintf("\nORDER BY %s", orderBy)
	if strings.TrimSpace(input.SampleBy) != "" {
		result += fmt.Sprintf("\nSAMPLE BY %s", strings.TrimSpace(input.SampleBy))
	}
	result += ";"
	return result
}
