package workspace

import (
	"context"
	dbsql "database/sql"
	"errors"
	"fmt"
	"net"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
	_ "github.com/go-sql-driver/mysql"

	"sqltool/internal/database"
	"sqltool/internal/store"
)

var (
	selectLikePattern = regexp.MustCompile(`(?is)^\s*(select|with)\b`)
	queryLikePattern  = regexp.MustCompile(`(?is)^\s*(select|with|show|desc|describe|explain)\b`)
	limitPattern      = regexp.MustCompile(`(?is)\blimit\s+\d+`)
)

func (s *Service) GetExplorerTree(input ExplorerRequest) (ExplorerTree, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return ExplorerTree{}, err
	}
	return s.getExplorerTreeByRecord(record, input.Database)
}

func (s *Service) GetTableDetail(input TableDetailRequest) (TableDetail, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return TableDetail{}, err
	}
	return s.getTableDetailByRecord(record, input.Database, input.Table)
}

func (s *Service) ExecuteQuery(input QueryRequest) (QueryResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return QueryResult{}, err
	}
	return s.executeQueryByRecord(record, input, true)
}

func (s *Service) PreviewTableData(input TablePreviewRequest) (QueryResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return QueryResult{}, err
	}
	return s.previewTableDataByRecord(record, input)
}

func (s *Service) GetQueryHistory(connectionID string) ([]HistoryItem, error) {
	histState, err := s.store.LoadHistory()
	if err != nil {
		return nil, err
	}

	items := make([]HistoryItem, 0, len(histState.History))
	for _, record := range histState.History {
		if strings.TrimSpace(connectionID) != "" && record.ConnectionID != strings.TrimSpace(connectionID) {
			continue
		}

		items = append(items, HistoryItem{
			ID:            record.ID,
			ConnectionID:  record.ConnectionID,
			Engine:        record.Engine,
			Database:      record.Database,
			Statement:     record.Statement,
			StatementType: record.StatementType,
			RiskLevel:     record.RiskLevel,
			Success:       record.Success,
			DurationMS:    record.DurationMS,
			RowCount:      record.RowCount,
			CreatedAt:     record.CreatedAt,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt > items[j].CreatedAt
	})

	return items, nil
}

func (s *Service) RenameTable(input RenameTableInput) (RenameTableResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return RenameTableResult{}, err
	}

	if strings.TrimSpace(input.Database) == "" {
		return RenameTableResult{}, errors.New("数据库名不能为空")
	}
	if strings.TrimSpace(input.OldName) == "" || strings.TrimSpace(input.NewName) == "" {
		return RenameTableResult{}, errors.New("旧表名和新表名不能为空")
	}
	return s.renameTableByRecord(record, input)
}

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

// listMySQLTables 快速获取表列表（不含行数，避免大数据表查询卡顿）
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

// GetTableRowCounts 异步获取表行数
func (s *Service) GetTableRowCounts(input TableRowCountRequest) (TableRowCountResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return TableRowCountResult{}, err
	}
	return s.getTableRowCountsByRecord(record, input.Database, input.Tables)
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

	// 构建 IN 子句
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

	counts := make(map[string]int64)
	for rows.Next() {
		var tableName string
		var rowCount int64
		if err := rows.Scan(&tableName, &rowCount); err != nil {
			return TableRowCountResult{}, err
		}
		counts[tableName] = rowCount
	}

	return TableRowCountResult{
		ConnectionID: record.ID,
		Database:     databaseName,
		Counts:       counts,
	}, rows.Err()
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
		executedSQL = buildPaginatedSQL(statement, page, pageSize+1)
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

func scanRows(rows *dbsql.Rows, columns []string) ([]map[string]string, error) {
	result := []map[string]string{}
	for rows.Next() {
		values := make([]any, len(columns))
		scanArgs := make([]any, len(columns))
		for i := range values {
			scanArgs[i] = &values[i]
		}

		if err := rows.Scan(scanArgs...); err != nil {
			return nil, err
		}

		item := map[string]string{}
		for i, column := range columns {
			switch value := values[i].(type) {
			case nil:
				item[column] = ""
			case []byte:
				item[column] = string(value)
			case time.Time:
				item[column] = value.Format("2006-01-02 15:04:05")
			default:
				item[column] = fmt.Sprint(value)
			}
		}
		result = append(result, item)
	}

	return result, rows.Err()
}

func buildPaginatedSQL(statement string, page int, pageSize int) string {
	offset := (page - 1) * pageSize
	return fmt.Sprintf("%s LIMIT %d OFFSET %d", strings.TrimRight(statement, "; \n\t"), pageSize, offset)
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

func diagnoseIndexes(fields []TableField, indexes []TableIndex) []IndexDiagnostic {
	diagnostics := []IndexDiagnostic{}
	hasPrimary := false
	signatures := map[string]string{}

	for _, index := range indexes {
		if index.Name == "PRIMARY" {
			hasPrimary = true
		}

		signature := strings.Join(index.Columns, ",")
		if existing, exists := signatures[signature]; exists && existing != index.Name {
			diagnostics = append(diagnostics, IndexDiagnostic{
				Level:  "warning",
				Title:  "重复索引",
				Detail: fmt.Sprintf("索引 %s 与 %s 覆盖了相同的列顺序：%s", index.Name, existing, signature),
			})
		} else {
			signatures[signature] = index.Name
		}
	}

	if !hasPrimary {
		diagnostics = append(diagnostics, IndexDiagnostic{
			Level:  "high",
			Title:  "缺少主键",
			Detail: "当前表没有主键，更新、删除、分页和复制语句都会更脆弱。",
		})
	}

	for _, index := range indexes {
		if len(index.Columns) != 1 || index.Name == "PRIMARY" {
			continue
		}

		for _, other := range indexes {
			if other.Name == index.Name || len(other.Columns) <= 1 {
				continue
			}

			if other.Columns[0] == index.Columns[0] {
				diagnostics = append(diagnostics, IndexDiagnostic{
					Level:  "info",
					Title:  "可能的冗余前缀索引",
					Detail: fmt.Sprintf("索引 %s 可能已被复合索引 %s 的前缀覆盖。", index.Name, other.Name),
				})
				break
			}
		}
	}

	if len(diagnostics) == 0 {
		diagnostics = append(diagnostics, IndexDiagnostic{
			Level:  "ok",
			Title:  "未发现明显问题",
			Detail: fmt.Sprintf("已检查 %d 个字段和 %d 个索引。", len(fields), len(indexes)),
		})
	}

	return diagnostics
}

func applyDefaultPagination(statement string, page int, pageSize int) (string, bool) {
	trimmed := strings.TrimSpace(strings.TrimSuffix(statement, ";"))
	if !selectLikePattern.MatchString(trimmed) {
		return statement, false
	}

	if limitPattern.MatchString(trimmed) {
		return trimmed + ";", false
	}

	offset := (page - 1) * pageSize
	return fmt.Sprintf("%s LIMIT %d OFFSET %d;", trimmed, pageSize, offset), true
}

func chooseActiveDatabase(preferred string, fallback string, items []string) string {
	if strings.TrimSpace(preferred) != "" {
		for _, item := range items {
			if item == strings.TrimSpace(preferred) {
				return item
			}
		}
	}

	if strings.TrimSpace(fallback) != "" {
		for _, item := range items {
			if item == strings.TrimSpace(fallback) {
				return item
			}
		}
	}

	for _, item := range items {
		if !isSystemDatabase(item) {
			return item
		}
	}

	if len(items) > 0 {
		return items[0]
	}

	return ""
}

func isSystemDatabase(name string) bool {
	switch strings.ToLower(name) {
	case "information_schema", "performance_schema", "mysql", "sys":
		return true
	default:
		return false
	}
}

func escapeIdentifier(name string) string {
	return strings.ReplaceAll(strings.TrimSpace(name), "`", "``")
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

func choosePort(port string, engine string) string {
	if strings.TrimSpace(port) != "" {
		return port
	}
	return strconv.Itoa(defaultPortForEngine(engine))
}

func (s *Service) appendHistory(record store.ConnectionRecord, databaseName string, statement string, executedSQL string, analysis SQLAnalysis, success bool, rowCount int64, duration time.Duration) error {
	history := store.QueryHistoryRecord{
		ID:            newID(),
		ConnectionID:  record.ID,
		Engine:        record.Engine,
		Database:      databaseName,
		Statement:     strings.TrimSpace(statement),
		ExecutedSQL:   strings.TrimSpace(executedSQL),
		StatementType: analysis.StatementType,
		RiskLevel:     analysis.RiskLevel,
		Success:       success,
		DurationMS:    duration.Milliseconds(),
		RowCount:      rowCount,
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
	}

	return s.store.AppendHistory(history)
}

func (s *Service) getConnectionRecord(id string) (store.ConnectionRecord, error) {
	trimmed := strings.TrimSpace(id)
	if trimmed == "" {
		return store.ConnectionRecord{}, errors.New("connection id is required")
	}

	state, err := s.store.LoadConnections()
	if err != nil {
		return store.ConnectionRecord{}, err
	}

	for _, record := range state.Connections {
		if record.ID == trimmed {
			return record, nil
		}
	}

	return store.ConnectionRecord{}, errors.New("connection not found")
}

func (s *Service) CreateDatabase(input CreateDatabaseRequest) (CreateDatabaseResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return CreateDatabaseResult{}, err
	}

	dbName := strings.TrimSpace(input.DatabaseName)
	if dbName == "" {
		return CreateDatabaseResult{}, errors.New("数据库名不能为空")
	}

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.createMySQLDatabase(record, input)
	case string(database.PostgreSQL):
		return s.createPostgreSQLDatabase(record, input)
	case string(database.ClickHouse):
		return s.createClickHouseDatabase(record, input)
	case string(database.SQLite):
		return CreateDatabaseResult{Success: false, Message: "SQLite 不支持创建数据库，每个文件即为一个数据库"}, nil
	case string(database.Redis):
		return CreateDatabaseResult{Success: false, Message: "Redis 不支持创建数据库"}, nil
	default:
		return CreateDatabaseResult{Success: false, Message: fmt.Sprintf("%s 暂未接入创建数据库", record.Engine)}, nil
	}
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

func (s *Service) createPostgreSQLDatabase(record store.ConnectionRecord, input CreateDatabaseRequest) (CreateDatabaseResult, error) {
	dbName := strings.TrimSpace(input.DatabaseName)
	charset := strings.TrimSpace(input.Charset)
	if charset == "" {
		charset = "UTF8"
	}

	db, err := openPostgreSQLDatabase(record, firstNonEmpty(record.Database, "postgres"))
	if err != nil {
		return CreateDatabaseResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	sql := fmt.Sprintf(`CREATE DATABASE %s ENCODING '%s'`, quotePostgreSQLIdentifier(dbName), charset)
	collation := strings.TrimSpace(input.Collation)
	if collation != "" {
		sql += fmt.Sprintf(` LC_COLLATE '%s' LC_CTYPE '%s'`, collation, collation)
	}
	sql += ";"

	if _, err := db.ExecContext(ctx, sql); err != nil {
		return CreateDatabaseResult{Success: false, Message: err.Error()}, nil
	}

	return CreateDatabaseResult{Success: true, Message: fmt.Sprintf("数据库 %s 创建成功", dbName)}, nil
}

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

func (s *Service) CreateTable(input CreateTableRequest) (CreateTableResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return CreateTableResult{}, err
	}

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.createMySQLTable(record, input)
	case string(database.PostgreSQL):
		return s.createPostgreSQLTable(record, input)
	case string(database.SQLite):
		return s.createSQLiteTable(record, input)
	case string(database.ClickHouse):
		return s.createClickHouseTable(record, input)
	default:
		return CreateTableResult{}, fmt.Errorf("%s 暂未接入可视化建表", record.Engine)
	}
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
		fieldDefs = append(fieldDefs, fmt.Sprintf("%sINDEX `%s` (%s)", unique, escapeIdentifier(name), strings.Join(cols, ", ")))
	}

	sql := fmt.Sprintf("CREATE TABLE `%s`.`%s` (\n  %s\n);",
		escapeIdentifier(database), escapeIdentifier(tableName), strings.Join(fieldDefs, ",\n  "))

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

func (s *Service) FillTableData(input FillTableRequest) (FillTableResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return FillTableResult{}, err
	}

	dbName := strings.TrimSpace(input.Database)
	tableName := strings.TrimSpace(input.Table)
	if dbName == "" || tableName == "" {
		return FillTableResult{}, errors.New("数据库名和表名不能为空")
	}

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.fillMySQLTable(record, input)
	case string(database.PostgreSQL):
		return s.fillPostgreSQLTable(record, input)
	case string(database.SQLite):
		return s.fillSQLiteTable(record, input)
	case string(database.ClickHouse):
		return s.fillClickHouseTable(record, input)
	case string(database.Redis):
		return FillTableResult{Success: false, Message: "Redis 不支持填充数据"}, nil
	default:
		return FillTableResult{Success: false, Message: fmt.Sprintf("%s 暂未接入填充数据", record.Engine)}, nil
	}
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

	return executeFill(stmt, ctx, fields, count)
}

func (s *Service) fillPostgreSQLTable(record store.ConnectionRecord, input FillTableRequest) (FillTableResult, error) {
	database := strings.TrimSpace(input.Database)
	table := strings.TrimSpace(input.Table)
	count := input.Count
	if count <= 0 {
		count = 100
	}

	db, err := openPostgreSQLDatabase(record, database)
	if err != nil {
		return FillTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	schemaName, bareTable := splitSchemaAndTable(table, "public")
	fields, err := loadPostgreSQLFields(ctx, db, schemaName, bareTable)
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
		colNames = append(colNames, quotePostgreSQLIdentifier(f.Name))
		valuePlaceholders = append(valuePlaceholders, fmt.Sprintf("$%d", len(colNames)))
	}

	if len(colNames) == 0 {
		return FillTableResult{}, errors.New("没有可插入的字段")
	}

	tableIdentifier := fmt.Sprintf("%s.%s", quotePostgreSQLIdentifier(schemaName), quotePostgreSQLIdentifier(bareTable))
	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		tableIdentifier, strings.Join(colNames, ", "), strings.Join(valuePlaceholders, ", "))

	stmt, err := db.PrepareContext(ctx, sql)
	if err != nil {
		return FillTableResult{}, err
	}
	defer stmt.Close()

	return executeFill(stmt, ctx, fields, count)
}

func (s *Service) fillSQLiteTable(record store.ConnectionRecord, input FillTableRequest) (FillTableResult, error) {
	database := firstNonEmpty(strings.TrimSpace(input.Database), "main")
	table := strings.TrimSpace(input.Table)
	count := input.Count
	if count <= 0 {
		count = 100
	}

	db, err := openSQLiteDatabase(record)
	if err != nil {
		return FillTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	fields, err := loadSQLiteFields(ctx, db, database, table)
	if err != nil {
		return FillTableResult{}, err
	}
	if len(fields) == 0 {
		return FillTableResult{}, errors.New("表中没有字段")
	}

	var colNames []string
	var valuePlaceholders []string
	for _, f := range fields {
		colNames = append(colNames, quoteSQLiteIdentifier(f.Name))
		valuePlaceholders = append(valuePlaceholders, "?")
	}

	if len(colNames) == 0 {
		return FillTableResult{}, errors.New("没有可插入的字段")
	}

	tableIdentifier := fmt.Sprintf("%s.%s", quoteSQLiteIdentifier(database), quoteSQLiteIdentifier(table))
	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		tableIdentifier, strings.Join(colNames, ", "), strings.Join(valuePlaceholders, ", "))

	stmt, err := db.PrepareContext(ctx, sql)
	if err != nil {
		return FillTableResult{}, err
	}
	defer stmt.Close()

	return executeFill(stmt, ctx, fields, count)
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

	return executeFill(stmt, ctx, fields, count)
}

func executeFill(stmt *dbsql.Stmt, ctx context.Context, fields []TableField, count int) (FillTableResult, error) {
	inserted := 0
	for i := 0; i < count; i++ {
		args := make([]any, 0, len(fields))
		for _, f := range fields {
			if f.AutoIncrement {
				continue
			}
			args = append(args, generateFakeValue(f.Type, i))
		}
		if _, err := stmt.ExecContext(ctx, args...); err != nil {
			return FillTableResult{Success: false, Message: err.Error(), InsertedRows: inserted}, nil
		}
		inserted++
	}

	return FillTableResult{
		Success:      true,
		Message:      fmt.Sprintf("成功插入 %d 行数据", inserted),
		InsertedRows: inserted,
	}, nil
}

func generateFakeValue(fieldType string, seed int) any {
	lower := strings.ToLower(fieldType)
	switch {
	case strings.Contains(lower, "int"):
		return seed + 1
	case strings.Contains(lower, "float"), strings.Contains(lower, "double"), strings.Contains(lower, "decimal"):
		return float64(seed) + 0.5
	case strings.Contains(lower, "bool"):
		return seed%2 == 0
	case strings.Contains(lower, "date") && strings.Contains(lower, "time"):
		return time.Now().Add(time.Duration(seed) * time.Second).Format("2006-01-02 15:04:05")
	case strings.Contains(lower, "date"):
		return time.Now().Add(time.Duration(seed) * time.Hour * 24).Format("2006-01-02")
	case strings.Contains(lower, "time"):
		return time.Now().Add(time.Duration(seed) * time.Second).Format("15:04:05")
	case strings.Contains(lower, "text"), strings.Contains(lower, "char"):
		return fmt.Sprintf("val_%x", seed+1)
	case strings.Contains(lower, "blob"), strings.Contains(lower, "binary"):
		return []byte(fmt.Sprintf("bin_%x", seed+1))
	default:
		return fmt.Sprintf("val_%x", seed+1)
	}
}
