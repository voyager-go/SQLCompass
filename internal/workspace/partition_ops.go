package workspace

import (
	"context"
	"fmt"
	"strings"
	"time"

	"sqltool/internal/store"
)

// --- Partition DDL generation ---

func (s *Service) BuildPartitionDDL(input BuildPartitionDDLRequest) (BuildPartitionDDLResult, error) {
	if strings.TrimSpace(input.ConnectionID) == "" {
		return BuildPartitionDDLResult{}, fmt.Errorf("connectionId is required")
	}
	if strings.TrimSpace(input.Database) == "" {
		return BuildPartitionDDLResult{}, fmt.Errorf("database is required")
	}
	if strings.TrimSpace(input.Table) == "" {
		return BuildPartitionDDLResult{}, fmt.Errorf("table is required")
	}

	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return BuildPartitionDDLResult{}, err
	}

	sql, message, err := s.buildPartitionDDLByRecord(record, input)
	if err != nil {
		return BuildPartitionDDLResult{}, err
	}
	return BuildPartitionDDLResult{SQL: sql, Message: message}, nil
}

func (s *Service) buildPartitionDDLByRecord(record store.ConnectionRecord, input BuildPartitionDDLRequest) (string, string, error) {
	engine := strings.ToLower(record.Engine)

	switch engine {
	case "mysql", "mariadb":
		return buildMySQLPartitionDDL(record, input)
	case "postgresql":
		return buildPostgreSQLPartitionDDL(record, input)
	case "clickhouse":
		return buildClickHousePartitionDDL(record, input)
	default:
		return "", fmt.Sprintf("%s 暂不支持分区操作", record.Engine), nil
	}
}

func buildMySQLPartitionDDL(record store.ConnectionRecord, input BuildPartitionDDLRequest) (string, string, error) {
	tableRef := fmt.Sprintf("`%s`.`%s`", escapeIdentifier(input.Database), escapeIdentifier(input.Table))

	switch input.Action {
	case "add":
		clause := strings.TrimSpace(input.PartitionClause)
		if clause == "" {
			return "", "", fmt.Errorf("分区定义不能为空，如: PARTITION p202505 VALUES LESS THAN ('2025-06-01')")
		}
		// Ensure it starts with PARTITION
		if !strings.HasPrefix(strings.ToUpper(clause), "PARTITION") {
			clause = "PARTITION " + clause
		}
		sql := fmt.Sprintf("ALTER TABLE %s ADD %s;", tableRef, clause)
		return sql, "ADD PARTITION SQL 已生成", nil

	case "drop":
		names := splitPartitionNames(input.PartitionNames)
		if len(names) == 0 {
			return "", "", fmt.Errorf("请指定要删除的分区名")
		}
		sql := fmt.Sprintf("ALTER TABLE %s DROP PARTITION %s;", tableRef, strings.Join(names, ", "))
		return sql, "DROP PARTITION SQL 已生成", nil

	case "truncate":
		names := splitPartitionNames(input.PartitionNames)
		if len(names) == 0 {
			return "", "", fmt.Errorf("请指定要截断的分区名")
		}
		sql := fmt.Sprintf("ALTER TABLE %s TRUNCATE PARTITION %s;", tableRef, strings.Join(names, ", "))
		return sql, "TRUNCATE PARTITION SQL 已生成", nil

	default:
		return "", "", fmt.Errorf("不支持的操作类型: %s", input.Action)
	}
}

func buildPostgreSQLPartitionDDL(record store.ConnectionRecord, input BuildPartitionDDLRequest) (string, string, error) {
	schemaName, bareTable := splitSchemaAndTable(input.Table, "public")
	tableRef := fmt.Sprintf(`%s.%s`, quoteIdentifierByEngine("postgresql", schemaName), quoteIdentifierByEngine("postgresql", bareTable))

	switch input.Action {
	case "add":
		clause := strings.TrimSpace(input.PartitionClause)
		if clause == "" {
			return "", "", fmt.Errorf("分区定义不能为空，如: PARTITION p202505 FOR VALUES FROM ('2025-05-01') TO ('2025-06-01')")
		}
		// PostgreSQL: CREATE TABLE partition_name PARTITION OF parent_table FOR VALUES ...
		// clause should be like: "p202505 FOR VALUES FROM ('2025-05-01') TO ('2025-06-01')"
		sql := fmt.Sprintf("CREATE TABLE %s PARTITION OF %s %s;", quoteIdentifierByEngine("postgresql", clause), tableRef, extractPostgreSQLValuesClause(clause))
		return sql, "ADD PARTITION SQL 已生成", nil

	case "drop":
		names := splitPartitionNames(input.PartitionNames)
		if len(names) == 0 {
			return "", "", fmt.Errorf("请指定要删除的分区名")
		}
		statements := make([]string, 0, len(names))
		for _, name := range names {
			statements = append(statements, fmt.Sprintf("DROP TABLE IF EXISTS %s.%s;", quoteIdentifierByEngine("postgresql", schemaName), quoteIdentifierByEngine("postgresql", name)))
		}
		return strings.Join(statements, "\n"), "DROP PARTITION SQL 已生成", nil

	case "truncate":
		names := splitPartitionNames(input.PartitionNames)
		if len(names) == 0 {
			return "", "", fmt.Errorf("请指定要截断的分区名")
		}
		statements := make([]string, 0, len(names))
		for _, name := range names {
			statements = append(statements, fmt.Sprintf("TRUNCATE TABLE %s.%s;", quoteIdentifierByEngine("postgresql", schemaName), quoteIdentifierByEngine("postgresql", name)))
		}
		return strings.Join(statements, "\n"), "TRUNCATE PARTITION SQL 已生成", nil

	default:
		return "", "", fmt.Errorf("不支持的操作类型: %s", input.Action)
	}
}

// extractPostgreSQLValuesClause extracts "FOR VALUES ..." from a clause like "p202505 FOR VALUES FROM ..."
func extractPostgreSQLValuesClause(clause string) string {
	idx := strings.Index(strings.ToUpper(clause), "FOR VALUES")
	if idx >= 0 {
		return clause[idx:]
	}
	// If no FOR VALUES found, return as-is after the partition name
	parts := strings.SplitN(clause, " ", 2)
	if len(parts) > 1 {
		return parts[1]
	}
	return ""
}

func buildClickHousePartitionDDL(record store.ConnectionRecord, input BuildPartitionDDLRequest) (string, string, error) {
	database := firstNonEmpty(strings.TrimSpace(input.Database), "default")
	tableRef := fmt.Sprintf("%s.%s", quoteClickHouseIdentifier(database), quoteClickHouseIdentifier(input.Table))

	switch input.Action {
	case "add":
		// ClickHouse does not support ADD PARTITION; partitions are created automatically by INSERT.
		return "-- ClickHouse 分区由 INSERT 自动创建，无需手动 ADD PARTITION\n-- 插入数据后分区将自动出现", "ClickHouse 不需要手动添加分区", nil

	case "drop":
		names := splitPartitionNames(input.PartitionNames)
		if len(names) == 0 {
			return "", "", fmt.Errorf("请指定要删除的分区名")
		}
		statements := make([]string, 0, len(names))
		for _, name := range names {
			statements = append(statements, fmt.Sprintf("ALTER TABLE %s DROP PARTITION %s;", tableRef, quoteClickHouseIdentifier(name)))
		}
		return strings.Join(statements, "\n"), "DROP PARTITION SQL 已生成", nil

	case "truncate":
		names := splitPartitionNames(input.PartitionNames)
		if len(names) == 0 {
			return "", "", fmt.Errorf("请指定要截断的分区名")
		}
		statements := make([]string, 0, len(names))
		for _, name := range names {
			statements = append(statements, fmt.Sprintf("ALTER TABLE %s TRUNCATE PARTITION %s;", tableRef, quoteClickHouseIdentifier(name)))
		}
		return strings.Join(statements, "\n"), "TRUNCATE PARTITION SQL 已生成", nil

	default:
		return "", "", fmt.Errorf("不支持的操作类型: %s", input.Action)
	}
}

// --- Partition action execution ---

func (s *Service) ExecutePartitionAction(input PartitionActionRequest) (PartitionActionResult, error) {
	if strings.TrimSpace(input.ConnectionID) == "" {
		return PartitionActionResult{}, fmt.Errorf("connectionId is required")
	}
	if strings.TrimSpace(input.Database) == "" {
		return PartitionActionResult{}, fmt.Errorf("database is required")
	}
	if strings.TrimSpace(input.Table) == "" {
		return PartitionActionResult{}, fmt.Errorf("table is required")
	}
	if strings.TrimSpace(input.Action) == "" {
		return PartitionActionResult{}, fmt.Errorf("action is required")
	}

	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return PartitionActionResult{}, err
	}

	// First build the DDL
	ddlInput := BuildPartitionDDLRequest{
		ConnectionID:    input.ConnectionID,
		Database:        input.Database,
		Table:           input.Table,
		Action:          input.Action,
		PartitionClause: input.PartitionClause,
		PartitionNames:  input.PartitionNames,
	}

	sql, _, err := s.buildPartitionDDLByRecord(record, ddlInput)
	if err != nil {
		return PartitionActionResult{}, err
	}

	if strings.HasPrefix(strings.TrimSpace(sql), "--") {
		return PartitionActionResult{
			Success: true,
			Message: "ClickHouse 分区由 INSERT 自动创建",
			SQL:     sql,
		}, nil
	}

	// Execute the DDL
	engine := strings.ToLower(record.Engine)
	var execErr error

	switch engine {
	case "mysql", "mariadb":
		execErr = s.executeMySQLPartitionAction(record, input.Database, sql)
	case "postgresql":
		execErr = s.executePostgreSQLPartitionAction(record, input.Database, sql)
	case "clickhouse":
		execErr = s.executeClickHousePartitionAction(record, input.Database, sql)
	default:
		return PartitionActionResult{Success: false, Message: fmt.Sprintf("%s 暂不支持分区操作", record.Engine), SQL: sql}, nil
	}

	if execErr != nil {
		return PartitionActionResult{
			Success: false,
			Message: fmt.Sprintf("分区操作失败: %s", execErr.Error()),
			SQL:     sql,
		}, nil
	}

	actionLabel := map[string]string{
		"add":      "添加",
		"drop":     "删除",
		"truncate": "截断",
	}[input.Action]

	return PartitionActionResult{
		Success: true,
		Message: fmt.Sprintf("分区%s操作执行成功", actionLabel),
		SQL:     sql,
	}, nil
}

func (s *Service) executeMySQLPartitionAction(record store.ConnectionRecord, database string, sql string) error {
	db, err := openMySQLDatabase(record, database)
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Handle multi-statement (for drop/truncate multiple partitions, it's already in one statement)
	_, err = db.ExecContext(ctx, sql)
	return err
}

func (s *Service) executePostgreSQLPartitionAction(record store.ConnectionRecord, database string, sql string) error {
	db, err := openPostgreSQLDatabase(record, database)
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// PostgreSQL may have multiple statements
	statements := splitSQLStatements(sql)
	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("执行 %q 失败: %w", stmt, err)
		}
	}
	return nil
}

func (s *Service) executeClickHousePartitionAction(record store.ConnectionRecord, database string, sql string) error {
	db, err := openClickHouseDatabase(record, database)
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	statements := splitSQLStatements(sql)
	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("执行 %q 失败: %w", stmt, err)
		}
	}
	return nil
}

func splitPartitionNames(names string) []string {
	var result []string
	for _, n := range strings.Split(names, ",") {
		n = strings.TrimSpace(n)
		if n != "" {
			result = append(result, n)
		}
	}
	return result
}
