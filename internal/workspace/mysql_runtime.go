package workspace

import (
	"context"
	"database/sql"
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

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.getMySQLExplorerTree(record, input.Database)
	default:
		return ExplorerTree{}, fmt.Errorf("%s 暂未接入真实结构浏览", record.Engine)
	}
}

func (s *Service) GetTableDetail(input TableDetailRequest) (TableDetail, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return TableDetail{}, err
	}

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.getMySQLTableDetail(record, input.Database, input.Table)
	default:
		return TableDetail{}, fmt.Errorf("%s 暂未接入真实表结构读取", record.Engine)
	}
}

func (s *Service) ExecuteQuery(input QueryRequest) (QueryResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return QueryResult{}, err
	}

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.runMySQLQuery(record, input, true)
	default:
		return QueryResult{}, fmt.Errorf("%s 暂未接入真实 SQL 执行", record.Engine)
	}
}

func (s *Service) PreviewTableData(input TablePreviewRequest) (QueryResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return QueryResult{}, err
	}

	if strings.TrimSpace(input.Database) == "" || strings.TrimSpace(input.Table) == "" {
		return QueryResult{}, errors.New("数据库名和表名不能为空")
	}

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		result, err := s.runMySQLQuery(record, QueryRequest{
			ConnectionID: input.ConnectionID,
			Database:     input.Database,
			SQL:          fmt.Sprintf("SELECT * FROM `%s`", escapeIdentifier(input.Table)),
			Page:         input.Page,
			PageSize:     input.PageSize,
		}, false)
		if err != nil {
			return QueryResult{}, err
		}

		result.Message = fmt.Sprintf("已预览表 %s 的前 %d 行数据", input.Table, len(result.Rows))
		return result, nil
	default:
		return QueryResult{}, fmt.Errorf("%s 暂未接入真实表数据预览", record.Engine)
	}
}

func (s *Service) GetQueryHistory(connectionID string) ([]HistoryItem, error) {
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}

	items := make([]HistoryItem, 0, len(state.History))
	for _, record := range state.History {
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

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
	default:
		return RenameTableResult{}, fmt.Errorf("%s 暂未接入真实重命名表", record.Engine)
	}

	db, err := openMySQLDatabase(record, input.Database)
	if err != nil {
		return RenameTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	statement := fmt.Sprintf("RENAME TABLE `%s`.`%s` TO `%s`.`%s`",
		escapeIdentifier(input.Database),
		escapeIdentifier(input.OldName),
		escapeIdentifier(input.Database),
		escapeIdentifier(input.NewName),
	)

	if _, err := db.ExecContext(ctx, statement); err != nil {
		return RenameTableResult{}, err
	}

	return RenameTableResult{
		Database: input.Database,
		OldName:  input.OldName,
		NewName:  input.NewName,
		Message:  "表已重命名",
	}, nil
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

func (s *Service) listMySQLTables(record store.ConnectionRecord, databaseName string) ([]TableNode, error) {
	db, err := openMySQLDatabase(record, databaseName)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, `
		SELECT table_name, COALESCE(table_rows, 0), COALESCE(engine, ''), COALESCE(table_comment, '')
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
		if err := rows.Scan(&item.Name, &item.Rows, &item.Engine, &item.Comment); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
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
		pageSize = 50
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

func scanRows(rows *sql.Rows, columns []string) ([]map[string]string, error) {
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

func loadMySQLFields(ctx context.Context, db *sql.DB, databaseName string, tableName string) ([]TableField, error) {
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

func loadMySQLIndexes(ctx context.Context, db *sql.DB, databaseName string, tableName string) ([]TableIndex, error) {
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
		Collation    sql.NullString
		Cardinality  sql.NullInt64
		SubPart      sql.NullInt64
		Packed       sql.NullString
		Null         sql.NullString
		IndexType    sql.NullString
		Comment      sql.NullString
		IndexComment sql.NullString
		Visible      sql.NullString
		Expression   sql.NullString
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

func loadMySQLDDL(ctx context.Context, db *sql.DB, tableName string) (string, error) {
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

func openMySQLDatabase(record store.ConnectionRecord, databaseOverride string) (*sql.DB, error) {
	cfg, err := mysqlConfigFromRecord(record)
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(databaseOverride) != "" {
		cfg.DBName = strings.TrimSpace(databaseOverride)
	}

	ensureMySQLTimeouts(cfg)
	db, err := sql.Open("mysql", cfg.FormatDSN())
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
	state, err := s.store.Load()
	if err != nil {
		return err
	}

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

	state.History = append([]store.QueryHistoryRecord{history}, state.History...)
	if len(state.History) > 200 {
		state.History = state.History[:200]
	}

	return s.store.Save(state)
}

func (s *Service) getConnectionRecord(id string) (store.ConnectionRecord, error) {
	trimmed := strings.TrimSpace(id)
	if trimmed == "" {
		return store.ConnectionRecord{}, errors.New("connection id is required")
	}

	state, err := s.store.Load()
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
