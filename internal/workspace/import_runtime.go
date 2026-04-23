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
		Rows:    rows,
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
		Rows:    rows,
		Total:   len(statements),
		Format:  "sql",
		Message: fmt.Sprintf("预览前 %d 条语句，共检测到 %d 条", len(rows), len(statements)),
	}, nil
}

func (s *Service) importCSV(record store.ConnectionRecord, input ImportFileRequest) (ImportResult, error) {
	tableDetail, err := s.getTableDetailByRecord(record, input.Database, input.Table)
	if err != nil {
		return ImportResult{}, fmt.Errorf("无法获取表结构: %w", err)
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

	fieldMap := make(map[string]TableField)
	for _, f := range tableDetail.Fields {
		fieldMap[strings.ToLower(f.Name)] = f
	}

	var columns []string
	var insertSQLs []string
	insertedRows := 0
	skippedRows := 0
	rowIndex := 0

	for {
		csvRecord, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			skippedRows++
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

		var valueParts []string
		var colParts []string
		for i, value := range csvRecord {
			if i >= len(columns) {
				break
			}
			colName := columns[i]
			if _, exists := fieldMap[strings.ToLower(colName)]; !exists {
				continue
			}
			colParts = append(colParts, quoteIdentifierForEngine(record.Engine, colName))
			if value == "" || strings.EqualFold(value, "NULL") {
				valueParts = append(valueParts, "NULL")
			} else {
				valueParts = append(valueParts, fmt.Sprintf("'%s'", strings.ReplaceAll(value, "'", "''")))
			}
		}

		if len(colParts) == 0 {
			skippedRows++
			rowIndex++
			continue
		}

		sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s);",
			quoteIdentifierForEngine(record.Engine, input.Table),
			strings.Join(colParts, ", "),
			strings.Join(valueParts, ", "))
		insertSQLs = append(insertSQLs, sql)
		insertedRows++
		rowIndex++
	}

	if len(insertSQLs) == 0 {
		return ImportResult{
			Success:      false,
			Message:      "没有可导入的数据行",
			InsertedRows: 0,
			SkippedRows:  skippedRows,
		}, nil
	}

	if input.Mode == "truncate_insert" {
		truncateSQL := fmt.Sprintf("TRUNCATE TABLE %s;", quoteIdentifierForEngine(record.Engine, input.Table))
		insertSQLs = append([]string{truncateSQL}, insertSQLs...)
	}

	return s.executeRelationalImport(record, input.Database, insertSQLs, insertedRows, skippedRows)
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
		return ImportResult{
			Success: false,
			Message: fmt.Sprintf("%s 暂不支持文件导入执行", record.Engine),
		}, nil
	}

	db, err := opener(record, databaseName)
	if err != nil {
		return ImportResult{}, fmt.Errorf("连接数据库失败: %w", err)
	}
	defer db.Close()

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

	// Override with provided counts if they were tracked externally
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
