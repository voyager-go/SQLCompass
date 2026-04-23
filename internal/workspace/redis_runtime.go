package workspace

import (
	"errors"
	"sort"
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"sqltool/internal/database"
	"sqltool/internal/store"
)

func (s *Service) getRedisExplorerTree(record store.ConnectionRecord, preferredDatabase string) (ExplorerTree, error) {
	client, err := openRedisClient(record)
	if err != nil {
		return ExplorerTree{}, err
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	info, err := client.Info(ctx, "keyspace").Result()
	if err != nil {
		return ExplorerTree{}, err
	}

	counts := parseRedisKeyspaceInfo(info)
	if len(counts) == 0 {
		counts[0] = 0
	}

	indices := make([]int, 0, len(counts))
	for index := range counts {
		indices = append(indices, index)
	}
	sort.Ints(indices)

	nodes := make([]DatabaseNode, 0, len(indices))
	for _, index := range indices {
		dbName := fmt.Sprintf("db%d", index)
		browse, err := s.browseRedisKeys(record, RedisKeyBrowseRequest{ConnectionID: record.ID, Database: dbName, Cursor: 0, Count: 50})
		if err != nil {
			return ExplorerTree{}, err
		}
		nodes = append(nodes, DatabaseNode{Name: dbName, IsSystem: false, TableCount: counts[index], Tables: browse.Keys, NextCursor: browse.NextCursor, HasMore: browse.HasMore})
	}

	dbNames := make([]string, 0, len(nodes))
	for _, node := range nodes {
		dbNames = append(dbNames, node.Name)
	}
	activeDatabase := chooseActiveDatabase(preferredDatabase, firstNonEmpty(record.Database, "db0"), dbNames)

	return ExplorerTree{ConnectionID: record.ID, ConnectionName: record.Name, Engine: record.Engine, Databases: nodes, ActiveDatabase: activeDatabase, ActiveTable: "", CanDesignTables: false}, nil
}

func (s *Service) BrowseRedisKeys(input RedisKeyBrowseRequest) (RedisKeyBrowseResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return RedisKeyBrowseResult{}, err
	}
	if record.Engine != string(database.Redis) {
		return RedisKeyBrowseResult{}, fmt.Errorf("%s 不是 Redis 连接", record.Engine)
	}
	return s.browseRedisKeys(record, input)
}

func (s *Service) browseRedisKeys(record store.ConnectionRecord, input RedisKeyBrowseRequest) (RedisKeyBrowseResult, error) {
	client, err := openRedisClient(record)
	if err != nil {
		return RedisKeyBrowseResult{}, err
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dbName := normalizeRedisDatabaseName(input.Database, record.Database)
	dbIndex, err := strconv.Atoi(strings.TrimPrefix(dbName, "db"))
	if err != nil {
		return RedisKeyBrowseResult{}, err
	}
	if err := client.Do(ctx, "SELECT", dbIndex).Err(); err != nil {
		return RedisKeyBrowseResult{}, err
	}

	count := input.Count
	if count <= 0 {
		count = 50
	}
	keys, nextCursor, err := client.Scan(ctx, input.Cursor, "*", int64(count)).Result()
	if err != nil {
		return RedisKeyBrowseResult{}, err
	}

	items := make([]TableNode, 0, len(keys))
	for _, key := range keys {
		typeName, _ := client.Type(ctx, key).Result()
		ttl, _ := client.TTL(ctx, key).Result()
		comment := typeName
		if ttl > 0 {
			comment = fmt.Sprintf("%s · TTL %s", typeName, ttl.Round(time.Second))
		}
		items = append(items, TableNode{Name: key, Rows: -1, Engine: "redis", Comment: comment, KeyType: typeName})
	}

	return RedisKeyBrowseResult{ConnectionID: record.ID, Database: dbName, Cursor: input.Cursor, NextCursor: nextCursor, HasMore: nextCursor != 0, Keys: items}, nil
}

func (s *Service) previewRedisKey(record store.ConnectionRecord, input TablePreviewRequest) (QueryResult, error) {
	client, err := openRedisClient(record)
	if err != nil {
		return QueryResult{}, err
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dbName := normalizeRedisDatabaseName(input.Database, record.Database)
	dbIndex, err := strconv.Atoi(strings.TrimPrefix(dbName, "db"))
	if err != nil {
		return QueryResult{}, err
	}
	if err := client.Do(ctx, "SELECT", dbIndex).Err(); err != nil {
		return QueryResult{}, err
	}

	typeName, err := client.Type(ctx, input.Table).Result()
	if err != nil {
		return QueryResult{}, err
	}
	ttl, _ := client.TTL(ctx, input.Table).Result()
	encoding, _ := client.Do(ctx, "OBJECT", "ENCODING", input.Table).Text()
	meta := map[string]string{
		"key":      input.Table,
		"type":     typeName,
		"ttl":      ttl.String(),
		"encoding": encoding,
	}
	var columns []string
	var rows []map[string]string
	switch typeName {
	case "string":
		value, _ := client.Get(ctx, input.Table).Result()
		meta["preview"] = value
		columns = []string{"value"}
		rows = []map[string]string{{"value": value}}
	case "hash":
		pairs, _ := client.HGetAll(ctx, input.Table).Result()
		columns = []string{"field", "value"}
		keys := make([]string, 0, len(pairs))
		for key := range pairs {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		rows = make([]map[string]string, 0, len(keys))
		for _, key := range keys {
			rows = append(rows, map[string]string{"field": key, "value": pairs[key]})
		}
	case "list":
		values, _ := client.LRange(ctx, input.Table, 0, 19).Result()
		columns = []string{"index", "value"}
		rows = make([]map[string]string, 0, len(values))
		for index, value := range values {
			rows = append(rows, map[string]string{"index": strconv.Itoa(index), "value": value})
		}
	case "set":
		values, _ := client.SMembers(ctx, input.Table).Result()
		if len(values) > 20 {
			values = values[:20]
		}
		sort.Strings(values)
		columns = []string{"value"}
		rows = make([]map[string]string, 0, len(values))
		for _, value := range values {
			rows = append(rows, map[string]string{"value": value})
		}
	case "zset":
		values, _ := client.ZRangeWithScores(ctx, input.Table, 0, 19).Result()
		columns = []string{"member", "score"}
		rows = make([]map[string]string, 0, len(values))
		for _, value := range values {
			rows = append(rows, map[string]string{"member": value.Member.(string), "score": strconv.FormatFloat(value.Score, 'f', -1, 64)})
		}
	case "stream":
		values, _ := client.XRangeN(ctx, input.Table, "-", "+", 10).Result()
		columns = []string{"id", "field", "value"}
		rows = []map[string]string{}
		for _, entry := range values {
			for field, value := range entry.Values {
				rows = append(rows, map[string]string{"id": entry.ID, "field": field, "value": fmt.Sprint(value)})
			}
		}
	default:
		meta["preview"] = "暂不支持该类型的值预览"
		columns = []string{"value"}
		rows = []map[string]string{{"value": meta["preview"]}}
	}
	return QueryResult{Columns: columns, Rows: rows, Meta: meta, AffectedRows: int64(len(rows)), DurationMS: 0, EffectiveSQL: input.Table, StatementType: "REDIS_KEY", Message: fmt.Sprintf("已读取 Key %s 的详情", input.Table), Page: 1, PageSize: maxInt(1, len(rows)), AutoLimited: false, HasNextPage: false, Analysis: analyzeSQL(input.Table)}, nil
}

func (s *Service) runRedisQuery(record store.ConnectionRecord, input QueryRequest, persistHistory bool) (QueryResult, error) {
	statement := strings.TrimSpace(input.SQL)
	if statement == "" {
		return QueryResult{}, errors.New("命令不能为空")
	}
	args := splitRedisCommand(statement)
	if len(args) == 0 {
		return QueryResult{}, errors.New("命令不能为空")
	}

	analysis := analyzeSQL(statement)
	client, err := openRedisClient(record)
	if err != nil {
		return QueryResult{}, err
	}
	defer client.Close()

	databaseName := normalizeRedisDatabaseName(input.Database, record.Database)
	if databaseName != "db0" {
		if index, err := strconv.Atoi(strings.TrimPrefix(databaseName, "db")); err == nil {
			client = client.WithTimeout(30 * time.Second)
			if err := client.Do(context.Background(), "SELECT", index).Err(); err != nil {
				return QueryResult{}, err
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	startedAt := time.Now()
	resultValue, err := client.Do(ctx, stringArgsToAny(args)...).Result()
	if err != nil {
		if persistHistory {
			_ = s.appendHistory(record, databaseName, statement, statement, analysis, false, 0, time.Since(startedAt))
		}
		return QueryResult{}, err
	}

	result := redisValueToQueryResult(resultValue)
	result.EffectiveSQL = statement
	result.StatementType = "REDIS"
	result.Analysis = analysis
	result.DurationMS = time.Since(startedAt).Milliseconds()
	result.Page = 1
	result.PageSize = input.PageSize
	if result.Message == "" {
		result.Message = fmt.Sprintf("Redis 命令执行完成，返回 %d 行", len(result.Rows))
	}
	if persistHistory {
		_ = s.appendHistory(record, databaseName, statement, statement, analysis, true, int64(len(result.Rows)), time.Duration(result.DurationMS)*time.Millisecond)
	}
	return result, nil
}

func redisValueToQueryResult(value any) QueryResult {
	switch typed := value.(type) {
	case nil:
		return QueryResult{Columns: []string{"result"}, Rows: []map[string]string{}, Message: "命令执行完成，没有返回内容"}
	case []any:
		rows := make([]map[string]string, 0, len(typed))
		for index, item := range typed {
			rows = append(rows, map[string]string{"index": strconv.Itoa(index), "value": fmt.Sprint(item)})
		}
		return QueryResult{Columns: []string{"index", "value"}, Rows: rows}
	case map[string]any:
		rows := make([]map[string]string, 0, len(typed))
		for key, item := range typed {
			rows = append(rows, map[string]string{"key": key, "value": fmt.Sprint(item)})
		}
		return QueryResult{Columns: []string{"key", "value"}, Rows: rows}
	default:
		return QueryResult{Columns: []string{"result"}, Rows: []map[string]string{{"result": fmt.Sprint(typed)}}}
	}
}

func openRedisClient(record store.ConnectionRecord) (*redis.Client, error) {
	options, _, err := buildRedisOptions(connectionInputFromRecord(record))
	if err != nil {
		return nil, err
	}
	return redis.NewClient(options), nil
}

func connectionInputFromRecord(record store.ConnectionRecord) ConnectionInput {
	return ConnectionInput{Engine: record.Engine, Host: record.Host, Port: record.Port, Username: record.Username, Password: record.Password, Database: record.Database, FilePath: record.FilePath, URL: record.URL}
}

func parseRedisKeyspaceInfo(info string) map[int]int {
	counts := map[int]int{}
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "db") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		index, err := strconv.Atoi(strings.TrimPrefix(parts[0], "db"))
		if err != nil {
			continue
		}
		for _, item := range strings.Split(parts[1], ",") {
			if strings.HasPrefix(item, "keys=") {
				count, err := strconv.Atoi(strings.TrimPrefix(item, "keys="))
				if err == nil {
					counts[index] = count
				}
			}
		}
	}
	return counts
}

func normalizeRedisDatabaseName(requested string, fallback string) string {
	trimmed := strings.TrimSpace(requested)
	if trimmed == "" {
		trimmed = strings.TrimSpace(fallback)
	}
	if trimmed == "" {
		return "db0"
	}
	if strings.HasPrefix(trimmed, "db") {
		return trimmed
	}
	if _, err := strconv.Atoi(trimmed); err == nil {
		return "db" + trimmed
	}
	return trimmed
}

func stringArgsToAny(items []string) []any {
	values := make([]any, len(items))
	for index, item := range items {
		values[index] = item
	}
	return values
}

func splitRedisCommand(statement string) []string {
	parts := strings.Fields(strings.TrimSpace(statement))
	if len(parts) == 0 {
		return nil
	}
	return parts
}

