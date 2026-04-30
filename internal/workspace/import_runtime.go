package workspace

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	dbsql "database/sql"

	"sqltool/internal/database"
	"sqltool/internal/store"
)

func (s *Service) ImportFile(input ImportFileRequest) (ImportResult, error) {
	if strings.TrimSpace(input.FilePath) == "" {
		return ImportResult{}, errors.New("文件路径不能为空")
	}
	if strings.TrimSpace(input.Table) == "" {
		return ImportResult{}, errors.New("目标表名不能为空")
	}

	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return ImportResult{}, err
	}

	switch strings.ToLower(input.Format) {
	case "csv":
		return s.importCSV(record, input)
	case "sql":
		return s.importSQL(record, input)
	default:
		return ImportResult{}, fmt.Errorf("不支持的导入格式: %s", input.Format)
	}
}

func (s *Service) PreviewImport(input ImportPreviewRequest) (ImportPreviewResult, error) {
	if strings.TrimSpace(input.FilePath) == "" {
		return ImportPreviewResult{}, errors.New("文件路径不能为空")
	}

	switch strings.ToLower(input.Format) {
	case "csv":
		return s.previewCSV(input)
	case "sql":
		return s.previewSQL(input)
	default:
		return ImportPreviewResult{}, fmt.Errorf("不支持的预览格式: %s", input.Format)
	}
}

func (s *Service) previewCSV(input ImportPreviewRequest) (ImportPreviewResult, error) {
	file, err := os.Open(input.FilePath)
	if err != nil {
		return ImportPreviewResult{}, fmt.Errorf("无法打开文件: %w", err)
	}
	defer file.Close()

	delimiter := ','
	if strings.TrimSpace(input.Delimiter) != "" {
		runes := []rune(strings.TrimSpace(input.Delimiter))
		if len(runes) > 0 {
			delimiter = runes[0]
		}
	}

	reader := csv.NewReader(file)
	reader.Comma = delimiter
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	limit := input.Limit
	if limit <= 0 {
		limit = 20
	}

	var columns []string
	var rows []map[string]string
	rowIndex := 0

	for {
		csvRecord, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}

		if rowIndex == 0 && input.HasHeader {
			columns = make([]string, len(csvRecord))
			copy(columns, csvRecord)
			rowIndex++
			continue
		}

		if len(columns) == 0 {
			columns = make([]string, len(csvRecord))
			for i := range columns {
				columns[i] = fmt.Sprintf("column_%d", i+1)
			}
		}

		if len(rows) >= limit {
			rowIndex++
			continue
		}

		row := make(map[string]string)
		for i, value := range csvRecord {
			if i < len(columns) {
				row[columns[i]] = value
			}
		}
		rows = append(rows, row)
		rowIndex++
	}

	total := rowIndex
	if input.HasHeader && total > 0 {
		total--
	}

	return ImportPreviewResult{
		Columns: columns,
		Rows:    queryRows(rows),
		Total:   total,
		Format:  "csv",
		Message: fmt.Sprintf("预览前 %d 行，共检测到 %d 行数据", len(rows), total),
	}, nil
}

func (s *Service) previewSQL(input ImportPreviewRequest) (ImportPreviewResult, error) {
	content, err := os.ReadFile(input.FilePath)
	if err != nil {
		return ImportPreviewResult{}, fmt.Errorf("无法读取文件: %w", err)
	}

	sqlText := string(content)
	statements := splitSQLStatements(sqlText)
	limit := input.Limit
	if limit <= 0 {
		limit = 20
	}

	previewStmts := statements
	if len(previewStmts) > limit {
		previewStmts = previewStmts[:limit]
	}

	rows := make([]map[string]string, 0, len(previewStmts))
	for i, stmt := range previewStmts {
		rows = append(rows, map[string]string{
			"index": fmt.Sprintf("%d", i+1),
			"sql":   stmt,
		})
	}

	return ImportPreviewResult{
		Columns: []string{"index", "sql"},
		Rows:    queryRows(rows),
		Total:   len(statements),
		Format:  "sql",
		Message: fmt.Sprintf("预览前 %d 条语句，共检测到 %d 条", len(rows), len(statements)),
	}, nil
}

// importCSV imports CSV data using parameterized queries to prevent SQL injection.
func (s *Service) importCSV(record store.ConnectionRecord, input ImportFileRequest) (ImportResult, error) {
	// Get table structure to validate columns and find primary keys.
	tableDetail, err := s.getTableDetailByRecord(record, input.Database, input.Table)
	if err != nil {
		return ImportResult{}, fmt.Errorf("无法获取表结构: %w", err)
	}

	fieldMap := make(map[string]TableField)
	var pkCols []string
	for _, f := range tableDetail.Fields {
		fieldMap[strings.ToLower(f.Name)] = f
		if f.Primary {
			pkCols = append(pkCols, quoteIdentifierForEngine(record.Engine, f.Name))
		}
	}

	file, err := os.Open(input.FilePath)
	if err != nil {
		return ImportResult{}, fmt.Errorf("无法打开文件: %w", err)
	}
	defer file.Close()

	delimiter := ','
	if strings.TrimSpace(input.Delimiter) != "" {
		runes := []rune(strings.TrimSpace(input.Delimiter))
		if len(runes) > 0 {
			delimiter = runes[0]
		}
	}

	reader := csv.NewReader(file)
	reader.Comma = delimiter
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	// Read header or first data row.
	var columns []string
	var pendingRow []string
	if input.HasHeader {
		header, err := reader.Read()
		if err != nil {
			return ImportResult{}, fmt.Errorf("无法读取CSV头: %w", err)
		}
		columns = header
	} else {
		firstRow, err := reader.Read()
		if err != nil {
			return ImportResult{}, fmt.Errorf("无法读取CSV数据: %w", err)
		}
		columns = make([]string, len(firstRow))
		for i := range columns {
			columns[i] = fmt.Sprintf("column_%d", i+1)
		}
		pendingRow = firstRow
	}

	// Build the list of columns that exist in the target table.
	var colNames []string
	var colIndices []int
	for i, colName := range columns {
		if _, exists := fieldMap[strings.ToLower(colName)]; exists {
			colNames = append(colNames, quoteIdentifierForEngine(record.Engine, colName))
			colIndices = append(colIndices, i)
		}
	}

	if len(colNames) == 0 {
		return ImportResult{Success: false, Message: "CSV列与表字段不匹配"}, nil
	}

	// Open a database connection.
	db, err := s.getImportDB(record, input.Database)
	if err != nil {
		return ImportResult{}, fmt.Errorf("连接数据库失败: %w", err)
	}

	// Truncate the table if requested.
	if input.Mode == "truncate_insert" {
		truncateSQL := truncateTableSQL(record.Engine, input.Table)
		if _, err := db.Exec(truncateSQL); err != nil {
			return ImportResult{}, fmt.Errorf("清空表失败: %w", err)
		}
	}

	// Build the INSERT statement with parameterized placeholders.
	placeholders := make([]string, len(colNames))
	for i := range placeholders {
		placeholders[i] = "?"
	}

	insertSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		quoteIdentifierForEngine(record.Engine, input.Table),
		strings.Join(colNames, ", "),
		strings.Join(placeholders, ", "))

	// Append engine-specific upsert clause.
	if input.Mode == "upsert" {
		if strings.EqualFold(record.Engine, "sqlite") {
			insertSQL = strings.Replace(insertSQL, "INSERT INTO", "INSERT OR REPLACE INTO", 1)
		} else {
			insertSQL += buildUpsertClause(record.Engine, colNames, pkCols)
		}
	}

	stmt, err := db.Prepare(insertSQL)
	if err != nil {
		return ImportResult{}, fmt.Errorf("准备SQL失败: %w", err)
	}
	defer stmt.Close()

	insertedRows := 0
	skippedRows := 0

	// Process the pending first row (when there is no CSV header).
	if pendingRow != nil {
		args := buildCSVRowArgs(pendingRow, colIndices)
		if _, err := stmt.Exec(args...); err != nil {
			skippedRows++
		} else {
			insertedRows++
		}
	}

	// Process remaining rows.
	for {
		csvRecord, readErr := reader.Read()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			skippedRows++
			continue
		}

		args := buildCSVRowArgs(csvRecord, colIndices)
		if _, err := stmt.Exec(args...); err != nil {
			skippedRows++
			continue
		}
		insertedRows++
	}

	return ImportResult{
		Success:      true,
		Message:      fmt.Sprintf("成功导入 %d 行，跳过 %d 行", insertedRows, skippedRows),
		InsertedRows: insertedRows,
		SkippedRows:  skippedRows,
	}, nil
}

func (s *Service) importSQL(record store.ConnectionRecord, input ImportFileRequest) (ImportResult, error) {
	content, err := os.ReadFile(input.FilePath)
	if err != nil {
		return ImportResult{}, fmt.Errorf("无法读取文件: %w", err)
	}

	statements := splitSQLStatements(string(content))
	if len(statements) == 0 {
		return ImportResult{}, errors.New("文件中没有有效的 SQL 语句")
	}

	return s.executeRelationalImport(record, input.Database, statements, 0, 0)
}

func (s *Service) executeRelationalImport(record store.ConnectionRecord, databaseName string, statements []string, insertCount int, skipCount int) (ImportResult, error) {
	db, err := s.getImportDB(record, databaseName)
	if err != nil {
		return ImportResult{}, fmt.Errorf("连接数据库失败: %w", err)
	}

	insertedRows := 0
	skippedRows := 0
	for _, stmt := range statements {
		trimmed := strings.TrimSpace(stmt)
		if trimmed == "" {
			continue
		}
		_, err := db.Exec(trimmed)
		if err != nil {
			skippedRows++
			continue
		}
		insertedRows++
	}

	// Override with provided counts if they were tracked externally.
	if insertCount > 0 {
		insertedRows = insertCount
	}
	if skipCount > 0 && skippedRows == 0 {
		skippedRows = skipCount
	}

	return ImportResult{
		Success:      true,
		Message:      fmt.Sprintf("成功执行 %d 条语句，跳过 %d 条", insertedRows, skippedRows),
		InsertedRows: insertedRows,
		SkippedRows:  skippedRows,
	}, nil
}

// getImportDB returns a pooled database connection for import operations.
func (s *Service) getImportDB(record store.ConnectionRecord, databaseName string) (*dbsql.DB, error) {
	var opener func(store.ConnectionRecord, string) (*dbsql.DB, error)
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		opener = openMySQLDatabase
	case string(database.PostgreSQL):
		opener = openPostgreSQLDatabase
	case string(database.SQLite):
		opener = func(r store.ConnectionRecord, _ string) (*dbsql.DB, error) { return openSQLiteDatabase(r) }
	case string(database.ClickHouse):
		opener = openClickHouseDatabase
	default:
		return nil, fmt.Errorf("%s 暂不支持文件导入", record.Engine)
	}

	dbName := strings.TrimSpace(databaseName)
	if dbName == "" {
		dbName = firstNonEmpty(record.Database, defaultDatabaseForEngine(record.Engine))
	}

	return s.pool.Get(record.ID, dbName, func() (*dbsql.DB, error) {
		return opener(record, dbName)
	})
}

// quoteIdentifierForEngine quotes a SQL identifier based on the database engine.
func quoteIdentifierForEngine(engine string, name string) string {
	switch strings.ToLower(engine) {
	case "postgresql", "sqlite":
		return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
	default:
		return "`" + strings.ReplaceAll(name, "`", "``") + "`"
	}
}

// splitSQLStatements splits SQL text into individual statements.
func splitSQLStatements(sqlText string) []string {
	var statements []string
	var current strings.Builder
	inString := false
	stringChar := byte(0)

	for i := 0; i < len(sqlText); i++ {
		ch := sqlText[i]

		if inString {
			current.WriteByte(ch)
			if ch == stringChar && (i == 0 || sqlText[i-1] != '\\') {
				inString = false
			}
			continue
		}

		if ch == '\'' || ch == '"' {
			inString = true
			stringChar = ch
			current.WriteByte(ch)
			continue
		}

		// Skip line comments
		if ch == '-' && i+1 < len(sqlText) && sqlText[i+1] == '-' {
			for i < len(sqlText) && sqlText[i] != '\n' {
				i++
			}
			continue
		}

		// Skip block comments
		if ch == '/' && i+1 < len(sqlText) && sqlText[i+1] == '*' {
			i += 2
			for i+1 < len(sqlText) && !(sqlText[i] == '*' && sqlText[i+1] == '/') {
				i++
			}
			if i+1 < len(sqlText) {
				i += 2
			}
			current.WriteByte(' ')
			continue
		}

		if ch == ';' {
			stmt := strings.TrimSpace(current.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			current.Reset()
			continue
		}

		current.WriteByte(ch)
	}

	stmt := strings.TrimSpace(current.String())
	if stmt != "" {
		statements = append(statements, stmt)
	}

	return statements
}

// buildUpsertClause returns the engine-specific upsert clause for an INSERT statement.
func buildUpsertClause(engine string, colNames []string, pkCols []string) string {
	switch strings.ToLower(engine) {
	case "mysql", "mariadb":
		updateParts := make([]string, len(colNames))
		for i, col := range colNames {
			updateParts[i] = fmt.Sprintf("%s = VALUES(%s)", col, col)
		}
		return " ON DUPLICATE KEY UPDATE " + strings.Join(updateParts, ", ")
	case "postgresql", "sqlite":
		if len(pkCols) == 0 {
			return ""
		}
		updateParts := make([]string, len(colNames))
		for i, col := range colNames {
			updateParts[i] = fmt.Sprintf("%s = EXCLUDED.%s", col, col)
		}
		return fmt.Sprintf(" ON CONFLICT (%s) DO UPDATE SET %s",
			strings.Join(pkCols, ", "),
			strings.Join(updateParts, ", "))
	default:
		return ""
	}
}

// truncateTableSQL returns a TRUNCATE or DELETE statement for the given engine.
func truncateTableSQL(engine string, tableName string) string {
	quoted := quoteIdentifierForEngine(engine, tableName)
	switch strings.ToLower(engine) {
	case "sqlite":
		return fmt.Sprintf("DELETE FROM %s", quoted)
	default:
		return fmt.Sprintf("TRUNCATE TABLE %s", quoted)
	}
}

// buildCSVRowArgs converts a CSV row to a slice of arguments for a prepared statement.
func buildCSVRowArgs(csvRecord []string, colIndices []int) []any {
	args := make([]any, 0, len(colIndices))
	for _, idx := range colIndices {
		if idx < len(csvRecord) {
			value := csvRecord[idx]
			if value == "" || strings.EqualFold(value, "NULL") {
				args = append(args, nil)
			} else {
				args = append(args, value)
			}
		} else {
			args = append(args, nil)
		}
	}
	return args
}
