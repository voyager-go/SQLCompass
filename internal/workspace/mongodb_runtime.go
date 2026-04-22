package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"time"

	"sqltool/internal/database"
	"sqltool/internal/store"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func openMongoDBClient(record store.ConnectionRecord) (*mongo.Client, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	uri := record.URL
	if uri == "" {
		auth := ""
		if record.Username != "" {
			auth = record.Username
			if record.Password != "" {
				auth += ":" + record.Password
			}
			auth += "@"
		}
		host := record.Host
		if host == "" {
			host = "localhost"
		}
		port := record.Port
		if port <= 0 {
			port = 27017
		}
		uri = fmt.Sprintf("mongodb://%s%s:%d", auth, host, port)
	}

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}
	return client, nil
}

func testMongoDBConnection(normalized ConnectionInput) (ConnectionTestResult, error) {
	record := connectionRecordFromInput(normalized)
	client, err := openMongoDBClient(record)
	if err != nil {
		return ConnectionTestResult{
			Success: false,
			Message: "MongoDB 连接失败",
			Detail:  err.Error(),
		}, nil
	}
	defer client.Disconnect(context.Background())

	return ConnectionTestResult{
		Success: true,
		Message: "MongoDB 连接成功",
		Detail:  fmt.Sprintf("已连接到 %s:%d", normalized.Host, normalized.Port),
	}, nil
}

func (s *Service) getMongoDBExplorerTree(record store.ConnectionRecord, preferredDatabase string) (ExplorerTree, error) {
	client, err := openMongoDBClient(record)
	if err != nil {
		return ExplorerTree{}, err
	}
	defer client.Disconnect(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	dbs, err := client.ListDatabaseNames(ctx, bson.M{})
	if err != nil {
		return ExplorerTree{}, err
	}

	databases := []DatabaseNode{}
	for _, dbName := range dbs {
		if dbName == "admin" || dbName == "local" || dbName == "config" {
			continue
		}
		db := client.Database(dbName)
		collections, err := db.ListCollectionNames(ctx, bson.M{})
		if err != nil {
			continue
		}

		tables := []TableNode{}
		for _, collName := range collections {
			tables = append(tables, TableNode{
				Name:   collName,
				Engine: string(database.MongoDB),
				Rows:   -1,
			})
		}

		databases = append(databases, DatabaseNode{
			Name:   dbName,
			Tables: tables,
		})
	}

	return ExplorerTree{
		Engine:    string(database.MongoDB),
		Databases: databases,
	}, nil
}

func (s *Service) getMongoDBTableDetail(record store.ConnectionRecord, databaseName string, tableName string) (TableDetail, error) {
	client, err := openMongoDBClient(record)
	if err != nil {
		return TableDetail{}, err
	}
	defer client.Disconnect(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	db := client.Database(databaseName)
	coll := db.Collection(tableName)

	cursor, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(100))
	if err != nil {
		return TableDetail{}, err
	}
	defer cursor.Close(ctx)

	fieldMap := map[string]string{}
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		extractBSONFields(doc, "", fieldMap)
	}

	fields := []TableField{}
	for name, typ := range fieldMap {
		fields = append(fields, TableField{
			Name:    name,
			Type:    typ,
			Comment: "",
		})
	}

	indexCursor, err := coll.Indexes().List(ctx)
	if err != nil {
		indexCursor = nil
	}
	indexes := []TableIndex{}
	if indexCursor != nil {
		defer indexCursor.Close(ctx)
		for indexCursor.Next(ctx) {
			var idx bson.M
			if err := indexCursor.Decode(&idx); err != nil {
				continue
			}
			name, _ := idx["name"].(string)
			keys, _ := idx["key"].(bson.M)
			cols := []string{}
			for k := range keys {
				cols = append(cols, k)
			}
			unique := false
			if u, ok := idx["unique"].(bool); ok {
				unique = u
			}
			indexes = append(indexes, TableIndex{
				Name:    name,
				Columns: cols,
				Unique:  unique,
			})
		}
	}

	ddlparts := []string{fmt.Sprintf("// Collection: %s", tableName)}
	for _, f := range fields {
		ddlparts = append(ddlparts, fmt.Sprintf("// %s: %s", f.Name, f.Type))
	}
	ddl := strings.Join(ddlparts, "\n")

	return TableDetail{
		Database: databaseName,
		Table:    tableName,
		Fields:   fields,
		Indexes:  indexes,
		DDL:      ddl,
	}, nil
}

func extractBSONFields(doc bson.M, prefix string, out map[string]string) {
	for k, v := range doc {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		switch val := v.(type) {
		case bson.M:
			extractBSONFields(val, key, out)
		case map[string]interface{}:
			extractBSONFields(bson.M(val), key, out)
		case []interface{}:
			if len(val) > 0 {
				out[key] = fmt.Sprintf("array<%s>", bsonTypeName(val[0]))
			} else {
				out[key] = "array"
			}
		default:
			out[key] = bsonTypeName(v)
		}
	}
}

func bsonTypeName(v interface{}) string {
	switch v.(type) {
	case string:
		return "string"
	case int, int32, int64:
		return "int"
	case float64:
		return "double"
	case bool:
		return "bool"
	case time.Time:
		return "date"
	case bson.M, map[string]interface{}:
		return "object"
	default:
		t := reflect.TypeOf(v)
		if t != nil {
			ts := t.String()
			if strings.Contains(ts, "ObjectID") {
				return "objectId"
			}
			if strings.Contains(ts, "DateTime") {
				return "date"
			}
			if strings.Contains(ts, "Decimal128") {
				return "decimal"
			}
		}
		return fmt.Sprintf("%T", v)
	}
}

var dbCommandPattern = regexp.MustCompile(`^db\.([^.]+)\.(.+)$`)

func (s *Service) runMongoDBQuery(record store.ConnectionRecord, input QueryRequest, persistHistory bool) (QueryResult, error) {
	client, err := openMongoDBClient(record)
	if err != nil {
		return QueryResult{}, err
	}
	defer client.Disconnect(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	dbName := strings.TrimSpace(input.Database)
	if dbName == "" {
		dbName = record.Database
	}
	if dbName == "" {
		return QueryResult{}, errors.New("未指定数据库")
	}

	statement := strings.TrimSpace(input.SQL)

	if strings.HasPrefix(statement, "{") {
		return s.runMongoDBRawCommand(ctx, client, dbName, statement, input.Page, input.PageSize)
	}

	matches := dbCommandPattern.FindStringSubmatch(statement)
	if len(matches) != 3 {
		return QueryResult{}, errors.New("MongoDB 查询格式应为 db.collection.find({}) 或原始 JSON 命令")
	}

	collectionName := matches[1]
	actionWithArgs := matches[2]

	return s.runMongoDBCollectionCommand(ctx, client, dbName, collectionName, actionWithArgs, input.Page, input.PageSize)
}

func (s *Service) runMongoDBRawCommand(ctx context.Context, client *mongo.Client, dbName string, statement string, page int, pageSize int) (QueryResult, error) {
	var cmd bson.M
	if err := bson.UnmarshalExtJSON([]byte(statement), true, &cmd); err != nil {
		return QueryResult{}, fmt.Errorf("JSON 解析失败: %w", err)
	}

	db := client.Database(dbName)
	var result bson.M
	if err := db.RunCommand(ctx, cmd).Decode(&result); err != nil {
		return QueryResult{}, err
	}

	columns := []string{"result"}
	rows := []map[string]string{{"result": fmt.Sprintf("%v", formatBSONValue(result))}}

	return QueryResult{
		Columns:       columns,
		Rows:          rows,
		Page:          page,
		DurationMS:    0,
		HasNextPage:   false,
		StatementType: "MONGODB_COMMAND",
		Message:       "命令已执行",
	}, nil
}

func (s *Service) runMongoDBCollectionCommand(ctx context.Context, client *mongo.Client, dbName string, collectionName string, actionWithArgs string, page int, pageSize int) (QueryResult, error) {
	action, argsStr := parseMongoAction(actionWithArgs)
	if action == "" {
		return QueryResult{}, errors.New("无法解析 MongoDB 命令")
	}

	db := client.Database(dbName)
	coll := db.Collection(collectionName)

	switch action {
	case "find":
		return s.runMongoDBFind(ctx, coll, argsStr, page, pageSize)
	case "aggregate":
		return s.runMongoDBAggregate(ctx, coll, argsStr, page, pageSize)
	case "countDocuments":
		return s.runMongoDBCount(ctx, coll, argsStr, page)
	case "insertOne":
		return s.runMongoDBInsertOne(ctx, coll, argsStr, page)
	case "updateOne":
		return s.runMongoDBUpdateOne(ctx, coll, argsStr, page)
	case "deleteOne":
		return s.runMongoDBDeleteOne(ctx, coll, argsStr, page)
	default:
		return QueryResult{}, fmt.Errorf("暂不支持的 MongoDB 命令: %s", action)
	}
}

func parseMongoAction(actionWithArgs string) (string, string) {
	idx := strings.Index(actionWithArgs, "(")
	if idx == -1 {
		return actionWithArgs, ""
	}
	end := strings.LastIndex(actionWithArgs, ")")
	if end == -1 || end < idx {
		end = len(actionWithArgs)
	}
	return actionWithArgs[:idx], actionWithArgs[idx+1 : end]
}

func (s *Service) runMongoDBFind(ctx context.Context, coll *mongo.Collection, argsStr string, page int, pageSize int) (QueryResult, error) {
	filter := bson.M{}
	if strings.TrimSpace(argsStr) != "" {
		if err := bson.UnmarshalExtJSON([]byte(argsStr), true, &filter); err != nil {
			return QueryResult{}, fmt.Errorf("filter 解析失败: %w", err)
		}
	}

	if pageSize <= 0 {
		pageSize = 50
	}
	skip := (page - 1) * pageSize

	opts := options.Find().SetLimit(int64(pageSize)).SetSkip(int64(skip))
	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		return QueryResult{}, err
	}
	defer cursor.Close(ctx)

	return mongoCursorToQueryResult(cursor, ctx, page, pageSize, "find")
}

func (s *Service) runMongoDBAggregate(ctx context.Context, coll *mongo.Collection, argsStr string, page int, pageSize int) (QueryResult, error) {
	var pipeline bson.A
	if strings.TrimSpace(argsStr) != "" {
		if err := bson.UnmarshalExtJSON([]byte(argsStr), true, &pipeline); err != nil {
			return QueryResult{}, fmt.Errorf("pipeline 解析失败: %w", err)
		}
	}

	if pageSize <= 0 {
		pageSize = 50
	}
	skip := (page - 1) * pageSize

	pipeline = append(pipeline, bson.M{"$skip": skip})
	pipeline = append(pipeline, bson.M{"$limit": pageSize})

	cursor, err := coll.Aggregate(ctx, pipeline)
	if err != nil {
		return QueryResult{}, err
	}
	defer cursor.Close(ctx)

	return mongoCursorToQueryResult(cursor, ctx, page, pageSize, "aggregate")
}

func (s *Service) runMongoDBCount(ctx context.Context, coll *mongo.Collection, argsStr string, page int) (QueryResult, error) {
	filter := bson.M{}
	if strings.TrimSpace(argsStr) != "" {
		if err := bson.UnmarshalExtJSON([]byte(argsStr), true, &filter); err != nil {
			return QueryResult{}, fmt.Errorf("filter 解析失败: %w", err)
		}
	}

	count, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		return QueryResult{}, err
	}

	return QueryResult{
		Columns:       []string{"count"},
		Rows:          []map[string]string{{"count": fmt.Sprintf("%d", count)}},
		Page:          page,
		DurationMS:    0,
		HasNextPage:   false,
		StatementType: "MONGODB_COUNT",
		Message:       fmt.Sprintf("共 %d 个文档", count),
	}, nil
}

func (s *Service) runMongoDBInsertOne(ctx context.Context, coll *mongo.Collection, argsStr string, page int) (QueryResult, error) {
	var doc bson.M
	if err := bson.UnmarshalExtJSON([]byte(argsStr), true, &doc); err != nil {
		return QueryResult{}, fmt.Errorf("document 解析失败: %w", err)
	}

	result, err := coll.InsertOne(ctx, doc)
	if err != nil {
		return QueryResult{}, err
	}

	insertedID := ""
	if result.InsertedID != nil {
		insertedID = fmt.Sprintf("%v", result.InsertedID)
	}

	return QueryResult{
		Columns:       []string{"insertedId"},
		Rows:          []map[string]string{{"insertedId": insertedID}},
		Page:          page,
		DurationMS:    0,
		HasNextPage:   false,
		StatementType: "MONGODB_INSERT",
		Message:       "文档已插入",
	}, nil
}

func (s *Service) runMongoDBUpdateOne(ctx context.Context, coll *mongo.Collection, argsStr string, page int) (QueryResult, error) {
	parts := splitMongoArgs(argsStr, 2)
	if len(parts) < 2 {
		return QueryResult{}, errors.New("updateOne 需要两个参数: filter, update")
	}

	var filter bson.M
	if err := bson.UnmarshalExtJSON([]byte(parts[0]), true, &filter); err != nil {
		return QueryResult{}, fmt.Errorf("filter 解析失败: %w", err)
	}
	var update bson.M
	if err := bson.UnmarshalExtJSON([]byte(parts[1]), true, &update); err != nil {
		return QueryResult{}, fmt.Errorf("update 解析失败: %w", err)
	}

	result, err := coll.UpdateOne(ctx, filter, update)
	if err != nil {
		return QueryResult{}, err
	}

	return QueryResult{
		Columns:       []string{"matchedCount", "modifiedCount"},
		Rows:          []map[string]string{{"matchedCount": fmt.Sprintf("%d", result.MatchedCount), "modifiedCount": fmt.Sprintf("%d", result.ModifiedCount)}},
		Page:          page,
		DurationMS:    0,
		HasNextPage:   false,
		StatementType: "MONGODB_UPDATE",
		Message:       fmt.Sprintf("匹配 %d 个，修改 %d 个", result.MatchedCount, result.ModifiedCount),
	}, nil
}

func (s *Service) runMongoDBDeleteOne(ctx context.Context, coll *mongo.Collection, argsStr string, page int) (QueryResult, error) {
	var filter bson.M
	if err := bson.UnmarshalExtJSON([]byte(argsStr), true, &filter); err != nil {
		return QueryResult{}, fmt.Errorf("filter 解析失败: %w", err)
	}

	result, err := coll.DeleteOne(ctx, filter)
	if err != nil {
		return QueryResult{}, err
	}

	return QueryResult{
		Columns:       []string{"deletedCount"},
		Rows:          []map[string]string{{"deletedCount": fmt.Sprintf("%d", result.DeletedCount)}},
		Page:          page,
		DurationMS:    0,
		HasNextPage:   false,
		StatementType: "MONGODB_DELETE",
		Message:       fmt.Sprintf("已删除 %d 个文档", result.DeletedCount),
	}, nil
}

func splitMongoArgs(argsStr string, expected int) []string {
	if expected <= 1 {
		return []string{argsStr}
	}
	result := []string{}
	depth := 0
	start := 0
	for i, ch := range argsStr {
		switch ch {
		case '{', '[', '(':
			depth++
		case '}', ']', ')':
			depth--
		case ',':
			if depth == 0 {
				result = append(result, strings.TrimSpace(argsStr[start:i]))
				start = i + 1
			}
		}
	}
	result = append(result, strings.TrimSpace(argsStr[start:]))
	return result
}

func mongoCursorToQueryResult(cursor *mongo.Cursor, ctx context.Context, page int, pageSize int, stmtType string) (QueryResult, error) {
	rows := []map[string]string{}
	columnSet := map[string]bool{}

	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		row := flattenBSON(doc)
		for k := range row {
			columnSet[k] = true
		}
		rows = append(rows, row)
	}

	columns := []string{}
	for k := range columnSet {
		columns = append(columns, k)
	}

	return QueryResult{
		Columns:       columns,
		Rows:          rows,
		Page:          page,
		DurationMS:    0,
		HasNextPage:   len(rows) == pageSize,
		StatementType: stmtType,
		Message:       fmt.Sprintf("返回 %d 个文档", len(rows)),
	}, nil
}

func flattenBSON(doc bson.M) map[string]string {
	result := map[string]string{}
	for k, v := range doc {
		result[k] = fmt.Sprintf("%v", formatBSONValue(v))
	}
	return result
}

func formatBSONValue(v interface{}) interface{} {
	switch val := v.(type) {
	case time.Time:
		return val.Format(time.RFC3339)
	case bson.M:
		b, _ := json.Marshal(val)
		return string(b)
	case []interface{}:
		out := make([]interface{}, len(val))
		for i, item := range val {
			out[i] = formatBSONValue(item)
		}
		return out
	case map[string]interface{}:
		b, _ := json.Marshal(val)
		return string(b)
	default:
		t := reflect.TypeOf(v)
		if t != nil {
			ts := t.String()
			if strings.Contains(ts, "ObjectID") {
				if hexer, ok := v.(interface{ Hex() string }); ok {
					return hexer.Hex()
				}
				return fmt.Sprintf("%v", v)
			}
			if strings.Contains(ts, "DateTime") {
				if dt, ok := v.(interface{ Time() time.Time }); ok {
					return dt.Time().Format(time.RFC3339)
				}
				return fmt.Sprintf("%v", v)
			}
			if strings.Contains(ts, "Decimal128") {
				if d, ok := v.(interface{ String() string }); ok {
					return d.String()
				}
				return fmt.Sprintf("%v", v)
			}
			if strings.Contains(ts, "Binary") {
				return fmt.Sprintf("<Binary %v>", v)
			}
			if strings.Contains(ts, "JavaScript") {
				return fmt.Sprintf("%v", v)
			}
			if strings.Contains(ts, "Regex") {
				return fmt.Sprintf("%v", v)
			}
		}
		return val
	}
}

func (s *Service) previewMongoDBCollection(record store.ConnectionRecord, input TablePreviewRequest) (QueryResult, error) {
	client, err := openMongoDBClient(record)
	if err != nil {
		return QueryResult{}, err
	}
	defer client.Disconnect(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db := client.Database(input.Database)
	coll := db.Collection(input.Table)

	pageSize := input.PageSize
	if pageSize <= 0 {
		pageSize = 50
	}
	skip := (input.Page - 1) * pageSize

	opts := options.Find().SetLimit(int64(pageSize)).SetSkip(int64(skip))
	cursor, err := coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		return QueryResult{}, err
	}
	defer cursor.Close(ctx)

	result, err := mongoCursorToQueryResult(cursor, ctx, input.Page, pageSize, "MONGODB_FIND")
	if err != nil {
		return QueryResult{}, err
	}
	result.Message = fmt.Sprintf("已预览集合 %s 的 %d 个文档", input.Table, len(result.Rows))
	return result, nil
}

func (s *Service) getMongoDBTableRowCounts(record store.ConnectionRecord, databaseName string, tables []string) (TableRowCountResult, error) {
	client, err := openMongoDBClient(record)
	if err != nil {
		return TableRowCountResult{}, err
	}
	defer client.Disconnect(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	counts := map[string]int64{}
	db := client.Database(databaseName)
	for _, table := range tables {
		coll := db.Collection(table)
		if len(tables) <= 30 {
			count, err := coll.CountDocuments(ctx, bson.D{})
			if err != nil {
				counts[table] = -1
				continue
			}
			counts[table] = count
		} else {
			count, err := coll.EstimatedDocumentCount(ctx)
			if err != nil {
				counts[table] = -1
				continue
			}
			counts[table] = count
		}
	}

	return TableRowCountResult{Counts: counts}, nil
}

func (s *Service) fillMongoDBTable(record store.ConnectionRecord, input FillTableRequest) (FillTableResult, error) {
	client, err := openMongoDBClient(record)
	if err != nil {
		return FillTableResult{}, err
	}
	defer client.Disconnect(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	database := strings.TrimSpace(input.Database)
	table := strings.TrimSpace(input.Table)
	count := input.Count
	if count <= 0 {
		count = 100
	}

	db := client.Database(database)
	coll := db.Collection(table)

	fields := []TableField{}
	if len(input.FieldMappings) > 0 {
		for name := range input.FieldMappings {
			fields = append(fields, TableField{Name: name, Type: "string"})
		}
	}

	if len(fields) == 0 {
		// 尝试从现有文档推断字段
		cursor, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(1))
		if err == nil && cursor.Next(ctx) {
			var doc bson.M
			if err := cursor.Decode(&doc); err == nil {
				for k := range doc {
					fields = append(fields, TableField{Name: k, Type: "string"})
				}
			}
			cursor.Close(ctx)
		}
	}

	if len(fields) == 0 {
		fields = append(fields, TableField{Name: "name", Type: "string"})
		fields = append(fields, TableField{Name: "value", Type: "string"})
	}

	inserted := 0
	for i := 0; i < count; i++ {
		doc := bson.M{}
		for _, f := range fields {
			fakeType := ""
			if input.FieldMappings != nil {
				fakeType = input.FieldMappings[f.Name]
			}
			doc[f.Name] = generateFakeValueByType(fakeType, i, f.Type)
		}
		if _, err := coll.InsertOne(ctx, doc); err != nil {
			return FillTableResult{Success: false, Message: err.Error(), InsertedRows: inserted}, nil
		}
		inserted++
	}

	return FillTableResult{
		Success:      true,
		Message:      fmt.Sprintf("成功插入 %d 个文档", inserted),
		InsertedRows: inserted,
	}, nil
}

func (s *Service) renameMongoDBCollection(record store.ConnectionRecord, input RenameTableInput) (RenameTableResult, error) {
	client, err := openMongoDBClient(record)
	if err != nil {
		return RenameTableResult{}, err
	}
	defer client.Disconnect(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	adminDB := client.Database("admin")
	cmd := bson.D{
		{Key: "renameCollection", Value: input.Database + "." + input.OldName},
		{Key: "to", Value: input.Database + "." + input.NewName},
	}
	if err := adminDB.RunCommand(ctx, cmd).Err(); err != nil {
		return RenameTableResult{}, err
	}

	return RenameTableResult{
		Database: input.Database,
		OldName:  input.OldName,
		NewName:  input.NewName,
		Message:  fmt.Sprintf("集合 %s 已重命名为 %s", input.OldName, input.NewName),
	}, nil
}
