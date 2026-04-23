package workspace

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"sqltool/internal/database"
	"sqltool/internal/store"
)

func (s *Service) GetDatabaseUsers(input DatabaseUsersRequest) (DatabaseUsersResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return DatabaseUsersResult{}, err
	}

	switch record.Engine {
	case string(database.MySQL), string(database.MariaDB):
		return s.getMySQLDatabaseUsers(record, input)
	case string(database.PostgreSQL):
		return s.getPostgreSQLDatabaseUsers(record, input)
	default:
		return DatabaseUsersResult{
			Supported: false,
			Message:   fmt.Sprintf("%s 暂不支持用户与权限查询", record.Engine),
		}, nil
	}
}

func (s *Service) getMySQLDatabaseUsers(record store.ConnectionRecord, input DatabaseUsersRequest) (DatabaseUsersResult, error) {
	db, err := s.getDB(record, input.Database, openMySQLDatabase)
	if err != nil {
		return DatabaseUsersResult{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, "SELECT user, host FROM mysql.user")
	if err != nil {
		return DatabaseUsersResult{
			Supported: true,
			Message:   fmt.Sprintf("查询用户列表失败: %v", err),
		}, nil
	}
	defer rows.Close()

	var users []DatabaseUser
	for rows.Next() {
		var name, host string
		if err := rows.Scan(&name, &host); err != nil {
			continue
		}

		grants := s.queryMySQLUserGrants(db, name, host)
		users = append(users, DatabaseUser{
			Name:   name,
			Host:   host,
			Grants: grants,
		})
	}

	if users == nil {
		users = []DatabaseUser{}
	}

	return DatabaseUsersResult{
		Users:     users,
		Supported: true,
		Message:   fmt.Sprintf("查询完成，共 %d 个用户", len(users)),
	}, nil
}

func (s *Service) queryMySQLUserGrants(db *sql.DB, name string, host string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Escape single quotes in user/host to prevent injection
	safeName := escapeMySQLString(name)
	safeHost := escapeMySQLString(host)

	rows, err := db.QueryContext(ctx, fmt.Sprintf("SHOW GRANTS FOR '%s'@'%s'", safeName, safeHost))
	if err != nil {
		return ""
	}
	defer rows.Close()

	var grantLines []string
	for rows.Next() {
		var grant string
		if err := rows.Scan(&grant); err != nil {
			continue
		}
		grantLines = append(grantLines, grant)
	}

	if len(grantLines) == 0 {
		return ""
	}

	result := ""
	for i, g := range grantLines {
		if i > 0 {
			result += "; "
		}
		result += g
	}
	return result
}

func escapeMySQLString(s string) string {
	// Simple escaping for single quotes within MySQL identifiers
	var result []byte
	for i := 0; i < len(s); i++ {
		if s[i] == '\'' {
			result = append(result, '\'', '\'')
		} else {
			result = append(result, s[i])
		}
	}
	return string(result)
}

func (s *Service) getPostgreSQLDatabaseUsers(record store.ConnectionRecord, input DatabaseUsersRequest) (DatabaseUsersResult, error) {
	db, err := s.getDB(record, input.Database, openPostgreSQLDatabase)
	if err != nil {
		return DatabaseUsersResult{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, "SELECT usename, usesuper FROM pg_user")
	if err != nil {
		return DatabaseUsersResult{
			Supported: true,
			Message:   fmt.Sprintf("查询用户列表失败: %v", err),
		}, nil
	}
	defer rows.Close()

	var users []DatabaseUser
	for rows.Next() {
		var name string
		var isSuper bool
		if err := rows.Scan(&name, &isSuper); err != nil {
			continue
		}

		grants := ""
		if isSuper {
			grants = "SUPERUSER"
		} else {
			grants = s.queryPostgreSQLUserGrants(db, name)
		}

		users = append(users, DatabaseUser{
			Name:   name,
			Host:   "",
			Grants: grants,
		})
	}

	if users == nil {
		users = []DatabaseUser{}
	}

	return DatabaseUsersResult{
		Users:     users,
		Supported: true,
		Message:   fmt.Sprintf("查询完成，共 %d 个用户", len(users)),
	}, nil
}

func (s *Service) queryPostgreSQLUserGrants(db *sql.DB, name string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx,
		"SELECT string_agg(grant_type, ', ') FROM information_schema.role_table_grants WHERE grantee = $1 GROUP BY grantee",
		name)
	if err != nil {
		return ""
	}
	defer rows.Close()

	if rows.Next() {
		var grants string
		if err := rows.Scan(&grants); err != nil {
			return ""
		}
		return grants
	}

	return ""
}
