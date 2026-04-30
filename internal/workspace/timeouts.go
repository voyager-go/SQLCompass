package workspace

import "time"

// Centralized timeout constants used across all database engines.
const (
	// TimeoutPing is the timeout for testing a database connection.
	TimeoutPing = 2 * time.Second

	// TimeoutPoolPing is the timeout for validating a pooled connection.
	TimeoutPoolPing = 2 * time.Second

	// TimeoutExplorerTree is the timeout for building the database explorer tree.
	TimeoutExplorerTree = 5 * time.Second

	// TimeoutTableMetadata is the timeout for loading table structure, fields, and indexes.
	TimeoutTableMetadata = 5 * time.Second

	// TimeoutQuery is the timeout for executing user queries.
	TimeoutQuery = 30 * time.Second

	// TimeoutExec is the timeout for executing DDL/DML statements (CREATE, ALTER, etc.).
	TimeoutExec = 15 * time.Second

	// TimeoutFillTable is the timeout for bulk-inserting fake data into a table.
	TimeoutFillTable = 30 * time.Second

	// TimeoutPerformance is the timeout for performance metric queries.
	TimeoutPerformance = 15 * time.Second

	// TimeoutPartition is the timeout for partition metadata queries.
	TimeoutPartition = 10 * time.Second

	// TimeoutUserQuery is the timeout for user/permission metadata queries.
	TimeoutUserQuery = 15 * time.Second

	// ConnMaxLifetime is the maximum lifetime of a pooled connection.
	ConnMaxLifetime = 30 * time.Minute

	// ConnMaxIdle is the maximum idle time before a pooled connection is closed.
	ConnMaxIdle = 5 * time.Minute

	// ConnMaxAge is the maximum total age before a pooled connection is closed.
	ConnMaxAge = 30 * time.Minute

	// PoolMaxOpenConns is the maximum number of open connections per pool entry for SQL databases.
	PoolMaxOpenConns = 4

	// PoolMaxIdleConns is the maximum number of idle connections per pool entry for SQL databases.
	PoolMaxIdleConns = 2
)
