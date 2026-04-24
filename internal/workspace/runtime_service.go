package workspace

import (
	"context"
	dbsql "database/sql"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

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

// GetTableRowCounts 异步获取表行数
func (s *Service) GetTableRowCounts(input TableRowCountRequest) (TableRowCountResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return TableRowCountResult{}, err
	}
	return s.getTableRowCountsByRecord(record, input.Database, input.Tables)
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

func buildLookaheadPaginatedSQL(statement string, page int, pageSize int) string {
	offset := (page - 1) * pageSize
	return fmt.Sprintf("%s LIMIT %d OFFSET %d", strings.TrimRight(statement, "; \n\t"), pageSize+1, offset)
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

func (s *Service) GetTablePartitions(input TablePartitionRequest) (TablePartitionResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return TablePartitionResult{}, err
	}
	return s.getTablePartitionsByRecord(record, input)
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
	case string(database.MongoDB):
		return CreateDatabaseResult{Success: false, Message: "MongoDB 不支持在此创建数据库，请使用命令行"}, nil
	case string(database.Redis):
		return CreateDatabaseResult{Success: false, Message: "Redis 不支持创建数据库"}, nil
	default:
		return CreateDatabaseResult{Success: false, Message: fmt.Sprintf("%s 暂未接入创建数据库", record.Engine)}, nil
	}
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
	case string(database.MongoDB):
		return CreateTableResult{}, fmt.Errorf("MongoDB 不支持可视化建表，请使用命令行")
	default:
		return CreateTableResult{}, fmt.Errorf("%s 暂未接入可视化建表", record.Engine)
	}
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
	case string(database.MongoDB):
		return s.fillMongoDBTable(record, input)
	case string(database.Redis):
		return FillTableResult{Success: false, Message: "Redis 不支持填充数据"}, nil
	default:
		return FillTableResult{Success: false, Message: fmt.Sprintf("%s 暂未接入填充数据", record.Engine)}, nil
	}
}

func executeFill(stmt *dbsql.Stmt, ctx context.Context, fields []TableField, count int, fieldMappings map[string]string) (FillTableResult, error) {
	inserted := 0
	for i := 0; i < count; i++ {
		args := make([]any, 0, len(fields))
		for _, f := range fields {
			if f.AutoIncrement {
				continue
			}
			fakeType := ""
			if fieldMappings != nil {
				fakeType = fieldMappings[f.Name]
			}
			args = append(args, generateFakeValueByType(fakeType, i, f.Type))
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
