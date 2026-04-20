package workspace

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/redis/go-redis/v9"
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
