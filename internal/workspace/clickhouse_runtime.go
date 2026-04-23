package workspace

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"sqltool/internal/store"
)

func (s *Service) createClickHouseDatabase(record store.ConnectionRecord, input CreateDatabaseRequest) (CreateDatabaseResult, error) {
	dbName := strings.TrimSpace(input.DatabaseName)

	db, err := openClickHouseDatabase(record, "")
	if err != nil {
		return CreateDatabaseResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	sql := fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s", quoteClickHouseIdentifier(dbName))
	engine := strings.TrimSpace(input.Charset)
	if engine != "" {
		sql += fmt.Sprintf(" ENGINE = %s", engine)
	}
	sql += ";"

	if _, err := db.ExecContext(ctx, sql); err != nil {
		return CreateDatabaseResult{Success: false, Message: err.Error()}, nil
	}

	return CreateDatabaseResult{Success: true, Message: fmt.Sprintf("数据库 %s 创建成功", dbName)}, nil
}
func (s *Service) fillClickHouseTable(record store.ConnectionRecord, input FillTableRequest) (FillTableResult, error) {
	database := firstNonEmpty(strings.TrimSpace(input.Database), "default")
	table := strings.TrimSpace(input.Table)
	count := input.Count
	if count <= 0 {
		count = 100
	}

	db, err := openClickHouseDatabase(record, database)
	if err != nil {
		return FillTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	fields, err := loadClickHouseFields(ctx, db, database, table)
	if err != nil {
		return FillTableResult{}, err
	}
	if len(fields) == 0 {
		return FillTableResult{}, errors.New("表中没有字段")
	}

	var colNames []string
	var valuePlaceholders []string
	for _, f := range fields {
		colNames = append(colNames, quoteClickHouseIdentifier(f.Name))
		valuePlaceholders = append(valuePlaceholders, "?")
	}

	if len(colNames) == 0 {
		return FillTableResult{}, errors.New("没有可插入的字段")
	}

	tableIdentifier := fmt.Sprintf("%s.%s", quoteClickHouseIdentifier(database), quoteClickHouseIdentifier(table))
	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		tableIdentifier, strings.Join(colNames, ", "), strings.Join(valuePlaceholders, ", "))

	stmt, err := db.PrepareContext(ctx, sql)
	if err != nil {
		return FillTableResult{}, err
	}
	defer stmt.Close()

	return executeFill(stmt, ctx, fields, count, input.FieldMappings)
}
func (s *Service) getClickHouseExplorerTree(record store.ConnectionRecord, preferredDatabase string) (ExplorerTree, error) {
	db, err := openClickHouseDatabase(record, "")
	if err != nil {
		return ExplorerTree{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, `SELECT name FROM system.databases ORDER BY name`)
	if err != nil {
		return ExplorerTree{}, err
	}
	defer rows.Close()

	var databases []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return ExplorerTree{}, err
		}
		databases = append(databases, name)
	}
	if err := rows.Err(); err != nil {
		return ExplorerTree{}, err
	}

	activeDatabase := chooseActiveDatabase(preferredDatabase, firstNonEmpty(record.Database, "default"), databases)
	nodes := make([]DatabaseNode, 0, len(databases))
	for _, name := range databases {
		tables, err := s.listClickHouseTables(record, name)
		if err != nil {
			return ExplorerTree{}, err
		}
		nodes = append(nodes, DatabaseNode{Name: name, IsSystem: strings.HasPrefix(name, "system"), TableCount: len(tables), Tables: tables})
	}

	activeTable := ""
	for _, node := range nodes {
		if node.Name == activeDatabase && len(node.Tables) > 0 {
			activeTable = node.Tables[0].Name
			break
		}
	}

	return ExplorerTree{ConnectionID: record.ID, ConnectionName: record.Name, Engine: record.Engine, Databases: nodes, ActiveDatabase: activeDatabase, ActiveTable: activeTable, CanDesignTables: true}, nil
}

func (s *Service) listClickHouseTables(record store.ConnectionRecord, databaseName string) ([]TableNode, error) {
	db, err := openClickHouseDatabase(record, databaseName)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, `SELECT name, engine, COALESCE(comment, '') FROM system.tables WHERE database = ? AND is_temporary = 0 ORDER BY name`, databaseName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []TableNode{}
	for rows.Next() {
		var item TableNode
		if err := rows.Scan(&item.Name, &item.Engine, &item.Comment); err != nil {
			return nil, err
		}
		item.Rows = -1
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) getClickHouseTableDetail(record store.ConnectionRecord, databaseName string, tableName string) (TableDetail, error) {
	db, err := openClickHouseDatabase(record, databaseName)
	if err != nil {
		return TableDetail{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	fields, err := loadClickHouseFields(ctx, db, databaseName, tableName)
	if err != nil {
		return TableDetail{}, err
	}
	indexes, err := loadClickHouseIndexes(ctx, db, databaseName, tableName)
	if err != nil {
		return TableDetail{}, err
	}
	ddl, err := loadClickHouseDDL(ctx, db, databaseName, tableName)
	if err != nil {
		return TableDetail{}, err
	}

	return TableDetail{ConnectionID: record.ID, Database: databaseName, Table: tableName, DDL: ddl, Fields: fields, Indexes: indexes, IndexDiagnostics: diagnoseIndexes(fields, indexes)}, nil
}

func (s *Service) previewClickHouseTable(record store.ConnectionRecord, input TablePreviewRequest) (QueryResult, error) {
	statement := fmt.Sprintf("SELECT * FROM %s.%s", quoteClickHouseIdentifier(input.Database), quoteClickHouseIdentifier(input.Table))
	result, err := s.runClickHouseQuery(record, QueryRequest{ConnectionID: input.ConnectionID, Database: input.Database, SQL: statement, Page: input.Page, PageSize: input.PageSize}, false)
	if err != nil {
		return QueryResult{}, err
	}
	result.Message = fmt.Sprintf("已预览表 %s 的前 %d 行数据", input.Table, len(result.Rows))
	return result, nil
}

func (s *Service) getClickHouseTableRowCounts(record store.ConnectionRecord, databaseName string, tables []string) (TableRowCountResult, error) {
	counts := map[string]int64{}
	if len(tables) == 0 {
		return TableRowCountResult{ConnectionID: record.ID, Database: databaseName, Counts: counts}, nil
	}
	db, err := openClickHouseDatabase(record, databaseName)
	if err != nil {
		return TableRowCountResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	placeholders := make([]string, len(tables))
	args := make([]any, 0, len(tables)+1)
	args = append(args, databaseName)
	for index, table := range tables {
		placeholders[index] = "?"
		args = append(args, table)
	}
	query := fmt.Sprintf(`SELECT name, COALESCE(total_rows, 0) FROM system.tables WHERE database = ? AND name IN (%s)`, strings.Join(placeholders, ","))
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return TableRowCountResult{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		var count int64
		if err := rows.Scan(&name, &count); err != nil {
			return TableRowCountResult{}, err
		}
		counts[name] = count
	}
	return TableRowCountResult{ConnectionID: record.ID, Database: databaseName, Counts: counts}, rows.Err()
}

func (s *Service) getClickHouseTablePartitions(record store.ConnectionRecord, input TablePartitionRequest) (TablePartitionResult, error) {
	database := firstNonEmpty(strings.TrimSpace(input.Database), "default")
	db, err := openClickHouseDatabase(record, database)
	if err != nil {
		return TablePartitionResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var partitionKey string
	_ = db.QueryRowContext(ctx, `
		SELECT partition_key FROM system.tables WHERE database = ? AND name = ?
	`, database, input.Table).Scan(&partitionKey)

	rows, err := db.QueryContext(ctx, `
		SELECT
			partition as name,
			count() as part_count,
			sum(rows) as row_count,
			sum(bytes_on_disk) as bytes_on_disk
		FROM system.parts
		WHERE database = ? AND table = ? AND active = 1
		GROUP BY partition
		ORDER BY partition
	`, database, input.Table)
	if err != nil {
		return TablePartitionResult{}, err
	}
	defer rows.Close()

	partitions := []PartitionInfo{}
	for rows.Next() {
		var p PartitionInfo
		var partCount int64
		if err := rows.Scan(&p.Name, &partCount, &p.RowCount, &p.DataSize); err != nil {
			return TablePartitionResult{}, err
		}
		p.Method = "MergeTree"
		p.Expression = partitionKey
		partitions = append(partitions, p)
	}
	if err := rows.Err(); err != nil {
		return TablePartitionResult{}, err
	}

	return TablePartitionResult{
		ConnectionID: input.ConnectionID,
		Database:     database,
		Table:        input.Table,
		PartitionKey: partitionKey,
		Partitions:   partitions,
		Supported:    true,
		Message:      "",
	}, nil
}

func (s *Service) renameClickHouseTable(record store.ConnectionRecord, input RenameTableInput) (RenameTableResult, error) {
	db, err := openClickHouseDatabase(record, input.Database)
	if err != nil {
		return RenameTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	statement := fmt.Sprintf("RENAME TABLE %s.%s TO %s.%s", quoteClickHouseIdentifier(input.Database), quoteClickHouseIdentifier(input.OldName), quoteClickHouseIdentifier(input.Database), quoteClickHouseIdentifier(input.NewName))
	if _, err := db.ExecContext(ctx, statement); err != nil {
		return RenameTableResult{}, err
	}
	return RenameTableResult{Database: input.Database, OldName: input.OldName, NewName: input.NewName, Message: "表已重命名"}, nil
}

func loadClickHouseFields(ctx context.Context, db *sql.DB, databaseName string, tableName string) ([]TableField, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT name, type, COALESCE(default_expression, ''), COALESCE(comment, ''), is_in_primary_key
		FROM system.columns
		WHERE database = ? AND table = ?
		ORDER BY position`, databaseName, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []TableField{}
	for rows.Next() {
		var field TableField
		var inPrimary bool
		if err := rows.Scan(&field.Name, &field.Type, &field.DefaultValue, &field.Comment, &inPrimary); err != nil {
			return nil, err
		}
		field.Nullable = strings.HasPrefix(field.Type, "Nullable(")
		field.Primary = inPrimary
		field.AutoIncrement = false
		items = append(items, field)
	}
	return items, rows.Err()
}

func loadClickHouseIndexes(ctx context.Context, db *sql.DB, databaseName string, tableName string) ([]TableIndex, error) {
	rows, err := db.QueryContext(ctx, `SELECT name, type, expr FROM system.data_skipping_indices WHERE database = ? AND table = ? ORDER BY name`, databaseName, tableName)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unknown table") {
			return []TableIndex{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	items := []TableIndex{}
	for rows.Next() {
		var name string
		var indexType string
		var expr string
		if err := rows.Scan(&name, &indexType, &expr); err != nil {
			return nil, err
		}
		items = append(items, TableIndex{Name: name, Columns: []string{expr}, Unique: false, IndexType: indexType, Cardinality: 0})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var primaryKey string
	var sortingKey string
	metaErr := db.QueryRowContext(ctx, `SELECT COALESCE(primary_key, ''), COALESCE(sorting_key, '') FROM system.tables WHERE database = ? AND name = ?`, databaseName, tableName).Scan(&primaryKey, &sortingKey)
	if metaErr == nil {
		if strings.TrimSpace(primaryKey) != "" {
			items = append(items, TableIndex{Name: "PRIMARY_KEY", Columns: []string{primaryKey}, Unique: false, IndexType: "PRIMARY KEY", Cardinality: 0})
		}
		if strings.TrimSpace(sortingKey) != "" && sortingKey != primaryKey {
			items = append(items, TableIndex{Name: "SORTING_KEY", Columns: []string{sortingKey}, Unique: false, IndexType: "SORTING KEY", Cardinality: 0})
		}
	}

	return items, nil
}

func quoteClickHouseIdentifier(name string) string {
	return "`" + strings.ReplaceAll(strings.TrimSpace(name), "`", "``") + "`"
}

func openClickHouseDatabase(record store.ConnectionRecord, databaseOverride string) (*sql.DB, error) {
	input := connectionInputFromRecord(record)
	dsn, _, err := buildClickHouseDSN(input, databaseOverride)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open("clickhouse", dsn)
	if err != nil {
		return nil, err
	}
	db.SetConnMaxLifetime(2 * time.Minute)
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(2)
	return db, nil
}

func (s *Service) createClickHouseTable(record store.ConnectionRecord, input CreateTableRequest) (CreateTableResult, error) {
	database := firstNonEmpty(strings.TrimSpace(input.Database), "default")
	tableName := strings.TrimSpace(input.TableName)
	if tableName == "" {
		return CreateTableResult{}, errors.New("表名不能为空")
	}
	if len(input.Fields) == 0 {
		return CreateTableResult{}, errors.New("至少需要定义一个字段")
	}

	fieldDefs, primaryKey, orderBy := buildClickHouseCreateTableParts(input)
	statement := fmt.Sprintf("CREATE TABLE %s.%s (\n  %s\n) ENGINE = MergeTree()", quoteClickHouseIdentifier(database), quoteClickHouseIdentifier(tableName), strings.Join(fieldDefs, ",\n  "))
	if strings.TrimSpace(input.PartitionBy) != "" {
		statement += fmt.Sprintf("\nPARTITION BY %s", strings.TrimSpace(input.PartitionBy))
	}
	if primaryKey != "" {
		statement += fmt.Sprintf("\nPRIMARY KEY %s", primaryKey)
	}
	statement += fmt.Sprintf("\nORDER BY %s", orderBy)
	if strings.TrimSpace(input.SampleBy) != "" {
		statement += fmt.Sprintf("\nSAMPLE BY %s", strings.TrimSpace(input.SampleBy))
	}
	statement += ";"
	db, err := openClickHouseDatabase(record, database)
	if err != nil {
		return CreateTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if _, err := db.ExecContext(ctx, statement); err != nil {
		return CreateTableResult{Success: false, Message: err.Error()}, nil
	}
	return CreateTableResult{Success: true, Message: fmt.Sprintf("表 %s.%s 创建成功", database, tableName)}, nil
}

func buildClickHouseCreateTableParts(input CreateTableRequest) ([]string, string, string) {
	fieldDefs := []string{}
	orderColumns := []string{}
	for _, f := range input.Fields {
		name := strings.TrimSpace(f.Name)
		fieldType := strings.TrimSpace(f.Type)
		if name == "" || fieldType == "" {
			continue
		}
		def := fmt.Sprintf("%s %s", quoteClickHouseIdentifier(name), fieldType)
		if strings.TrimSpace(f.Comment) != "" {
			def += fmt.Sprintf(" COMMENT '%s'", strings.ReplaceAll(strings.TrimSpace(f.Comment), "'", "''"))
		}
		fieldDefs = append(fieldDefs, def)
		if f.Primary {
			orderColumns = append(orderColumns, quoteClickHouseIdentifier(name))
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
	if len(orderColumns) > 0 {
		if orderBy == "" {
			orderBy = "(" + strings.Join(orderColumns, ", ") + ")"
		}
	}
	if orderBy == "" {
		orderBy = "tuple()"
	}
	return fieldDefs, primaryKey, orderBy
}
func loadClickHouseDDL(ctx context.Context, db *sql.DB, databaseName string, tableName string) (string, error) {
	query := fmt.Sprintf("SHOW CREATE TABLE %s.%s", quoteClickHouseIdentifier(databaseName), quoteClickHouseIdentifier(tableName))
	var ddl string
	if err := db.QueryRowContext(ctx, query).Scan(&ddl); err != nil {
		return "", err
	}
	return ddl, nil
}
