package workspace

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"sqltool/internal/database"
	"sqltool/internal/store"

	"github.com/redis/go-redis/v9"
)

func (s *Service) getExplorerTreeByRecord(record store.ConnectionRecord, preferredDatabase string) (ExplorerTree, error) {
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.getMySQLExplorerTree(record, preferredDatabase)
	case string(database.PostgreSQL):
		return s.getPostgreSQLExplorerTree(record, preferredDatabase)
	case string(database.SQLite):
		return s.getSQLiteExplorerTree(record, preferredDatabase)
	case string(database.ClickHouse):
		return s.getClickHouseExplorerTree(record, preferredDatabase)
	case string(database.Redis):
		return s.getRedisExplorerTree(record, preferredDatabase)
	default:
		return ExplorerTree{}, fmt.Errorf("%s 暂未接入真实结构浏览", record.Engine)
	}
}

func (s *Service) getTableDetailByRecord(record store.ConnectionRecord, databaseName string, tableName string) (TableDetail, error) {
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.getMySQLTableDetail(record, databaseName, tableName)
	case string(database.PostgreSQL):
		return s.getPostgreSQLTableDetail(record, databaseName, tableName)
	case string(database.SQLite):
		return s.getSQLiteTableDetail(record, databaseName, tableName)
	case string(database.ClickHouse):
		return s.getClickHouseTableDetail(record, databaseName, tableName)
	default:
		return TableDetail{}, fmt.Errorf("%s 暂未接入真实表结构读取", record.Engine)
	}
}

func (s *Service) executeQueryByRecord(record store.ConnectionRecord, input QueryRequest, persistHistory bool) (QueryResult, error) {
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.runMySQLQuery(record, input, persistHistory)
	case string(database.PostgreSQL):
		return s.runPostgreSQLQuery(record, input, persistHistory)
	case string(database.SQLite):
		return s.runSQLiteQuery(record, input, persistHistory)
	case string(database.ClickHouse):
		return s.runClickHouseQuery(record, input, persistHistory)
	case string(database.Redis):
		return s.runRedisQuery(record, input, persistHistory)
	default:
		return QueryResult{}, fmt.Errorf("%s 暂未接入真实查询执行", record.Engine)
	}
}

func (s *Service) previewTableDataByRecord(record store.ConnectionRecord, input TablePreviewRequest) (QueryResult, error) {
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
	case string(database.PostgreSQL):
		return s.previewPostgreSQLTable(record, input)
	case string(database.SQLite):
		return s.previewSQLiteTable(record, input)
	case string(database.ClickHouse):
		return s.previewClickHouseTable(record, input)
	case string(database.Redis):
		return s.previewRedisKey(record, input)
	default:
		return QueryResult{}, fmt.Errorf("%s 暂未接入真实表数据预览", record.Engine)
	}
}

func (s *Service) getTableRowCountsByRecord(record store.ConnectionRecord, databaseName string, tables []string) (TableRowCountResult, error) {
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.getMySQLTableRowCounts(record, databaseName, tables)
	case string(database.PostgreSQL):
		return s.getPostgreSQLTableRowCounts(record, databaseName, tables)
	case string(database.SQLite):
		return s.getSQLiteTableRowCounts(record, databaseName, tables)
	case string(database.ClickHouse):
		return s.getClickHouseTableRowCounts(record, databaseName, tables)
	default:
		return TableRowCountResult{}, fmt.Errorf("%s 暂未接入表行数查询", record.Engine)
	}
}

func (s *Service) renameTableByRecord(record store.ConnectionRecord, input RenameTableInput) (RenameTableResult, error) {
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.renameMySQLTable(record, input)
	case string(database.PostgreSQL):
		return s.renamePostgreSQLTable(record, input)
	case string(database.SQLite):
		return s.renameSQLiteTable(record, input)
	case string(database.ClickHouse):
		return s.renameClickHouseTable(record, input)
	default:
		return RenameTableResult{}, fmt.Errorf("%s 暂未接入真实重命名表", record.Engine)
	}
}

func (s *Service) getPostgreSQLExplorerTree(record store.ConnectionRecord, preferredDatabase string) (ExplorerTree, error) {
	db, err := openPostgreSQLDatabase(record, firstNonEmpty(record.Database, "postgres"))
	if err != nil {
		return ExplorerTree{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`)
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

	activeDatabase := chooseActiveDatabase(preferredDatabase, firstNonEmpty(record.Database, "postgres"), databases)
	nodes := make([]DatabaseNode, 0, len(databases))
	for _, name := range databases {
		schemas, tables, err := s.listPostgreSQLSchemasAndTables(record, name)
		if err != nil {
			return ExplorerTree{}, err
		}
		nodes = append(nodes, DatabaseNode{Name: name, IsSystem: false, TableCount: len(tables), Schemas: schemas, Tables: tables})
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

func (s *Service) listPostgreSQLSchemasAndTables(record store.ConnectionRecord, databaseName string) ([]SchemaNode, []TableNode, error) {
	db, err := openPostgreSQLDatabase(record, databaseName)
	if err != nil {
		return nil, nil, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, `
		SELECT n.nspname, c.relname, COALESCE(obj_description(c.oid, 'pg_class'), '')
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE c.relkind IN ('r', 'p')
		  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
		ORDER BY n.nspname, c.relname`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	schemaMap := map[string][]TableNode{}
	allTables := []TableNode{}
	for rows.Next() {
		var schemaName string
		var tableName string
		var comment string
		if err := rows.Scan(&schemaName, &tableName, &comment); err != nil {
			return nil, nil, err
		}
		node := TableNode{Name: schemaName + "." + tableName, Rows: -1, Engine: "postgresql", Comment: comment}
		schemaMap[schemaName] = append(schemaMap[schemaName], node)
		allTables = append(allTables, node)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	schemaNames := make([]string, 0, len(schemaMap))
	for name := range schemaMap {
		schemaNames = append(schemaNames, name)
	}
	sort.Strings(schemaNames)
	schemas := make([]SchemaNode, 0, len(schemaNames))
	for _, name := range schemaNames {
		schemas = append(schemas, SchemaNode{Name: name, TableCount: len(schemaMap[name]), Tables: schemaMap[name]})
	}
	return schemas, allTables, nil
}

func (s *Service) getSQLiteExplorerTree(record store.ConnectionRecord, preferredDatabase string) (ExplorerTree, error) {
	db, err := openSQLiteDatabase(record)
	if err != nil {
		return ExplorerTree{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, `PRAGMA database_list`)
	if err != nil {
		return ExplorerTree{}, err
	}
	defer rows.Close()

	var databases []string
	for rows.Next() {
		var seq int
		var name string
		var file string
		if err := rows.Scan(&seq, &name, &file); err != nil {
			return ExplorerTree{}, err
		}
		databases = append(databases, name)
	}
	if err := rows.Err(); err != nil {
		return ExplorerTree{}, err
	}

	activeDatabase := chooseActiveDatabase(preferredDatabase, firstNonEmpty(record.Database, "main"), databases)
	nodes := make([]DatabaseNode, 0, len(databases))
	for _, name := range databases {
		tables, err := s.listSQLiteTables(record, name)
		if err != nil {
			return ExplorerTree{}, err
		}
		nodes = append(nodes, DatabaseNode{Name: name, IsSystem: name == "temp", TableCount: len(tables), Tables: tables})
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

func (s *Service) listSQLiteTables(record store.ConnectionRecord, databaseName string) ([]TableNode, error) {
	db, err := openSQLiteDatabase(record)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := fmt.Sprintf(`SELECT name FROM %s.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%%' ORDER BY name`, quoteSQLiteIdentifier(databaseName))
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []TableNode{}
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			return nil, err
		}
		items = append(items, TableNode{Name: tableName, Rows: -1, Engine: "sqlite", Comment: ""})
	}
	return items, rows.Err()
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

func (s *Service) getRedisExplorerTree(record store.ConnectionRecord, preferredDatabase string) (ExplorerTree, error) {
	client, err := openRedisClient(record)
	if err != nil {
		return ExplorerTree{}, err
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	info, err := client.Info(ctx, "keyspace").Result()
	if err != nil {
		return ExplorerTree{}, err
	}

	counts := parseRedisKeyspaceInfo(info)
	if len(counts) == 0 {
		counts[0] = 0
	}

	indices := make([]int, 0, len(counts))
	for index := range counts {
		indices = append(indices, index)
	}
	sort.Ints(indices)

	nodes := make([]DatabaseNode, 0, len(indices))
	for _, index := range indices {
		dbName := fmt.Sprintf("db%d", index)
		browse, err := s.browseRedisKeys(record, RedisKeyBrowseRequest{ConnectionID: record.ID, Database: dbName, Cursor: 0, Count: 50})
		if err != nil {
			return ExplorerTree{}, err
		}
		nodes = append(nodes, DatabaseNode{Name: dbName, IsSystem: false, TableCount: counts[index], Tables: browse.Keys, NextCursor: browse.NextCursor, HasMore: browse.HasMore})
	}

	dbNames := make([]string, 0, len(nodes))
	for _, node := range nodes {
		dbNames = append(dbNames, node.Name)
	}
	activeDatabase := chooseActiveDatabase(preferredDatabase, firstNonEmpty(record.Database, "db0"), dbNames)

	return ExplorerTree{ConnectionID: record.ID, ConnectionName: record.Name, Engine: record.Engine, Databases: nodes, ActiveDatabase: activeDatabase, ActiveTable: "", CanDesignTables: false}, nil
}

func (s *Service) BrowseRedisKeys(input RedisKeyBrowseRequest) (RedisKeyBrowseResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return RedisKeyBrowseResult{}, err
	}
	if record.Engine != string(database.Redis) {
		return RedisKeyBrowseResult{}, fmt.Errorf("%s 不是 Redis 连接", record.Engine)
	}
	return s.browseRedisKeys(record, input)
}

func (s *Service) browseRedisKeys(record store.ConnectionRecord, input RedisKeyBrowseRequest) (RedisKeyBrowseResult, error) {
	client, err := openRedisClient(record)
	if err != nil {
		return RedisKeyBrowseResult{}, err
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dbName := normalizeRedisDatabaseName(input.Database, record.Database)
	dbIndex, err := strconv.Atoi(strings.TrimPrefix(dbName, "db"))
	if err != nil {
		return RedisKeyBrowseResult{}, err
	}
	if err := client.Do(ctx, "SELECT", dbIndex).Err(); err != nil {
		return RedisKeyBrowseResult{}, err
	}

	count := input.Count
	if count <= 0 {
		count = 50
	}
	keys, nextCursor, err := client.Scan(ctx, input.Cursor, "*", int64(count)).Result()
	if err != nil {
		return RedisKeyBrowseResult{}, err
	}

	items := make([]TableNode, 0, len(keys))
	for _, key := range keys {
		typeName, _ := client.Type(ctx, key).Result()
		ttl, _ := client.TTL(ctx, key).Result()
		comment := typeName
		if ttl > 0 {
			comment = fmt.Sprintf("%s · TTL %s", typeName, ttl.Round(time.Second))
		}
		items = append(items, TableNode{Name: key, Rows: -1, Engine: "redis", Comment: comment})
	}

	return RedisKeyBrowseResult{ConnectionID: record.ID, Database: dbName, Cursor: input.Cursor, NextCursor: nextCursor, HasMore: nextCursor != 0, Keys: items}, nil
}

func (s *Service) getPostgreSQLTableDetail(record store.ConnectionRecord, databaseName string, tableName string) (TableDetail, error) {
	schemaName, bareTable := splitSchemaAndTable(tableName, "public")
	db, err := openPostgreSQLDatabase(record, databaseName)
	if err != nil {
		return TableDetail{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	fields, err := loadPostgreSQLFields(ctx, db, schemaName, bareTable)
	if err != nil {
		return TableDetail{}, err
	}
	indexes, err := loadPostgreSQLIndexes(ctx, db, schemaName, bareTable)
	if err != nil {
		return TableDetail{}, err
	}
	ddl := buildPostgreSQLDDL(schemaName, bareTable, fields, indexes)

	return TableDetail{ConnectionID: record.ID, Database: databaseName, Table: tableName, DDL: ddl, Fields: fields, Indexes: indexes, IndexDiagnostics: diagnoseIndexes(fields, indexes)}, nil
}

func (s *Service) getSQLiteTableDetail(record store.ConnectionRecord, databaseName string, tableName string) (TableDetail, error) {
	db, err := openSQLiteDatabase(record)
	if err != nil {
		return TableDetail{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	fields, err := loadSQLiteFields(ctx, db, databaseName, tableName)
	if err != nil {
		return TableDetail{}, err
	}
	indexes, err := loadSQLiteIndexes(ctx, db, databaseName, tableName)
	if err != nil {
		return TableDetail{}, err
	}
	ddl, err := loadSQLiteDDL(ctx, db, databaseName, tableName)
	if err != nil {
		return TableDetail{}, err
	}

	return TableDetail{ConnectionID: record.ID, Database: databaseName, Table: tableName, DDL: ddl, Fields: fields, Indexes: indexes, IndexDiagnostics: diagnoseIndexes(fields, indexes)}, nil
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

func (s *Service) runPostgreSQLQuery(record store.ConnectionRecord, input QueryRequest, persistHistory bool) (QueryResult, error) {
	return s.runRelationalQuery(record, input, persistHistory, openPostgreSQLDatabase)
}

func (s *Service) runSQLiteQuery(record store.ConnectionRecord, input QueryRequest, persistHistory bool) (QueryResult, error) {
	return s.runRelationalQuery(record, input, persistHistory, func(record store.ConnectionRecord, _ string) (*sql.DB, error) {
		return openSQLiteDatabase(record)
	})
}

func (s *Service) runClickHouseQuery(record store.ConnectionRecord, input QueryRequest, persistHistory bool) (QueryResult, error) {
	return s.runRelationalQuery(record, input, persistHistory, openClickHouseDatabase)
}

func (s *Service) runRelationalQuery(record store.ConnectionRecord, input QueryRequest, persistHistory bool, opener func(store.ConnectionRecord, string) (*sql.DB, error)) (QueryResult, error) {
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
		databaseName = firstNonEmpty(record.Database, defaultDatabaseForEngine(record.Engine))
	}

	db, err := opener(record, databaseName)
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
		return QueryResult{Columns: columns, Rows: resultRows, AffectedRows: int64(len(resultRows)), DurationMS: duration.Milliseconds(), EffectiveSQL: effectiveSQL, StatementType: analysis.StatementType, Message: fmt.Sprintf("查询完成，返回 %d 行", len(resultRows)), Page: page, PageSize: pageSize, AutoLimited: autoLimited, HasNextPage: hasNextPage, Analysis: analysis}, nil
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

	return QueryResult{Columns: []string{}, Rows: []map[string]string{}, AffectedRows: affectedRows, DurationMS: duration.Milliseconds(), EffectiveSQL: statement, StatementType: analysis.StatementType, Message: fmt.Sprintf("执行成功，影响 %d 行", affectedRows), Page: 1, PageSize: pageSize, AutoLimited: false, HasNextPage: false, Analysis: analysis}, nil
}

func (s *Service) previewPostgreSQLTable(record store.ConnectionRecord, input TablePreviewRequest) (QueryResult, error) {
	schemaName, bareTable := splitSchemaAndTable(input.Table, "public")
	statement := fmt.Sprintf("SELECT * FROM %s.%s", quotePostgreSQLIdentifier(schemaName), quotePostgreSQLIdentifier(bareTable))
	result, err := s.runPostgreSQLQuery(record, QueryRequest{ConnectionID: input.ConnectionID, Database: input.Database, SQL: statement, Page: input.Page, PageSize: input.PageSize}, false)
	if err != nil {
		return QueryResult{}, err
	}
	result.Message = fmt.Sprintf("已预览表 %s 的前 %d 行数据", input.Table, len(result.Rows))
	return result, nil
}

func (s *Service) previewSQLiteTable(record store.ConnectionRecord, input TablePreviewRequest) (QueryResult, error) {
	statement := fmt.Sprintf("SELECT * FROM %s.%s", quoteSQLiteIdentifier(input.Database), quoteSQLiteIdentifier(input.Table))
	result, err := s.runSQLiteQuery(record, QueryRequest{ConnectionID: input.ConnectionID, Database: input.Database, SQL: statement, Page: input.Page, PageSize: input.PageSize}, false)
	if err != nil {
		return QueryResult{}, err
	}
	result.Message = fmt.Sprintf("已预览表 %s 的前 %d 行数据", input.Table, len(result.Rows))
	return result, nil
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

func (s *Service) previewRedisKey(record store.ConnectionRecord, input TablePreviewRequest) (QueryResult, error) {
	client, err := openRedisClient(record)
	if err != nil {
		return QueryResult{}, err
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dbName := normalizeRedisDatabaseName(input.Database, record.Database)
	dbIndex, err := strconv.Atoi(strings.TrimPrefix(dbName, "db"))
	if err != nil {
		return QueryResult{}, err
	}
	if err := client.Do(ctx, "SELECT", dbIndex).Err(); err != nil {
		return QueryResult{}, err
	}

	typeName, err := client.Type(ctx, input.Table).Result()
	if err != nil {
		return QueryResult{}, err
	}
	ttl, _ := client.TTL(ctx, input.Table).Result()
	encoding, _ := client.Do(ctx, "OBJECT", "ENCODING", input.Table).Text()

	preview := ""
	switch typeName {
	case "string":
		preview, _ = client.Get(ctx, input.Table).Result()
	case "hash":
		pairs, _ := client.HGetAll(ctx, input.Table).Result()
		preview = fmt.Sprint(pairs)
	case "list":
		values, _ := client.LRange(ctx, input.Table, 0, 19).Result()
		preview = fmt.Sprint(values)
	case "set":
		values, _ := client.SMembers(ctx, input.Table).Result()
		if len(values) > 20 {
			values = values[:20]
		}
		preview = fmt.Sprint(values)
	case "zset":
		values, _ := client.ZRangeWithScores(ctx, input.Table, 0, 19).Result()
		preview = fmt.Sprint(values)
	case "stream":
		values, _ := client.XRangeN(ctx, input.Table, "-", "+", 10).Result()
		preview = fmt.Sprint(values)
	default:
		preview = "暂不支持该类型的值预览"
	}

	rows := []map[string]string{{
		"key":      input.Table,
		"type":     typeName,
		"ttl":      ttl.String(),
		"encoding": encoding,
		"preview":  preview,
	}}
	return QueryResult{Columns: []string{"key", "type", "ttl", "encoding", "preview"}, Rows: rows, AffectedRows: 1, DurationMS: 0, EffectiveSQL: input.Table, StatementType: "REDIS_KEY", Message: fmt.Sprintf("已读取 Key %s 的详情", input.Table), Page: 1, PageSize: 1, AutoLimited: false, HasNextPage: false, Analysis: analyzeSQL(input.Table)}, nil
}

func (s *Service) getPostgreSQLTableRowCounts(record store.ConnectionRecord, databaseName string, tables []string) (TableRowCountResult, error) {
	counts := map[string]int64{}
	db, err := openPostgreSQLDatabase(record, databaseName)
	if err != nil {
		return TableRowCountResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for _, name := range tables {
		schemaName, bareTable := splitSchemaAndTable(name, "public")
		var count int64
		if err := db.QueryRowContext(ctx, `
			SELECT COALESCE(c.reltuples::bigint, 0)
			FROM pg_class c
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = $1 AND c.relname = $2`, schemaName, bareTable).Scan(&count); err == nil {
			counts[name] = count
		}
	}
	return TableRowCountResult{ConnectionID: record.ID, Database: databaseName, Counts: counts}, nil
}

func (s *Service) getSQLiteTableRowCounts(record store.ConnectionRecord, databaseName string, tables []string) (TableRowCountResult, error) {
	counts := map[string]int64{}
	db, err := openSQLiteDatabase(record)
	if err != nil {
		return TableRowCountResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for _, name := range tables {
		query := fmt.Sprintf("SELECT COUNT(*) FROM %s.%s", quoteSQLiteIdentifier(databaseName), quoteSQLiteIdentifier(name))
		var count int64
		if err := db.QueryRowContext(ctx, query).Scan(&count); err == nil {
			counts[name] = count
		}
	}
	return TableRowCountResult{ConnectionID: record.ID, Database: databaseName, Counts: counts}, nil
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

func (s *Service) renamePostgreSQLTable(record store.ConnectionRecord, input RenameTableInput) (RenameTableResult, error) {
	schemaName, oldTable := splitSchemaAndTable(input.OldName, "public")
	db, err := openPostgreSQLDatabase(record, input.Database)
	if err != nil {
		return RenameTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	statement := fmt.Sprintf("ALTER TABLE %s.%s RENAME TO %s", quotePostgreSQLIdentifier(schemaName), quotePostgreSQLIdentifier(oldTable), quotePostgreSQLIdentifier(input.NewName))
	if _, err := db.ExecContext(ctx, statement); err != nil {
		return RenameTableResult{}, err
	}
	return RenameTableResult{Database: input.Database, OldName: input.OldName, NewName: input.NewName, Message: "表已重命名"}, nil
}

func (s *Service) renameSQLiteTable(record store.ConnectionRecord, input RenameTableInput) (RenameTableResult, error) {
	db, err := openSQLiteDatabase(record)
	if err != nil {
		return RenameTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	statement := fmt.Sprintf("ALTER TABLE %s.%s RENAME TO %s", quoteSQLiteIdentifier(input.Database), quoteSQLiteIdentifier(input.OldName), quoteSQLiteIdentifier(input.NewName))
	if _, err := db.ExecContext(ctx, statement); err != nil {
		return RenameTableResult{}, err
	}
	return RenameTableResult{Database: input.Database, OldName: input.OldName, NewName: input.NewName, Message: "表已重命名"}, nil
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

func loadPostgreSQLFields(ctx context.Context, db *sql.DB, schemaName string, tableName string) ([]TableField, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT a.attname,
		       pg_catalog.format_type(a.atttypid, a.atttypmod),
		       NOT a.attnotnull,
		       COALESCE(pg_get_expr(ad.adbin, ad.adrelid), ''),
		       COALESCE(col_description(c.oid, a.attnum), ''),
		       EXISTS (
		         SELECT 1 FROM pg_index i
		         WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)
		       ),
		       COALESCE(pg_get_expr(ad.adbin, ad.adrelid), '') LIKE 'nextval(%'
		FROM pg_attribute a
		JOIN pg_class c ON c.oid = a.attrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
		WHERE n.nspname = $1
		  AND c.relname = $2
		  AND a.attnum > 0
		  AND NOT a.attisdropped
		ORDER BY a.attnum`, schemaName, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []TableField{}
	for rows.Next() {
		var field TableField
		if err := rows.Scan(&field.Name, &field.Type, &field.Nullable, &field.DefaultValue, &field.Comment, &field.Primary, &field.AutoIncrement); err != nil {
			return nil, err
		}
		items = append(items, field)
	}
	return items, rows.Err()
}

func loadPostgreSQLIndexes(ctx context.Context, db *sql.DB, schemaName string, tableName string) ([]TableIndex, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT idx.relname,
		       string_agg(att.attname, ',' ORDER BY k.ord),
		       i.indisunique,
		       am.amname,
		       COALESCE(idx.reltuples::bigint, 0)
		FROM pg_index i
		JOIN pg_class tbl ON tbl.oid = i.indrelid
		JOIN pg_namespace n ON n.oid = tbl.relnamespace
		JOIN pg_class idx ON idx.oid = i.indexrelid
		JOIN pg_am am ON am.oid = idx.relam
		JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
		JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = k.attnum
		WHERE n.nspname = $1 AND tbl.relname = $2
		GROUP BY idx.relname, i.indisunique, am.amname, idx.reltuples
		ORDER BY idx.relname`, schemaName, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []TableIndex{}
	for rows.Next() {
		var item TableIndex
		var columnsCSV string
		if err := rows.Scan(&item.Name, &columnsCSV, &item.Unique, &item.IndexType, &item.Cardinality); err != nil {
			return nil, err
		}
		if strings.TrimSpace(columnsCSV) != "" {
			item.Columns = strings.Split(columnsCSV, ",")
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func buildPostgreSQLDDL(schemaName string, tableName string, fields []TableField, indexes []TableIndex) string {
	lines := make([]string, 0, len(fields)+1)
	primaryKeys := []string{}
	for _, field := range fields {
		line := fmt.Sprintf("    %s %s", quotePostgreSQLIdentifier(field.Name), field.Type)
		if !field.Nullable {
			line += " NOT NULL"
		}
		if strings.TrimSpace(field.DefaultValue) != "" {
			line += " DEFAULT " + field.DefaultValue
		}
		lines = append(lines, line)
		if field.Primary {
			primaryKeys = append(primaryKeys, quotePostgreSQLIdentifier(field.Name))
		}
	}
	if len(primaryKeys) > 0 {
		lines = append(lines, fmt.Sprintf("    PRIMARY KEY (%s)", strings.Join(primaryKeys, ", ")))
	}
	return fmt.Sprintf("CREATE TABLE %s.%s (\n%s\n);", quotePostgreSQLIdentifier(schemaName), quotePostgreSQLIdentifier(tableName), strings.Join(lines, ",\n"))
}

func loadSQLiteFields(ctx context.Context, db *sql.DB, databaseName string, tableName string) ([]TableField, error) {
	query := fmt.Sprintf("PRAGMA %s.table_xinfo(%s)", quoteSQLiteIdentifier(databaseName), sqliteStringLiteral(tableName))
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []TableField{}
	for rows.Next() {
		var cid int
		var field TableField
		var notNull int
		var pk int
		var hidden int
		if err := rows.Scan(&cid, &field.Name, &field.Type, &notNull, &field.DefaultValue, &pk, &hidden); err != nil {
			return nil, err
		}
		field.Nullable = notNull == 0
		field.Primary = pk > 0
		field.AutoIncrement = strings.Contains(strings.ToUpper(field.DefaultValue), "AUTOINCREMENT")
		items = append(items, field)
	}
	return items, rows.Err()
}

func loadSQLiteIndexes(ctx context.Context, db *sql.DB, databaseName string, tableName string) ([]TableIndex, error) {
	listQuery := fmt.Sprintf("PRAGMA %s.index_list(%s)", quoteSQLiteIdentifier(databaseName), sqliteStringLiteral(tableName))
	rows, err := db.QueryContext(ctx, listQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []TableIndex{}
	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			return nil, err
		}
		infoQuery := fmt.Sprintf("PRAGMA %s.index_info(%s)", quoteSQLiteIdentifier(databaseName), sqliteStringLiteral(name))
		indexRows, err := db.QueryContext(ctx, infoQuery)
		if err != nil {
			return nil, err
		}
		columns := []string{}
		for indexRows.Next() {
			var seqno int
			var cid int
			var columnName string
			if err := indexRows.Scan(&seqno, &cid, &columnName); err != nil {
				indexRows.Close()
				return nil, err
			}
			columns = append(columns, columnName)
		}
		indexRows.Close()
		items = append(items, TableIndex{Name: name, Columns: columns, Unique: unique == 1, IndexType: origin, Cardinality: 0})
	}
	return items, rows.Err()
}

func loadSQLiteDDL(ctx context.Context, db *sql.DB, databaseName string, tableName string) (string, error) {
	query := fmt.Sprintf("SELECT sql FROM %s.sqlite_master WHERE type = 'table' AND name = ?", quoteSQLiteIdentifier(databaseName))
	var ddl string
	if err := db.QueryRowContext(ctx, query, tableName).Scan(&ddl); err != nil {
		return "", err
	}
	return ddl, nil
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

func loadClickHouseDDL(ctx context.Context, db *sql.DB, databaseName string, tableName string) (string, error) {
	query := fmt.Sprintf("SHOW CREATE TABLE %s.%s", quoteClickHouseIdentifier(databaseName), quoteClickHouseIdentifier(tableName))
	var ddl string
	if err := db.QueryRowContext(ctx, query).Scan(&ddl); err != nil {
		return "", err
	}
	return ddl, nil
}

func (s *Service) runRedisQuery(record store.ConnectionRecord, input QueryRequest, persistHistory bool) (QueryResult, error) {
	statement := strings.TrimSpace(input.SQL)
	if statement == "" {
		return QueryResult{}, errors.New("命令不能为空")
	}
	args := splitRedisCommand(statement)
	if len(args) == 0 {
		return QueryResult{}, errors.New("命令不能为空")
	}

	analysis := analyzeSQL(statement)
	client, err := openRedisClient(record)
	if err != nil {
		return QueryResult{}, err
	}
	defer client.Close()

	databaseName := normalizeRedisDatabaseName(input.Database, record.Database)
	if databaseName != "db0" {
		if index, err := strconv.Atoi(strings.TrimPrefix(databaseName, "db")); err == nil {
			client = client.WithTimeout(30 * time.Second)
			if err := client.Do(context.Background(), "SELECT", index).Err(); err != nil {
				return QueryResult{}, err
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	startedAt := time.Now()
	resultValue, err := client.Do(ctx, stringArgsToAny(args)...).Result()
	if err != nil {
		if persistHistory {
			_ = s.appendHistory(record, databaseName, statement, statement, analysis, false, 0, time.Since(startedAt))
		}
		return QueryResult{}, err
	}

	result := redisValueToQueryResult(resultValue)
	result.EffectiveSQL = statement
	result.StatementType = "REDIS"
	result.Analysis = analysis
	result.DurationMS = time.Since(startedAt).Milliseconds()
	result.Page = 1
	result.PageSize = input.PageSize
	if result.Message == "" {
		result.Message = fmt.Sprintf("Redis 命令执行完成，返回 %d 行", len(result.Rows))
	}
	if persistHistory {
		_ = s.appendHistory(record, databaseName, statement, statement, analysis, true, int64(len(result.Rows)), time.Duration(result.DurationMS)*time.Millisecond)
	}
	return result, nil
}

func redisValueToQueryResult(value any) QueryResult {
	switch typed := value.(type) {
	case nil:
		return QueryResult{Columns: []string{"result"}, Rows: []map[string]string{}, Message: "命令执行完成，没有返回内容"}
	case []any:
		rows := make([]map[string]string, 0, len(typed))
		for index, item := range typed {
			rows = append(rows, map[string]string{"index": strconv.Itoa(index), "value": fmt.Sprint(item)})
		}
		return QueryResult{Columns: []string{"index", "value"}, Rows: rows}
	case map[string]any:
		rows := make([]map[string]string, 0, len(typed))
		for key, item := range typed {
			rows = append(rows, map[string]string{"key": key, "value": fmt.Sprint(item)})
		}
		return QueryResult{Columns: []string{"key", "value"}, Rows: rows}
	default:
		return QueryResult{Columns: []string{"result"}, Rows: []map[string]string{{"result": fmt.Sprint(typed)}}}
	}
}

func splitSchemaAndTable(value string, defaultSchema string) (string, string) {
	parts := strings.SplitN(strings.TrimSpace(value), ".", 2)
	if len(parts) == 2 {
		return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
	}
	return defaultSchema, strings.TrimSpace(value)
}

func quotePostgreSQLIdentifier(name string) string {
	return `"` + strings.ReplaceAll(strings.TrimSpace(name), `"`, `""`) + `"`
}

func quoteSQLiteIdentifier(name string) string {
	return `"` + strings.ReplaceAll(strings.TrimSpace(name), `"`, `""`) + `"`
}

func quoteClickHouseIdentifier(name string) string {
	return "`" + strings.ReplaceAll(strings.TrimSpace(name), "`", "``") + "`"
}

func sqliteStringLiteral(value string) string {
	return `'` + strings.ReplaceAll(strings.TrimSpace(value), `'`, `''`) + `'`
}

func defaultDatabaseForEngine(engine string) string {
	switch engine {
	case string(database.PostgreSQL):
		return "postgres"
	case string(database.ClickHouse):
		return "default"
	case string(database.SQLite):
		return "main"
	case string(database.Redis):
		return "db0"
	default:
		return ""
	}
}

func openPostgreSQLDatabase(record store.ConnectionRecord, databaseOverride string) (*sql.DB, error) {
	input := connectionInputFromRecord(record)
	if strings.TrimSpace(databaseOverride) != "" {
		input.Database = strings.TrimSpace(databaseOverride)
	}
	dsn, _, err := buildPostgreSQLDSN(input)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	db.SetConnMaxLifetime(2 * time.Minute)
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(2)
	return db, nil
}

func openSQLiteDatabase(record store.ConnectionRecord) (*sql.DB, error) {
	dsn, _ := buildSQLiteDSN(record.FilePath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetConnMaxLifetime(2 * time.Minute)
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	return db, nil
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

func openRedisClient(record store.ConnectionRecord) (*redis.Client, error) {
	options, _, err := buildRedisOptions(connectionInputFromRecord(record))
	if err != nil {
		return nil, err
	}
	return redis.NewClient(options), nil
}

func connectionInputFromRecord(record store.ConnectionRecord) ConnectionInput {
	return ConnectionInput{Engine: record.Engine, Host: record.Host, Port: record.Port, Username: record.Username, Password: record.Password, Database: record.Database, FilePath: record.FilePath, URL: record.URL}
}

func parseRedisKeyspaceInfo(info string) map[int]int {
	counts := map[int]int{}
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "db") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		index, err := strconv.Atoi(strings.TrimPrefix(parts[0], "db"))
		if err != nil {
			continue
		}
		for _, item := range strings.Split(parts[1], ",") {
			if strings.HasPrefix(item, "keys=") {
				count, err := strconv.Atoi(strings.TrimPrefix(item, "keys="))
				if err == nil {
					counts[index] = count
				}
			}
		}
	}
	return counts
}

func normalizeRedisDatabaseName(requested string, fallback string) string {
	trimmed := strings.TrimSpace(requested)
	if trimmed == "" {
		trimmed = strings.TrimSpace(fallback)
	}
	if trimmed == "" {
		return "db0"
	}
	if strings.HasPrefix(trimmed, "db") {
		return trimmed
	}
	if _, err := strconv.Atoi(trimmed); err == nil {
		return "db" + trimmed
	}
	return trimmed
}

func stringArgsToAny(items []string) []any {
	values := make([]any, len(items))
	for index, item := range items {
		values[index] = item
	}
	return values
}

func splitRedisCommand(statement string) []string {
	parts := strings.Fields(strings.TrimSpace(statement))
	if len(parts) == 0 {
		return nil
	}
	return parts
}

func (s *Service) createPostgreSQLTable(record store.ConnectionRecord, input CreateTableRequest) (CreateTableResult, error) {
	database := strings.TrimSpace(input.Database)
	tableName := strings.TrimSpace(input.TableName)
	if database == "" || tableName == "" {
		return CreateTableResult{}, errors.New("数据库名和表名不能为空")
	}
	if len(input.Fields) == 0 {
		return CreateTableResult{}, errors.New("至少需要定义一个字段")
	}

	schemaName := firstNonEmpty(strings.TrimSpace(input.Schema), "public")
	_, bareTable := splitSchemaAndTable(tableName, schemaName)
	tableIdentifier := fmt.Sprintf("%s.%s", quotePostgreSQLIdentifier(schemaName), quotePostgreSQLIdentifier(bareTable))
	fieldDefs, postStatements := buildPostgreSQLCreateTableParts(input, tableIdentifier)
	statement := fmt.Sprintf("CREATE TABLE %s (\n  %s\n);", tableIdentifier, strings.Join(fieldDefs, ",\n  "))

	db, err := openPostgreSQLDatabase(record, database)
	if err != nil {
		return CreateTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if _, err := db.ExecContext(ctx, statement); err != nil {
		return CreateTableResult{Success: false, Message: err.Error()}, nil
	}
	for _, sqlStatement := range postStatements {
		if _, err := db.ExecContext(ctx, sqlStatement); err != nil {
			return CreateTableResult{Success: false, Message: err.Error()}, nil
		}
	}
	return CreateTableResult{Success: true, Message: fmt.Sprintf("表 %s.%s 创建成功", schemaName, bareTable)}, nil
}

func (s *Service) createSQLiteTable(record store.ConnectionRecord, input CreateTableRequest) (CreateTableResult, error) {
	database := firstNonEmpty(strings.TrimSpace(input.Database), "main")
	tableName := strings.TrimSpace(input.TableName)
	if tableName == "" {
		return CreateTableResult{}, errors.New("表名不能为空")
	}
	if len(input.Fields) == 0 {
		return CreateTableResult{}, errors.New("至少需要定义一个字段")
	}

	fieldDefs, postStatements := buildSQLiteCreateTableParts(input, fmt.Sprintf("%s.%s", quoteSQLiteIdentifier(database), quoteSQLiteIdentifier(tableName)))
	statement := fmt.Sprintf("CREATE TABLE %s.%s (\n  %s\n);", quoteSQLiteIdentifier(database), quoteSQLiteIdentifier(tableName), strings.Join(fieldDefs, ",\n  "))
	db, err := openSQLiteDatabase(record)
	if err != nil {
		return CreateTableResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if _, err := db.ExecContext(ctx, statement); err != nil {
		return CreateTableResult{Success: false, Message: err.Error()}, nil
	}
	for _, sqlStatement := range postStatements {
		if _, err := db.ExecContext(ctx, sqlStatement); err != nil {
			return CreateTableResult{Success: false, Message: err.Error()}, nil
		}
	}
	return CreateTableResult{Success: true, Message: fmt.Sprintf("表 %s.%s 创建成功", database, tableName)}, nil
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

func buildPostgreSQLCreateTableParts(input CreateTableRequest, tableIdentifier string) ([]string, []string) {
	fieldDefs := []string{}
	postStatements := []string{}
	primaryCols := []string{}
	for _, f := range input.Fields {
		name := strings.TrimSpace(f.Name)
		fieldType := strings.TrimSpace(f.Type)
		if name == "" || fieldType == "" {
			continue
		}
		def := fmt.Sprintf("%s %s", quotePostgreSQLIdentifier(name), fieldType)
		if !f.Nullable {
			def += " NOT NULL"
		}
		if strings.TrimSpace(f.DefaultValue) != "" {
			def += fmt.Sprintf(" DEFAULT %s", strings.TrimSpace(f.DefaultValue))
		}
		fieldDefs = append(fieldDefs, def)
		if f.Primary {
			primaryCols = append(primaryCols, quotePostgreSQLIdentifier(name))
		}
		if strings.TrimSpace(f.Comment) != "" {
			postStatements = append(postStatements, fmt.Sprintf("COMMENT ON COLUMN %s.%s IS '%s';", tableIdentifier, quotePostgreSQLIdentifier(name), strings.ReplaceAll(strings.TrimSpace(f.Comment), "'", "''")))
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
		columns := make([]string, 0, len(idx.Columns))
		for _, column := range idx.Columns {
			columns = append(columns, quotePostgreSQLIdentifier(strings.TrimSpace(column)))
		}
		postStatements = append(postStatements, fmt.Sprintf("CREATE %sINDEX %s ON %s (%s);", unique, quotePostgreSQLIdentifier(name), tableIdentifier, strings.Join(columns, ", ")))
	}
	return fieldDefs, postStatements
}

func buildSQLiteCreateTableParts(input CreateTableRequest, tableIdentifier string) ([]string, []string) {
	fieldDefs := []string{}
	postStatements := []string{}
	primaryCols := []string{}
	for _, f := range input.Fields {
		name := strings.TrimSpace(f.Name)
		fieldType := strings.TrimSpace(f.Type)
		if name == "" || fieldType == "" {
			continue
		}
		def := fmt.Sprintf("%s %s", quoteSQLiteIdentifier(name), fieldType)
		if !f.Nullable {
			def += " NOT NULL"
		}
		if strings.TrimSpace(f.DefaultValue) != "" {
			def += fmt.Sprintf(" DEFAULT %s", strings.TrimSpace(f.DefaultValue))
		}
		fieldDefs = append(fieldDefs, def)
		if f.Primary {
			primaryCols = append(primaryCols, quoteSQLiteIdentifier(name))
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
		columns := make([]string, 0, len(idx.Columns))
		for _, column := range idx.Columns {
			columns = append(columns, quoteSQLiteIdentifier(strings.TrimSpace(column)))
		}
		postStatements = append(postStatements, fmt.Sprintf("CREATE %sINDEX %s ON %s (%s);", unique, quoteSQLiteIdentifier(name), tableIdentifier, strings.Join(columns, ", ")))
	}
	return fieldDefs, postStatements
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
