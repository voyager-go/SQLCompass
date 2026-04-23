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

	return executeFill(stmt, ctx, fields, count, input.FieldMappings)
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

func (s *Service) previewSQLiteTable(record store.ConnectionRecord, input TablePreviewRequest) (QueryResult, error) {
	statement := fmt.Sprintf("SELECT * FROM %s.%s", quoteSQLiteIdentifier(input.Database), quoteSQLiteIdentifier(input.Table))
	result, err := s.runSQLiteQuery(record, QueryRequest{ConnectionID: input.ConnectionID, Database: input.Database, SQL: statement, Page: input.Page, PageSize: input.PageSize}, false)
	if err != nil {
		return QueryResult{}, err
	}
	result.Message = fmt.Sprintf("已预览表 %s 的前 %d 行数据", input.Table, len(result.Rows))
	return result, nil
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

func quoteSQLiteIdentifier(name string) string {
	return `"` + strings.ReplaceAll(strings.TrimSpace(name), `"`, `""`) + `"`
}

func sqliteStringLiteral(value string) string {
	return `'` + strings.ReplaceAll(strings.TrimSpace(value), `'`, `''`) + `'`
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

func loadSQLiteDDL(ctx context.Context, db *sql.DB, databaseName string, tableName string) (string, error) {
	query := fmt.Sprintf("SELECT sql FROM %s.sqlite_master WHERE type = 'table' AND name = ?", quoteSQLiteIdentifier(databaseName))
	var ddl string
	if err := db.QueryRowContext(ctx, query, tableName).Scan(&ddl); err != nil {
		return "", err
	}
	return ddl, nil
}

