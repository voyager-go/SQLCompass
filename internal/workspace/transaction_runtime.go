package workspace

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"sqltool/internal/database"
	"sqltool/internal/store"
)

func (s *Service) ExecuteTransaction(input TransactionRequest) (TransactionResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return TransactionResult{}, err
	}

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.executeRelationalTransaction(record, input)
	case string(database.PostgreSQL):
		return s.executeRelationalTransaction(record, input)
	default:
		return TransactionResult{
			Success: false,
			Message: fmt.Sprintf("%s 暂不支持事务控制", record.Engine),
		}, nil
	}
}

func (s *Service) executeRelationalTransaction(record store.ConnectionRecord, input TransactionRequest) (TransactionResult, error) {
	var sqlStmt string
	switch strings.ToLower(input.Action) {
	case "begin":
		sqlStmt = "BEGIN"
	case "commit":
		sqlStmt = "COMMIT"
	case "rollback":
		sqlStmt = "ROLLBACK"
	default:
		return TransactionResult{
			Success: false,
			Message: fmt.Sprintf("不支持的事务操作: %s", input.Action),
		}, nil
	}

	var opener func(store.ConnectionRecord, string) (*sql.DB, error)
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		opener = openMySQLDatabase
	case string(database.PostgreSQL):
		opener = openPostgreSQLDatabase
	default:
		return TransactionResult{
			Success: false,
			Message: fmt.Sprintf("%s 暂不支持事务控制", record.Engine),
		}, nil
	}

	db, err := s.getDB(record, input.Database, opener)
	if err != nil {
		return TransactionResult{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = db.ExecContext(ctx, sqlStmt)
	if err != nil {
		return TransactionResult{
			Success: false,
			Message: fmt.Sprintf("%s 执行失败: %v", sqlStmt, err),
		}, nil
	}

	return TransactionResult{
		Success: true,
		Message: fmt.Sprintf("%s 执行成功", sqlStmt),
	}, nil
}

func (s *Service) BatchExecute(input BatchExecuteRequest) (BatchExecuteResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return BatchExecuteResult{}, err
	}

	if len(input.SQLs) == 0 {
		return BatchExecuteResult{
			Total:   0,
			Success: 0,
			Failed:  0,
			Errors:  []string{},
			Message: "没有需要执行的 SQL 语句",
		}, nil
	}

	var opener func(store.ConnectionRecord, string) (*sql.DB, error)
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		opener = openMySQLDatabase
	case string(database.PostgreSQL):
		opener = openPostgreSQLDatabase
	case string(database.ClickHouse):
		opener = openClickHouseDatabase
	default:
		return BatchExecuteResult{
			Total:   len(input.SQLs),
			Success: 0,
			Failed:  len(input.SQLs),
			Errors:  []string{fmt.Sprintf("%s 暂不支持批量执行", record.Engine)},
			Message: fmt.Sprintf("%s 暂不支持批量执行", record.Engine),
		}, nil
	}

	db, err := s.getDB(record, input.Database, opener)
	if err != nil {
		return BatchExecuteResult{}, err
	}

	result := BatchExecuteResult{
		Total:  len(input.SQLs),
		Errors: []string{},
	}

	for i, stmt := range input.SQLs {
		trimmed := strings.TrimSpace(stmt)
		if trimmed == "" {
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("第 %d 条: 空语句", i+1))
			if input.StopOnError {
				break
			}
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		_, execErr := db.ExecContext(ctx, trimmed)
		cancel()

		if execErr != nil {
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("第 %d 条: %v", i+1, execErr))
			if input.StopOnError {
				break
			}
		} else {
			result.Success++
		}
	}

	result.Message = fmt.Sprintf("执行完成: 成功 %d, 失败 %d, 共 %d 条", result.Success, result.Failed, result.Total)
	return result, nil
}
