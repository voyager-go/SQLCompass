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

func (s *Service) GetPerformanceMetrics(input PerformanceRequest) (PerformanceResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return PerformanceResult{}, err
	}

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.getMySQLPerformanceMetrics(record, input)
	case string(database.PostgreSQL):
		return s.getPostgreSQLPerformanceMetrics(record, input)
	case string(database.ClickHouse):
		return s.getClickHousePerformanceMetrics(record, input)
	default:
		return PerformanceResult{
			MetricType: input.MetricType,
			Supported:  false,
			Message:    fmt.Sprintf("%s 暂不支持性能指标查询", record.Engine),
		}, nil
	}
}

func (s *Service) getMySQLPerformanceMetrics(record store.ConnectionRecord, input PerformanceRequest) (PerformanceResult, error) {
	var query string
	switch input.MetricType {
	case "slow_queries":
		query = "SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 50"
	case "status":
		query = "SHOW GLOBAL STATUS"
	case "variables":
		query = "SHOW GLOBAL VARIABLES"
	case "processlist":
		query = "SHOW PROCESSLIST"
	case "innodb_status":
		query = "SHOW ENGINE INNODB STATUS"
	default:
		return PerformanceResult{
			MetricType: input.MetricType,
			Supported:  false,
			Message:    fmt.Sprintf("MySQL 不支持指标类型: %s", input.MetricType),
		}, nil
	}

	db, err := s.getDB(record, input.Database, openMySQLDatabase)
	if err != nil {
		return PerformanceResult{}, err
	}

	return s.executePerformanceQuery(db, input.MetricType, query)
}

func (s *Service) getPostgreSQLPerformanceMetrics(record store.ConnectionRecord, input PerformanceRequest) (PerformanceResult, error) {
	var query string
	switch input.MetricType {
	case "slow_queries":
		query = "SELECT * FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 50"
	case "activity":
		query = "SELECT * FROM pg_stat_activity"
	case "settings":
		query = "SELECT name, setting, unit, short_desc FROM pg_settings"
	default:
		return PerformanceResult{
			MetricType: input.MetricType,
			Supported:  false,
			Message:    fmt.Sprintf("PostgreSQL 不支持指标类型: %s", input.MetricType),
		}, nil
	}

	db, err := s.getDB(record, input.Database, openPostgreSQLDatabase)
	if err != nil {
		return PerformanceResult{}, err
	}

	return s.executePerformanceQuery(db, input.MetricType, query)
}

func (s *Service) getClickHousePerformanceMetrics(record store.ConnectionRecord, input PerformanceRequest) (PerformanceResult, error) {
	var query string
	switch input.MetricType {
	case "slow_queries":
		query = "SELECT * FROM system.query_log ORDER BY event_time DESC LIMIT 50"
	case "metrics":
		query = "SELECT * FROM system.metrics"
	default:
		return PerformanceResult{
			MetricType: input.MetricType,
			Supported:  false,
			Message:    fmt.Sprintf("ClickHouse 不支持指标类型: %s", input.MetricType),
		}, nil
	}

	db, err := s.getDB(record, input.Database, openClickHouseDatabase)
	if err != nil {
		return PerformanceResult{}, err
	}

	return s.executePerformanceQuery(db, input.MetricType, query)
}

func (s *Service) getDB(record store.ConnectionRecord, databaseName string, opener func(store.ConnectionRecord, string) (*sql.DB, error)) (*sql.DB, error) {
	dbName := strings.TrimSpace(databaseName)
	if dbName == "" {
		dbName = firstNonEmpty(record.Database, defaultDatabaseForEngine(record.Engine))
	}

	return s.pool.Get(record.ID, dbName, func() (*sql.DB, error) {
		return opener(record, dbName)
	})
}

func (s *Service) executePerformanceQuery(db *sql.DB, metricType string, query string) (PerformanceResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return PerformanceResult{
			MetricType: metricType,
			Supported:  true,
			Message:    fmt.Sprintf("查询失败: %v", err),
		}, nil
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return PerformanceResult{}, err
	}

	resultRows, err := scanRows(rows, columns)
	if err != nil {
		return PerformanceResult{}, err
	}

	return PerformanceResult{
		MetricType: metricType,
		Columns:    columns,
		Rows:       resultRows,
		Supported:  true,
		Message:    fmt.Sprintf("查询完成，返回 %d 行", len(resultRows)),
	}, nil
}
