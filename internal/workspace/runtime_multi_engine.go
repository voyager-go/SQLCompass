package workspace

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"sqltool/internal/database"
	"sqltool/internal/store"
)


func (s *Service) getTablePartitionsByRecord(record store.ConnectionRecord, input TablePartitionRequest) (TablePartitionResult, error) {
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.getMySQLTablePartitions(record, input)
	case string(database.PostgreSQL):
		return s.getPostgreSQLTablePartitions(record, input)
	case string(database.ClickHouse):
		return s.getClickHouseTablePartitions(record, input)
	case string(database.SQLite):
		return TablePartitionResult{Supported: false, Message: "SQLite 不支持表分区功能"}, nil
	case string(database.Redis):
		return TablePartitionResult{Supported: false, Message: "Redis 不支持表分区功能"}, nil
	case string(database.MongoDB):
		return TablePartitionResult{Supported: false, Message: "MongoDB 不支持关系型表分区功能（请使用分片集群）"}, nil
	default:
		return TablePartitionResult{Supported: false, Message: fmt.Sprintf("%s 暂未接入分区管理", record.Engine)}, nil
	}
}

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
	case string(database.MongoDB):
		return s.getMongoDBExplorerTree(record, preferredDatabase)
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
	case string(database.MongoDB):
		return s.getMongoDBTableDetail(record, databaseName, tableName)
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
	case string(database.MongoDB):
		return s.runMongoDBQuery(record, input, persistHistory)
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
	case string(database.MongoDB):
		return s.previewMongoDBCollection(record, input)
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
	case string(database.MongoDB):
		return s.getMongoDBTableRowCounts(record, databaseName, tables)
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
	case string(database.MongoDB):
		return s.renameMongoDBCollection(record, input)
	default:
		return RenameTableResult{}, fmt.Errorf("%s 暂未接入真实重命名表", record.Engine)
	}
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
func splitSchemaAndTable(value string, defaultSchema string) (string, string) {
	parts := strings.SplitN(strings.TrimSpace(value), ".", 2)
	if len(parts) == 2 {
		return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
	}
	return defaultSchema, strings.TrimSpace(value)
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
