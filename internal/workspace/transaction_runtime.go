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
	case string(database.MySQL), string(database.MariaDB), string(database.PostgreSQL):
		return s.executeRelationalTransaction(record, input)
	default:
		return TransactionResult{
			Success: false,
			Message: fmt.Sprintf("%s 暂不支持事务控制", record.Engine),
		}, nil
	}
}

func (s *Service) executeRelationalTransaction(record store.ConnectionRecord, input TransactionRequest) (TransactionResult, error) {
	key := poolKey(input.ConnectionID, input.Database)

	switch strings.ToLower(input.Action) {
	case "begin":
		return s.beginTransaction(record, input.Database, key)
	case "commit":
		return s.commitTransaction(key)
	case "rollback":
		return s.rollbackTransaction(key)
	default:
		return TransactionResult{
			Success: false,
			Message: fmt.Sprintf("不支持的事务操作: %s", input.Action),
		}, nil
	}
}

func (s *Service) beginTransaction(record store.ConnectionRecord, dbName, key string) (TransactionResult, error) {
	s.txMu.Lock()
	_, exists := s.txs[key]
	s.txMu.Unlock()
	if exists {
		return TransactionResult{Success: false, Message: "已有活跃事务，请先提交或回滚"}, nil
	}

	var opener func(store.ConnectionRecord, string) (*sql.DB, error)
	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		opener = openMySQLDatabase
	case string(database.PostgreSQL):
		opener = openPostgreSQLDatabase
	default:
		return TransactionResult{Success: false, Message: fmt.Sprintf("%s 暂不支持事务控制", record.Engine)}, nil
	}

	db, err := s.getDB(record, dbName, opener)
	if err != nil {
		return TransactionResult{}, err
	}

	tx, err := db.Begin()
	if err != nil {
		return TransactionResult{Success: false, Message: fmt.Sprintf("开启事务失败: %v", err)}, nil
	}

	s.txMu.Lock()
	s.txs[key] = tx
	s.txMu.Unlock()

	return TransactionResult{Success: true, Message: "事务已开启"}, nil
}

func (s *Service) commitTransaction(key string) (TransactionResult, error) {
	s.txMu.Lock()
	tx, exists := s.txs[key]
	delete(s.txs, key)
	s.txMu.Unlock()

	if !exists {
		return TransactionResult{Success: false, Message: "没有活跃的事务"}, nil
	}

	if err := tx.Commit(); err != nil {
		return TransactionResult{Success: false, Message: fmt.Sprintf("提交失败: %v", err)}, nil
	}

	return TransactionResult{Success: true, Message: "事务已提交"}, nil
}

func (s *Service) rollbackTransaction(key string) (TransactionResult, error) {
	s.txMu.Lock()
	tx, exists := s.txs[key]
	delete(s.txs, key)
	s.txMu.Unlock()

	if !exists {
		return TransactionResult{Success: false, Message: "没有活跃的事务"}, nil
	}

	if err := tx.Rollback(); err != nil {
		return TransactionResult{Success: false, Message: fmt.Sprintf("回滚失败: %v", err)}, nil
	}

	return TransactionResult{Success: true, Message: "事务已回滚"}, nil
}

func (s *Service) GetTransactionStatus(connectionID, database string) bool {
	key := poolKey(connectionID, database)
	s.txMu.Lock()
	_, exists := s.txs[key]
	s.txMu.Unlock()
	return exists
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

	key := poolKey(input.ConnectionID, input.Database)
	executor, err := s.getQueryExecutor(key, record, input.Database, opener)
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
		_, execErr := executor.ExecContext(ctx, trimmed)
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
