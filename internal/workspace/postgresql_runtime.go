package workspace

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"sqltool/internal/store"
)

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

	return executeFill(stmt, ctx, fields, count, input.FieldMappings)
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

func (s *Service) getPostgreSQLTableRowCounts(record store.ConnectionRecord, databaseName string, tables []string) (TableRowCountResult, error) {
	counts := map[string]int64{}
	db, err := openPostgreSQLDatabase(record, databaseName)
	if err != nil {
		return TableRowCountResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if len(tables) <= 30 {
		for _, name := range tables {
			schemaName, bareTable := splitSchemaAndTable(name, "public")
			var count int64
			query := fmt.Sprintf("SELECT COUNT(*) FROM %s.%s", quotePostgreSQLIdentifier(schemaName), quotePostgreSQLIdentifier(bareTable))
			if err := db.QueryRowContext(ctx, query).Scan(&count); err == nil {
				counts[name] = count
			}
		}
	} else {
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
	}
	return TableRowCountResult{ConnectionID: record.ID, Database: databaseName, Counts: counts}, nil
}

func (s *Service) getPostgreSQLTablePartitions(record store.ConnectionRecord, input TablePartitionRequest) (TablePartitionResult, error) {
	schemaName, bareTable := splitSchemaAndTable(input.Table, "public")
	db, err := openPostgreSQLDatabase(record, input.Database)
	if err != nil {
		return TablePartitionResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var partitionKey string
	_ = db.QueryRowContext(ctx, `
		SELECT pg_get_partkeydef(pt.partrelid)
		FROM pg_partitioned_table pt
		JOIN pg_class c ON c.oid = pt.partrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relname = $2
	`, schemaName, bareTable).Scan(&partitionKey)

	rows, err := db.QueryContext(ctx, `
		SELECT
			c.relname as partition_name,
			pg_get_expr(c.relpartbound, c.oid) as partition_bound,
			pg_total_relation_size(c.oid) as total_size
		FROM pg_inherits i
		JOIN pg_class c ON c.oid = i.inhrelid
		WHERE i.inhparent = (
			SELECT oid FROM pg_class WHERE relname = $1 AND relnamespace = (
				SELECT oid FROM pg_namespace WHERE nspname = $2
			)
		)
		ORDER BY c.relname
	`, bareTable, schemaName)
	if err != nil {
		return TablePartitionResult{}, err
	}
	defer rows.Close()

	partitions := []PartitionInfo{}
	for rows.Next() {
		var p PartitionInfo
		var totalSize int64
		if err := rows.Scan(&p.Name, &p.Description, &totalSize); err != nil {
			return TablePartitionResult{}, err
		}
		p.DataSize = totalSize
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

func quotePostgreSQLIdentifier(name string) string {
	return `"` + strings.ReplaceAll(strings.TrimSpace(name), `"`, `""`) + `"`
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
		indexType := ""
		if strings.TrimSpace(idx.IndexType) != "" {
			indexType = fmt.Sprintf(" USING %s", strings.TrimSpace(idx.IndexType))
		}
		columns := make([]string, 0, len(idx.Columns))
		for _, column := range idx.Columns {
			columns = append(columns, quotePostgreSQLIdentifier(strings.TrimSpace(column)))
		}
		postStatements = append(postStatements, fmt.Sprintf("CREATE %sINDEX %s ON %s%s (%s);", unique, quotePostgreSQLIdentifier(name), tableIdentifier, indexType, strings.Join(columns, ", ")))
	}
	return fieldDefs, postStatements
}

