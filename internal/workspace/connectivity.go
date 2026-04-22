package workspace

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/go-sql-driver/mysql"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/redis/go-redis/v9"
	_ "modernc.org/sqlite"
)

const pingTimeout = 2 * time.Second

func testMySQLConnection(input ConnectionInput) (ConnectionTestResult, error) {
	dsn, detail, err := buildMySQLDSN(input)
	if err != nil {
		return ConnectionTestResult{}, err
	}

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return ConnectionTestResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), pingTimeout)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return ConnectionTestResult{
			Success: false,
			Message: "MySQL authentication failed",
			Detail:  fmt.Sprintf("Driver-level ping to %s failed: %v", detail, err),
		}, nil
	}

	return ConnectionTestResult{
		Success: true,
		Message: "MySQL authentication succeeded",
		Detail:  fmt.Sprintf("Driver-level ping succeeded for %s", detail),
	}, nil
}

func testRedisConnection(input ConnectionInput) (ConnectionTestResult, error) {
	options, detail, err := buildRedisOptions(input)
	if err != nil {
		return ConnectionTestResult{}, err
	}

	client := redis.NewClient(options)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), pingTimeout)
	defer cancel()

	if _, err := client.Ping(ctx).Result(); err != nil {
		return ConnectionTestResult{
			Success: false,
			Message: "Redis ping failed",
			Detail:  fmt.Sprintf("Driver-level ping to %s failed: %v", detail, err),
		}, nil
	}

	return ConnectionTestResult{
		Success: true,
		Message: "Redis ping succeeded",
		Detail:  fmt.Sprintf("Driver-level ping succeeded for %s", detail),
	}, nil
}

func testPostgreSQLConnection(input ConnectionInput) (ConnectionTestResult, error) {
	dsn, detail, err := buildPostgreSQLDSN(input)
	if err != nil {
		return ConnectionTestResult{}, err
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return ConnectionTestResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), pingTimeout)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return ConnectionTestResult{
			Success: false,
			Message: "PostgreSQL authentication failed",
			Detail:  fmt.Sprintf("Driver-level ping to %s failed: %v", detail, err),
		}, nil
	}

	return ConnectionTestResult{
		Success: true,
		Message: "PostgreSQL authentication succeeded",
		Detail:  fmt.Sprintf("Driver-level ping succeeded for %s", detail),
	}, nil
}

func testClickHouseConnection(input ConnectionInput) (ConnectionTestResult, error) {
	dsn, detail, err := buildClickHouseDSN(input, "")
	if err != nil {
		return ConnectionTestResult{}, err
	}

	db, err := sql.Open("clickhouse", dsn)
	if err != nil {
		return ConnectionTestResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), pingTimeout)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return ConnectionTestResult{
			Success: false,
			Message: "ClickHouse ping failed",
			Detail:  fmt.Sprintf("Driver-level ping to %s failed: %v", detail, err),
		}, nil
	}

	return ConnectionTestResult{
		Success: true,
		Message: "ClickHouse ping succeeded",
		Detail:  fmt.Sprintf("Driver-level ping succeeded for %s", detail),
	}, nil
}

func testSQLiteDriverConnection(input ConnectionInput) (ConnectionTestResult, error) {
	dsn, detail := buildSQLiteDSN(input.FilePath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return ConnectionTestResult{}, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), pingTimeout)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return ConnectionTestResult{
			Success: false,
			Message: "SQLite open failed",
			Detail:  fmt.Sprintf("Driver-level open for %s failed: %v", detail, err),
		}, nil
	}

	return ConnectionTestResult{
		Success: true,
		Message: "SQLite open succeeded",
		Detail:  fmt.Sprintf("Driver-level open succeeded for %s", detail),
	}, nil
}

func buildMySQLDSN(input ConnectionInput) (string, string, error) {
	cfg := mysql.NewConfig()
	cfg.ParseTime = true
	cfg.Timeout = pingTimeout
	cfg.ReadTimeout = pingTimeout
	cfg.WriteTimeout = pingTimeout

	if strings.TrimSpace(input.URL) != "" {
		trimmedURL := strings.TrimSpace(input.URL)
		if looksLikeMySQLDSN(trimmedURL) {
			parsed, err := mysql.ParseDSN(trimmedURL)
			if err != nil {
				return "", "", fmt.Errorf("invalid MySQL DSN: %w", err)
			}

			ensureMySQLTimeouts(parsed)
			return parsed.FormatDSN(), redactMySQLTarget(parsed), nil
		}

		parsedURL, err := url.Parse(trimmedURL)
		if err != nil {
			return "", "", fmt.Errorf("invalid MySQL URL: %w", err)
		}

		if parsedURL.Host == "" {
			return "", "", errors.New("MySQL URL must include a host")
		}

		cfg.User = parsedURL.User.Username()
		if password, ok := parsedURL.User.Password(); ok {
			cfg.Passwd = password
		}

		host := parsedURL.Hostname()
		port := parsedURL.Port()
		if port == "" {
			port = strconv.Itoa(defaultPortForEngine(input.Engine))
		}
		cfg.Addr = net.JoinHostPort(host, port)
		cfg.Net = "tcp"
		cfg.DBName = strings.TrimPrefix(parsedURL.Path, "/")
		cfg.Params = flattenURLQuery(parsedURL)

		ensureMySQLTimeouts(cfg)
		return cfg.FormatDSN(), redactMySQLTarget(cfg), nil
	}

	cfg.User = input.Username
	cfg.Passwd = input.Password
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(input.Host, strconv.Itoa(input.Port))
	cfg.DBName = input.Database

	return cfg.FormatDSN(), redactMySQLTarget(cfg), nil
}

func buildRedisOptions(input ConnectionInput) (*redis.Options, string, error) {
	if strings.TrimSpace(input.URL) != "" {
		options, err := redis.ParseURL(strings.TrimSpace(input.URL))
		if err != nil {
			return nil, "", fmt.Errorf("invalid Redis URL: %w", err)
		}

		options.DialTimeout = pingTimeout
		options.ReadTimeout = pingTimeout
		options.WriteTimeout = pingTimeout

		return options, options.Addr, nil
	}

	if input.Host == "" {
		return nil, "", errors.New("redis host is required")
	}

	if input.Port <= 0 {
		return nil, "", errors.New("redis port must be greater than zero")
	}

	options := &redis.Options{
		Addr:         net.JoinHostPort(input.Host, strconv.Itoa(input.Port)),
		Username:     input.Username,
		Password:     input.Password,
		DB:           parseRedisDB(input.Database),
		DialTimeout:  pingTimeout,
		ReadTimeout:  pingTimeout,
		WriteTimeout: pingTimeout,
	}

	return options, options.Addr, nil
}

func buildPostgreSQLDSN(input ConnectionInput) (string, string, error) {
	if strings.TrimSpace(input.URL) != "" {
		parsedURL, err := url.Parse(strings.TrimSpace(input.URL))
		if err != nil {
			return "", "", fmt.Errorf("invalid PostgreSQL URL: %w", err)
		}
		query := parsedURL.Query()
		if query.Get("connect_timeout") == "" {
			query.Set("connect_timeout", strconv.Itoa(int(pingTimeout/time.Second)))
		}
		parsedURL.RawQuery = query.Encode()
		return parsedURL.String(), parsedURL.Redacted(), nil
	}

	if input.Host == "" {
		return "", "", errors.New("postgresql host is required")
	}
	if input.Port <= 0 {
		return "", "", errors.New("postgresql port must be greater than zero")
	}

	parsedURL := &url.URL{
		Scheme: "postgres",
		Host:   net.JoinHostPort(input.Host, strconv.Itoa(input.Port)),
		Path:   "/" + firstNonEmpty(input.Database, "postgres"),
	}
	if input.Username != "" {
		parsedURL.User = url.UserPassword(input.Username, input.Password)
		if input.Password == "" {
			parsedURL.User = url.User(input.Username)
		}
	}
	query := parsedURL.Query()
	query.Set("connect_timeout", strconv.Itoa(int(pingTimeout/time.Second)))
	if query.Get("sslmode") == "" {
		query.Set("sslmode", "disable")
	}
	parsedURL.RawQuery = query.Encode()

	return parsedURL.String(), parsedURL.Redacted(), nil
}

func buildSQLiteDSN(filePath string) (string, string) {
	cleanPath := filepath.Clean(strings.TrimSpace(filePath))
	return cleanPath, cleanPath
}

func buildClickHouseDSN(input ConnectionInput, databaseOverride string) (string, string, error) {
	if strings.TrimSpace(input.URL) != "" {
		parsedURL, err := url.Parse(strings.TrimSpace(input.URL))
		if err != nil {
			return "", "", fmt.Errorf("invalid ClickHouse URL: %w", err)
		}
		if strings.TrimSpace(databaseOverride) != "" {
			parsedURL.Path = "/" + strings.TrimSpace(databaseOverride)
		}
		query := parsedURL.Query()
		if query.Get("dial_timeout") == "" {
			query.Set("dial_timeout", pingTimeout.String())
		}
		parsedURL.RawQuery = query.Encode()
		return parsedURL.String(), parsedURL.Redacted(), nil
	}

	if input.Host == "" {
		return "", "", errors.New("clickhouse host is required")
	}
	if input.Port <= 0 {
		return "", "", errors.New("clickhouse port must be greater than zero")
	}

	parsedURL := &url.URL{
		Scheme: "clickhouse",
		Host:   net.JoinHostPort(input.Host, strconv.Itoa(input.Port)),
		Path:   "/" + firstNonEmpty(strings.TrimSpace(databaseOverride), input.Database, "default"),
	}
	if input.Username != "" {
		parsedURL.User = url.UserPassword(input.Username, input.Password)
		if input.Password == "" {
			parsedURL.User = url.User(input.Username)
		}
	}
	query := parsedURL.Query()
	query.Set("dial_timeout", pingTimeout.String())
	parsedURL.RawQuery = query.Encode()

	return parsedURL.String(), parsedURL.Redacted(), nil
}

func flattenURLQuery(parsed *url.URL) map[string]string {
	values := map[string]string{}
	for key, items := range parsed.Query() {
		if len(items) == 0 {
			continue
		}

		values[key] = items[0]
	}

	return values
}

func ensureMySQLTimeouts(cfg *mysql.Config) {
	if cfg.Timeout == 0 {
		cfg.Timeout = pingTimeout
	}
	if cfg.ReadTimeout == 0 {
		cfg.ReadTimeout = pingTimeout
	}
	if cfg.WriteTimeout == 0 {
		cfg.WriteTimeout = pingTimeout
	}
}

func redactMySQLTarget(cfg *mysql.Config) string {
	if cfg == nil {
		return "mysql"
	}

	user := cfg.User
	if user == "" {
		user = "anonymous"
	}

	host := cfg.Addr
	if host == "" {
		host = "default"
	}

	if cfg.DBName != "" {
		return fmt.Sprintf("%s@%s/%s", user, host, cfg.DBName)
	}

	return fmt.Sprintf("%s@%s", user, host)
}

func looksLikeMySQLDSN(value string) bool {
	return strings.Contains(value, "@tcp(") || strings.Contains(value, "@unix(")
}

func parseRedisDB(value string) int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0
	}

	index, err := strconv.Atoi(trimmed)
	if err != nil || index < 0 {
		return 0
	}

	return index
}
