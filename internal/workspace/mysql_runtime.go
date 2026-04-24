package workspace

import (
	"context"
	dbsql "database/sql"
	"errors"
	"fmt"
	"net"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"

	"sqltool/internal/store"
)

func (s *Service) getMySQLExplorerTree(record store.ConnectionRecord, preferredDatabase string) (ExplorerTree, error) {
	db, err := openMySQLDatabase(record, "")
	if err != nil {
		return ExplorerTree{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, "SHOW DATABASES")
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

	activeDatabase := chooseActiveDatabase(preferredDatabase, record.Database, databases)
	nodes := make([]DatabaseNode, 0, len(databases))
	for _, name := range databases {
		tables, err := s.listMySQLTables(record, name)
		if err != nil {
			return ExplorerTree{}, err
		}

		nodes = append(nodes, DatabaseNode{
			Name:       name,
			IsSystem:   isSystemDatabase(name),
			TableCount: len(tables),
			Tables:     tables,
		})
	}

	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].IsSystem != nodes[j].IsSystem {
			return !nodes[i].IsSystem
		}
		return nodes[i].Name < nodes[j].Name
	})

	activeTable := ""
	for _, node := range nodes {
		if node.Name == activeDatabase && len(node.Tables) > 0 {
			activeTable = node.Tables[0].Name
			break
		}
	}

	return ExplorerTree{
		ConnectionID:    record.ID,
		ConnectionName:  record.Name,
		Engine:          record.Engine,
		Databases:       nodes,
		ActiveDatabase:  activeDatabase,
		ActiveTable:     activeTable,
		CanDesignTables: true,
	}, nil
}
func (s *Service) listMySQLTables(record store.ConnectionRecord, databaseName string) ([]TableNode, error) {
	db, err := openMySQLDatabase(record, databaseName)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 只获取表名、引擎、注释，不获取行数（行数通过异步接口获取）
	rows, err := db.QueryContext(ctx, `
		SELECT table_name, COALESCE(engine, ''), COALESCE(table_comment, '')
		FROM information_schema.tables
		WHERE table_schema = ?
		  AND table_type = 'BASE TABLE'
		ORDER BY table_name
	`, databaseName)
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
		item.Rows = -1 // -1 表示尚未加载
		item.Loading = false
		items = append(items, item)
	}

	return items, rows.Err()
}
func (s *Service) getMySQLTableRowCounts(record store.ConnectionRecord, databaseName string, tables []string) (TableRowCountResult, error) {
	if len(tables) == 0 {
		return TableRowCountResult{
			ConnectionID: record.ID,
			Database:     databaseName,
			Counts:       make(map[string]int64),
		}, nil
	}

	db, err := openMySQLDatabase(record, databaseName)
	if err != nil {
		return TableRowCountResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	counts := make(map[string]int64)

	// 表数量较少时（<=30），使用 COUNT(*) 获取精确行数；否则回退到 information_schema 估算值
	if len(tables) <= 30 {
		for _, table := range tables {
			var count int64
			query := fmt.Sprintf("SELECT COUNT(*) FROM `%s`", escapeIdentifier(table))
			if err := db.QueryRowContext(ctx, query).Scan(&count); err == nil {
				counts[table] = count
			}
		}
	} else {
		placeholders := make([]string, len(tables))
		args := make([]interface{}, len(tables))
		for i, table := range tables {
			placeholders[i] = "?"
			args[i] = table
		}
		args = append([]interface{}{databaseName}, args...)

		query := fmt.Sprintf(`
			SELECT table_name, COALESCE(table_rows, 0)
			FROM information_schema.tables
			WHERE table_schema = ?
			  AND table_name IN (%s)
			  AND table_type = 'BASE TABLE'
		`, strings.Join(placeholders, ","))

		rows, err := db.QueryContext(ctx, query, args...)
		if err != nil {
			return TableRowCountResult{}, err
		}
		defer rows.Close()

		for rows.Next() {
			var tableName string
			var rowCount int64
			if err := rows.Scan(&tableName, &rowCount); err != nil {
				return TableRowCountResult{}, err
			}
			counts[tableName] = rowCount
		}
		if err := rows.Err(); err != nil {
			return TableRowCountResult{}, err
		}
	}

	return TableRowCountResult{
		ConnectionID: record.ID,
		Database:     databaseName,
		Counts:       counts,
	}, nil
}
func (s *Service) getMySQLTableDetail(record store.ConnectionRecord, databaseName string, tableName string) (TableDetail, error) {
	if strings.TrimSpace(databaseName) == "" || strings.TrimSpace(tableName) == "" {
		return TableDetail{}, errors.New("数据库名和表名不能为空")
	}

	db, err := openMySQLDatabase(record, databaseName)
	if err != nil {
		return TableDetail{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	fields, err := loadMySQLFields(ctx, db, databaseName, tableName)
	if err != nil {
		return TableDetail{}, err
	}

	indexes, err := loadMySQLIndexes(ctx, db, databaseName, tableName)
	if err != nil {
		return TableDetail{}, err
	}

	ddl, err := loadMySQLDDL(ctx, db, tableName)
	if err != nil {
		return TableDetail{}, err
	}

	return TableDetail{
		ConnectionID:     record.ID,
		Database:         databaseName,
		Table:            tableName,
		DDL:              ddl,
		Fields:           fields,
		Indexes:          indexes,
		IndexDiagnostics: diagnoseIndexes(fields, indexes),
	}, nil
}
func (s *Service) runMySQLQuery(record store.ConnectionRecord, input QueryRequest, persistHistory bool) (QueryResult, error) {
	statement := strings.TrimSpace(input.SQL)
	if statement == "" {
		return QueryResult{}, errors.New("SQL 不能为空")
	}

	analysis := analyzeSQL(statement)
	page := input.Page
	if page <= 0 {
		page = 1
	}

	pageSize := input.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}

	databaseName := strings.TrimSpace(input.Database)
	if databaseName == "" {
		databaseName = record.Database
	}

	db, err := openMySQLDatabase(record, databaseName)
	if err != nil {
		return QueryResult{}, err
	}
	defer db.Close()

	effectiveSQL, autoLimited := applyDefaultPagination(statement, page, pageSize)
	executedSQL := effectiveSQL
	if queryLikePattern.MatchString(statement) && autoLimited {
		executedSQL = buildLookaheadPaginatedSQL(statement, page, pageSize)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	startedAt := time.Now()
	var result QueryResult
	if queryLikePattern.MatchString(statement) {
		rows, err := db.QueryContext(ctx, executedSQL)
		if err != nil {
			if persistHistory {
				_ = s.appendHistory(record, databaseName, statement, effectiveSQL, analysis, false, 0, time.Since(startedAt))
			}
			return QueryResult{}, err
		}
		defer rows.Close()

		columns, err := rows.Columns()
		if err != nil {
			return QueryResult{}, err
		}

		resultRows, err := scanRows(rows, columns)
		if err != nil {
			return QueryResult{}, err
		}

		hasNextPage := false
		if autoLimited && len(resultRows) > pageSize {
			hasNextPage = true
			resultRows = resultRows[:pageSize]
		}

		duration := time.Since(startedAt)
		if persistHistory {
			_ = s.appendHistory(record, databaseName, statement, effectiveSQL, analysis, true, int64(len(resultRows)), duration)
		}
		result = QueryResult{
			Columns:       columns,
			Rows:          resultRows,
			AffectedRows:  int64(len(resultRows)),
			DurationMS:    duration.Milliseconds(),
			EffectiveSQL:  effectiveSQL,
			StatementType: analysis.StatementType,
			Message:       fmt.Sprintf("查询完成，返回 %d 行", len(resultRows)),
			Page:          page,
			PageSize:      pageSize,
			AutoLimited:   autoLimited,
			HasNextPage:   hasNextPage,
			Analysis:      analysis,
		}
		return result, nil
	}

	execResult, err := db.ExecContext(ctx, statement)
	if err != nil {
		if persistHistory {
			_ = s.appendHistory(record, databaseName, statement, statement, analysis, false, 0, time.Since(startedAt))
		}
		return QueryResult{}, err
	}

	affectedRows, _ := execResult.RowsAffected()
	duration := time.Since(startedAt)
	if persistHistory {
		_ = s.appendHistory(record, databaseName, statement, statement, analysis, true, affectedRows, duration)
	}

	return QueryResult{
		Columns:       []string{},
		Rows:          []map[string]string{},
		AffectedRows:  affectedRows,
		DurationMS:    duration.Milliseconds(),
		EffectiveSQL:  statement,
		StatementType: analysis.StatementType,
		Message:       fmt.Sprintf("执行成功，影响 %d 行", affectedRows),
		Page:          1,
		PageSize:      pageSize,
		AutoLimited:   false,
		HasNextPage:   false,
		Analysis:      analysis,
	}, nil
}
func loadMySQLFields(ctx context.Context, db *dbsql.DB, databaseName string, tableName string) ([]TableField, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT column_name,
		       column_type,
		       is_nullable,
		       COALESCE(column_default, ''),
		       COALESCE(column_comment, ''),
		       column_key,
		       extra
		FROM information_schema.columns
		WHERE table_schema = ?
		  AND table_name = ?
		ORDER BY ordinal_position
	`, databaseName, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fields := []TableField{}
	for rows.Next() {
		var field TableField
		var nullable string
		var columnKey string
		var extra string
		if err := rows.Scan(
			&field.Name,
			&field.Type,
			&nullable,
			&field.DefaultValue,
			&field.Comment,
			&columnKey,
			&extra,
		); err != nil {
			return nil, err
		}

		field.Nullable = strings.EqualFold(nullable, "YES")
		field.Primary = columnKey == "PRI"
		field.AutoIncrement = strings.Contains(strings.ToLower(extra), "auto_increment")
		fields = append(fields, field)
	}

	return fields, rows.Err()
}
func loadMySQLIndexes(ctx context.Context, db *dbsql.DB, databaseName string, tableName string) ([]TableIndex, error) {
	rows, err := db.QueryContext(ctx, fmt.Sprintf("SHOW INDEX FROM `%s`.`%s`", escapeIdentifier(databaseName), escapeIdentifier(tableName)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type rawIndex struct {
		Table        string
		NonUnique    int64
		KeyName      string
		SeqInIndex   int64
		ColumnName   string
		Collation    dbsql.NullString
		Cardinality  dbsql.NullInt64
		SubPart      dbsql.NullInt64
		Packed       dbsql.NullString
		Null         dbsql.NullString
		IndexType    dbsql.NullString
		Comment      dbsql.NullString
		IndexComment dbsql.NullString
		Visible      dbsql.NullString
		Expression   dbsql.NullString
	}

	indexOrder := []string{}
	indexMap := map[string]*TableIndex{}
	for rows.Next() {
		var item rawIndex
		if err := rows.Scan(
			&item.Table,
			&item.NonUnique,
			&item.KeyName,
			&item.SeqInIndex,
			&item.ColumnName,
			&item.Collation,
			&item.Cardinality,
			&item.SubPart,
			&item.Packed,
			&item.Null,
			&item.IndexType,
			&item.Comment,
			&item.IndexComment,
			&item.Visible,
			&item.Expression,
		); err != nil {
			return nil, err
		}

		target := indexMap[item.KeyName]
		if target == nil {
			target = &TableIndex{
				Name:        item.KeyName,
				Columns:     []string{},
				Unique:      item.NonUnique == 0,
				IndexType:   item.IndexType.String,
				Cardinality: item.Cardinality.Int64,
			}
			indexMap[item.KeyName] = target
			indexOrder = append(indexOrder, item.KeyName)
		}

		target.Columns = append(target.Columns, item.ColumnName)
		if item.Cardinality.Valid && item.Cardinality.Int64 > target.Cardinality {
			target.Cardinality = item.Cardinality.Int64
		}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	items := make([]TableIndex, 0, len(indexMap))
	for _, key := range indexOrder {
		items = append(items, *indexMap[key])
	}

	return items, nil
}
func loadMySQLDDL(ctx context.Context, db *dbsql.DB, tableName string) (string, error) {
	row := db.QueryRowContext(ctx, fmt.Sprintf("SHOW CREATE TABLE `%s`", escapeIdentifier(tableName)))
	var name string
	var ddl string
	if err := row.Scan(&name, &ddl); err != nil {
		return "", err
	}

	return ddl, nil
}
func openMySQLDatabase(record store.ConnectionRecord, databaseOverride string) (*dbsql.DB, error) {
	cfg, err := mysqlConfigFromRecord(record)
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(databaseOverride) != "" {
		cfg.DBName = strings.TrimSpace(databaseOverride)
	}

	ensureMySQLTimeouts(cfg)
	db, err := dbsql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		return nil, err
	}

	db.SetConnMaxLifetime(2 * time.Minute)
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(2)

	return db, nil
}
func mysqlConfigFromRecord(record store.ConnectionRecord) (*mysql.Config, error) {
	input := ConnectionInput{
		Engine:   record.Engine,
		Host:     record.Host,
		Port:     record.Port,
		Username: record.Username,
		Password: record.Password,
		Database: record.Database,
		URL:      record.URL,
	}

	cfg := mysql.NewConfig()
	cfg.ParseTime = true
	cfg.Timeout = pingTimeout
	cfg.ReadTimeout = pingTimeout
	cfg.WriteTimeout = pingTimeout

	if strings.TrimSpace(input.URL) != "" {
		trimmedURL := strings.TrimSpace(input.URL)
		if looksLikeMySQLDSN(trimmedURL) {
			parsed, err := mysql.ParseDSN(trimmedURL)
			if err != nil {
				return nil, fmt.Errorf("invalid MySQL DSN: %w", err)
			}
			ensureMySQLTimeouts(parsed)
			return parsed, nil
		}

		parsedURL, err := url.Parse(trimmedURL)
		if err != nil {
			return nil, fmt.Errorf("invalid MySQL URL: %w", err)
		}

		if parsedURL.Host == "" {
			return nil, errors.New("MySQL URL must include a host")
		}

		cfg.User = parsedURL.User.Username()
		if password, ok := parsedURL.User.Password(); ok {
			cfg.Passwd = password
		}
		cfg.Addr = net.JoinHostPort(parsedURL.Hostname(), choosePort(parsedURL.Port(), input.Engine))
		cfg.Net = "tcp"
		cfg.DBName = strings.TrimPrefix(parsedURL.Path, "/")
		cfg.Params = flattenURLQuery(parsedURL)
		ensureMySQLTimeouts(cfg)
		return cfg, nil
	}

	cfg.User = input.Username
	cfg.Passwd = input.Password
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(input.Host, strconv.Itoa(input.Port))
	cfg.DBName = input.Database

	return cfg, nil
}
func (s *Service) createMySQLDatabase(record store.ConnectionRecord, input CreateDatabaseRequest) (CreateDatabaseResult, error) {
	dbName := strings.TrimSpace(input.DatabaseName)
	charset := strings.TrimSpace(input.Charset)
	if charset == "" {
		charset = "utf8mb4"
	}
	collation := strings.TrimSpace(input.Collation)
	if collation == "" {
		collation = "utf8mb4_general_ci"
	}

	db, err := openMySQLDatabase(record, "")
	if err != nil {
		return CreateDatabaseResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	sql := fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET %s COLLATE %s;",
		escapeIdentifier(dbName), charset, collation)
	if _, err := db.ExecContext(ctx, sql); err != nil {
		return CreateDatabaseResult{Success: false, Message: err.Error()}, nil
	}

	return CreateDatabaseResult{Success: true, Message: fmt.Sprintf("数据库 `%s` 创建成功", dbName)}, nil
}
func (s *Service) createMySQLTable(record store.ConnectionRecord, input CreateTableRequest) (CreateTableResult, error) {

	database := strings.TrimSpace(input.Database)
	tableName := strings.TrimSpace(input.TableName)
	if database == "" || tableName == "" {
		return CreateTableResult{}, errors.New("数据库名和表名不能为空")
	}
	if len(input.Fields) == 0 {
		return CreateTableResult{}, errors.New("至少需要定义一个字段")
	}

	var fieldDefs []string
	var primaryCols []string
	for _, f := range input.Fields {
		name := strings.TrimSpace(f.Name)
		fieldType := strings.TrimSpace(f.Type)
		if name == "" || fieldType == "" {
			continue
		}
		def := fmt.Sprintf("`%s` %s", escapeIdentifier(name), fieldType)
		if f.AutoIncrement {
			def += " AUTO_INCREMENT"
		}
		if f.Primary {
			primaryCols = append(primaryCols, fmt.Sprintf("`%s`", escapeIdentifier(name)))
		}
		if !f.Nullable {
			def += " NOT NULL"
		}
		if strings.TrimSpace(f.DefaultValue) != "" {
			def += fmt.Sprintf(" DEFAULT %s", strings.TrimSpace(f.DefaultValue))
		}
		if strings.TrimSpace(f.Comment) != "" {
			def += fmt.Sprintf(" COMMENT '%s'", strings.ReplaceAll(strings.TrimSpace(f.Comment), "'", "\\'"))
		}
		fieldDefs = append(fieldDefs, def)
	}

	if len(primaryCols) > 0 {
		fieldDefs = append(fieldDefs, fmt.Sprintf("PRIMARY KEY (%s)", strings.Join(primaryCols, ", ")))
	}

	for _, idx := range input.Indexes {
		name := strings.TrimSpace(idx.Name)
		if name == "" || len(idx.Columns) == 0 {
			continue
		}
		cols := make([]string, len(idx.Columns))
		for i, c := range idx.Columns {
			cols[i] = fmt.Sprintf("`%s`", escapeIdentifier(strings.TrimSpace(c)))
		}
		unique := ""
		if idx.Unique {
			unique = "UNIQUE "
		}
		indexType := ""
		if strings.TrimSpace(idx.IndexType) != "" {
			indexType = fmt.Sprintf(" USING %s", strings.ToUpper(strings.TrimSpace(idx.IndexType)))
		}
		fieldDefs = append(fieldDefs, fmt.Sprintf("%sINDEX `%s`%s (%s)", unique, escapeIdentifier(name), indexType, strings.Join(cols, ", ")))
	}

	sql := fmt.Sprintf("CREATE TABLE `%s`.`%s` (\n  %s\n)",
		escapeIdentifier(database), escapeIdentifier(tableName), strings.Join(fieldDefs, ",\n  "))

	// MySQL/MariaDB: support PARTITION BY
	if strings.TrimSpace(input.PartitionBy) != "" {
		sql += fmt.Sprintf("\n%s", strings.TrimSpace(input.PartitionBy))
	}
	sql += ";"

	db, err := openMySQLDatabase(record, database)
	if err != nil {
		return CreateTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if _, err := db.ExecContext(ctx, sql); err != nil {
		return CreateTableResult{Success: false, Message: err.Error()}, nil
	}

	return CreateTableResult{Success: true, Message: fmt.Sprintf("表 `%s`.`%s` 创建成功", database, tableName)}, nil
}
func (s *Service) fillMySQLTable(record store.ConnectionRecord, input FillTableRequest) (FillTableResult, error) {
	database := strings.TrimSpace(input.Database)
	table := strings.TrimSpace(input.Table)
	count := input.Count
	if count <= 0 {
		count = 100
	}

	db, err := openMySQLDatabase(record, database)
	if err != nil {
		return FillTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	fields, err := loadMySQLFields(ctx, db, database, table)
	if err != nil {
		return FillTableResult{}, err
	}
	if len(fields) == 0 {
		return FillTableResult{}, errors.New("表中没有字段")
	}

	var colNames []string
	var valuePlaceholders []string
	for _, f := range fields {
		if f.AutoIncrement {
			continue
		}
		colNames = append(colNames, fmt.Sprintf("`%s`", escapeIdentifier(f.Name)))
		valuePlaceholders = append(valuePlaceholders, "?")
	}

	if len(colNames) == 0 {
		return FillTableResult{}, errors.New("没有可插入的字段（可能全是自增）")
	}

	sql := fmt.Sprintf("INSERT INTO `%s` (%s) VALUES (%s)",
		escapeIdentifier(table), strings.Join(colNames, ", "), strings.Join(valuePlaceholders, ", "))

	stmt, err := db.PrepareContext(ctx, sql)
	if err != nil {
		return FillTableResult{}, err
	}
	defer stmt.Close()

	return executeFill(stmt, ctx, fields, count, input.FieldMappings)
}
func (s *Service) getMySQLTablePartitions(record store.ConnectionRecord, input TablePartitionRequest) (TablePartitionResult, error) {
	db, err := openMySQLDatabase(record, input.Database)
	if err != nil {
		return TablePartitionResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var partitionKey string
	_ = db.QueryRowContext(ctx, `
		SELECT PARTITION_EXPRESSION
		FROM information_schema.partitions
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND PARTITION_NAME IS NOT NULL
		LIMIT 1
	`, input.Database, input.Table).Scan(&partitionKey)

	rows, err := db.QueryContext(ctx, `
		SELECT
			PARTITION_NAME,
			PARTITION_METHOD,
			PARTITION_EXPRESSION,
			PARTITION_DESCRIPTION,
			TABLE_ROWS,
			DATA_LENGTH,
			INDEX_LENGTH
		FROM information_schema.partitions
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND PARTITION_NAME IS NOT NULL
		ORDER BY PARTITION_ORDINAL_POSITION
	`, input.Database, input.Table)
	if err != nil {
		return TablePartitionResult{}, err
	}
	defer rows.Close()

	partitions := []PartitionInfo{}
	for rows.Next() {
		var p PartitionInfo
		var desc dbsql.NullString
		if err := rows.Scan(&p.Name, &p.Method, &p.Expression, &desc, &p.RowCount, &p.DataSize, &p.IndexSize); err != nil {
			return TablePartitionResult{}, err
		}
		p.Description = desc.String
		partitions = append(partitions, p)
	}
	if err := rows.Err(); err != nil {
		return TablePartitionResult{}, err
	}

	return TablePartitionResult{
		ConnectionID: input.ConnectionID,
		Database:     input.Database,
		Table:        input.Table,
		PartitionKey: partitionKey,
		Partitions:   partitions,
		Supported:    true,
		Message:      "",
	}, nil
}

func (s *Service) renameMySQLTable(record store.ConnectionRecord, input RenameTableInput) (RenameTableResult, error) {
	db, err := openMySQLDatabase(record, input.Database)
	if err != nil {
		return RenameTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	statement := fmt.Sprintf("RENAME TABLE `%s`.`%s` TO `%s`.`%s`", escapeIdentifier(input.Database), escapeIdentifier(input.OldName), escapeIdentifier(input.Database), escapeIdentifier(input.NewName))
	if _, err := db.ExecContext(ctx, statement); err != nil {
		return RenameTableResult{}, err
	}
	return RenameTableResult{Database: input.Database, OldName: input.OldName, NewName: input.NewName, Message: "表已重命名"}, nil
}
