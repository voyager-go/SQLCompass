package workspace

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"sqltool/internal/config"
	"sqltool/internal/store"
)

type fieldPreset struct {
	Type    string
	Comment string
}

var defaultFieldDictionary = map[string]fieldPreset{
	"id":            {Type: "bigint", Comment: "主键"},
	"user_id":       {Type: "bigint", Comment: "用户ID"},
	"tenant_id":     {Type: "bigint", Comment: "租户ID"},
	"username":      {Type: "varchar(64)", Comment: "用户名"},
	"nickname":      {Type: "varchar(64)", Comment: "昵称"},
	"real_name":     {Type: "varchar(64)", Comment: "真实姓名"},
	"email":         {Type: "varchar(128)", Comment: "邮箱"},
	"phone":         {Type: "varchar(32)", Comment: "手机号"},
	"mobile":        {Type: "varchar(32)", Comment: "手机号"},
	"password":      {Type: "varchar(255)", Comment: "密码摘要"},
	"avatar":        {Type: "varchar(255)", Comment: "头像地址"},
	"status":        {Type: "tinyint", Comment: "状态"},
	"is_deleted":    {Type: "tinyint", Comment: "是否删除"},
	"sort":          {Type: "int", Comment: "排序值"},
	"remark":        {Type: "varchar(255)", Comment: "备注"},
	"title":         {Type: "varchar(255)", Comment: "标题"},
	"content":       {Type: "text", Comment: "内容"},
	"description":   {Type: "varchar(255)", Comment: "描述"},
	"amount":        {Type: "decimal(10,2)", Comment: "金额"},
	"price":         {Type: "decimal(10,2)", Comment: "价格"},
	"total_amount":  {Type: "decimal(10,2)", Comment: "总金额"},
	"created_at":    {Type: "datetime", Comment: "创建时间"},
	"updated_at":    {Type: "datetime", Comment: "更新时间"},
	"deleted_at":    {Type: "datetime", Comment: "删除时间"},
	"last_login_at": {Type: "datetime", Comment: "最后登录时间"},
	"last_login_ip": {Type: "varchar(64)", Comment: "最后登录IP"},
	"creator_id":    {Type: "bigint", Comment: "创建人ID"},
	"updater_id":    {Type: "bigint", Comment: "更新人ID"},
}

func (s *Service) GetFieldDictionarySuggestion(input FieldDictionaryRequest) (FieldDictionarySuggestion, error) {
	fieldName := strings.TrimSpace(strings.ToLower(input.FieldName))
	if fieldName == "" {
		return FieldDictionarySuggestion{}, errors.New("字段名不能为空")
	}

	if preset, ok := defaultFieldDictionary[fieldName]; ok {
		return FieldDictionarySuggestion{
			FieldName:      input.FieldName,
			Matched:        true,
			Type:           preset.Type,
			Comment:        preset.Comment,
			NeedsAIComment: strings.TrimSpace(preset.Comment) == "",
		}, nil
	}

	for key, preset := range defaultFieldDictionary {
		if strings.HasSuffix(fieldName, key) || strings.Contains(fieldName, key) {
			return FieldDictionarySuggestion{
				FieldName:      input.FieldName,
				Matched:        true,
				Type:           preset.Type,
				Comment:        preset.Comment,
				NeedsAIComment: strings.TrimSpace(preset.Comment) == "",
			}, nil
		}
	}

	return FieldDictionarySuggestion{
		FieldName:      input.FieldName,
		Matched:        false,
		Type:           "varchar(255)",
		Comment:        "",
		NeedsAIComment: true,
	}, nil
}

func (s *Service) GenerateFieldComment(input AIFieldCommentRequest) (AIFieldCommentResult, error) {
	fieldName := strings.TrimSpace(input.FieldName)
	if fieldName == "" {
		return AIFieldCommentResult{}, errors.New("字段名不能为空")
	}

	state, err := s.store.LoadConfig()
	if err != nil {
		return AIFieldCommentResult{}, err
	}

	baseURL, modelName, apiKey := resolveAIConfig(state.AI)
	if strings.TrimSpace(apiKey) == "" {
		return AIFieldCommentResult{}, errors.New("尚未配置 AI API Key")
	}

	prompt := fmt.Sprintf("你是数据库建模助手。请仅根据字段名生成一个简洁、专业、中文的字段注释，不要解释，不要加引号，不要超过12个字。字段名：%s", fieldName)
	comment, err := callChatCompletion(baseURL, modelName, apiKey, prompt)
	if err != nil {
		return AIFieldCommentResult{}, err
	}

	return AIFieldCommentResult{
		FieldName: fieldName,
		Comment:   strings.TrimSpace(comment),
	}, nil
}

func (s *Service) GenerateIndexName(input GenerateIndexNameRequest) (GenerateIndexNameResult, error) {
	if len(input.Columns) == 0 {
		return GenerateIndexNameResult{}, errors.New("请先选择索引字段")
	}

	state, err := s.store.LoadConfig()
	if err != nil {
		return GenerateIndexNameResult{}, err
	}

	baseURL, modelName, apiKey := resolveAIConfig(state.AI)
	if strings.TrimSpace(apiKey) == "" {
		return GenerateIndexNameResult{}, errors.New("尚未配置 AI API Key")
	}

	uniqueHint := ""
	if input.Unique {
		uniqueHint = "唯一"
	}

	prompt := fmt.Sprintf(
		"你是数据库建模助手。请为以下%s索引生成一个规范的索引名称，使用蛇形命名法（小写+下划线），不要超过30个字符，不要解释，只输出名称本身。\n表名：%s\n字段：%s",
		uniqueHint, input.TableName, strings.Join(input.Columns, ", "),
	)
	name, err := callChatCompletion(baseURL, modelName, apiKey, prompt)
	if err != nil {
		return GenerateIndexNameResult{}, err
	}

	name = strings.TrimSpace(name)
	name = strings.Trim(name, "`\"")
	name = strings.ReplaceAll(name, " ", "_")
	name = strings.ToLower(name)
	if name == "" {
		return GenerateIndexNameResult{}, errors.New("AI 未返回有效索引名称")
	}

	return GenerateIndexNameResult{Name: name}, nil
}

func (s *Service) SmartFillTableData(input SmartFillTableRequest) (SmartFillTableResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return SmartFillTableResult{}, err
	}

	database := strings.TrimSpace(input.Database)
	table := strings.TrimSpace(input.Table)
	if database == "" || table == "" {
		return SmartFillTableResult{}, errors.New("数据库名和表名不能为空")
	}

	count := input.Count
	if count <= 0 {
		count = 10
	}
	if count > 100 {
		count = 100
	}

	detail, err := s.getTableDetailByRecord(record, database, table)
	if err != nil {
		return SmartFillTableResult{Success: false, Message: err.Error()}, nil
	}

	state, err := s.store.LoadConfig()
	if err != nil {
		return SmartFillTableResult{}, err
	}

	baseURL, modelName, apiKey := resolveAIConfig(state.AI)
	if strings.TrimSpace(apiKey) == "" {
		return SmartFillTableResult{Success: false, Message: "尚未配置 AI API Key，无法进行智能填充"}, nil
	}

	prompt := fmt.Sprintf(
		"你是数据生成助手。请基于以下表结构，生成 %d 条 INSERT 语句来插入有意义的测试数据。\n\n要求：\n1. 数据要符合字段类型和注释语义，真实自然，不要重复模板数据；\n2. 主键自增字段不需要赋值（省略该字段）；\n3. 时间字段使用合理的日期时间；\n4. 字符串字段使用中文或英文真实内容；\n5. 数值字段使用合理范围内的值；\n6. 只输出纯 SQL，不要 markdown 代码块，不要解释；\n7. 每条 INSERT 语句以分号结尾。\n\n当前引擎：%s\n\n表结构：\n%s\n\n请直接输出 %d 条 INSERT 语句：",
		count, record.Engine, formatTableDetail(detail), count,
	)

	content, err := callChatCompletion(baseURL, modelName, apiKey, prompt)
	if err != nil {
		return SmartFillTableResult{Success: false, Message: "AI 生成失败：" + err.Error()}, nil
	}

	sqls := extractInsertStatements(content)
	if len(sqls) == 0 {
		return SmartFillTableResult{Success: false, Message: "AI 未返回有效的 INSERT 语句"}, nil
	}

	inserted := 0
	for _, sql := range sqls {
		if strings.TrimSpace(sql) == "" {
			continue
		}
		_, err := s.executeQueryByRecord(record, QueryRequest{
			ConnectionID: input.ConnectionID,
			Database:     database,
			SQL:          sql,
		}, false)
		if err != nil {
			return SmartFillTableResult{
				Success:      false,
				Message:      fmt.Sprintf("执行到第 %d 条时失败：%s", inserted+1, err.Error()),
				InsertedRows: inserted,
				SQLs:         sqls,
			}, nil
		}
		inserted++
	}

	return SmartFillTableResult{
		Success:      true,
		Message:      fmt.Sprintf("AI 智能填充成功，共插入 %d 条数据", inserted),
		InsertedRows: inserted,
		SQLs:         sqls,
	}, nil
}

func (s *Service) PreviewSmartFillSQL(input PreviewSmartFillSQLRequest) (PreviewSmartFillSQLResult, error) {
	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return PreviewSmartFillSQLResult{}, err
	}

	database := strings.TrimSpace(input.Database)
	table := strings.TrimSpace(input.Table)
	if database == "" || table == "" {
		return PreviewSmartFillSQLResult{}, errors.New("数据库名和表名不能为空")
	}

	count := input.Count
	if count <= 0 {
		count = 10
	}
	if count > 100 {
		count = 100
	}

	detail, err := s.getTableDetailByRecord(record, database, table)
	if err != nil {
		return PreviewSmartFillSQLResult{Success: false, Message: err.Error()}, nil
	}

	state, err := s.store.LoadConfig()
	if err != nil {
		return PreviewSmartFillSQLResult{}, err
	}

	baseURL, modelName, apiKey := resolveAIConfig(state.AI)
	if strings.TrimSpace(apiKey) == "" {
		return PreviewSmartFillSQLResult{Success: false, Message: "尚未配置 AI API Key，无法预览智能填充"}, nil
	}

	prompt := fmt.Sprintf(
		"你是数据生成助手。请基于以下表结构，生成 %d 条 INSERT 语句来插入有意义的测试数据。\n\n要求：\n1. 数据要符合字段类型和注释语义，真实自然，不要重复模板数据；\n2. 主键自增字段不需要赋值（省略该字段）；\n3. 时间字段使用合理的日期时间；\n4. 字符串字段使用中文或英文真实内容；\n5. 数值字段使用合理范围内的值；\n6. 只输出纯 SQL，不要 markdown 代码块，不要解释；\n7. 每条 INSERT 语句以分号结尾；\n8. 在 SQL 之前，先用一行简要说明你的数据生成思路（以【思路】开头）。\n\n当前引擎：%s\n\n表结构：\n%s\n\n请直接输出思路说明和 %d 条 INSERT 语句：",
		count, record.Engine, formatTableDetail(detail), count,
	)

	content, err := callChatCompletion(baseURL, modelName, apiKey, prompt)
	if err != nil {
		return PreviewSmartFillSQLResult{Success: false, Message: "AI 生成失败：" + err.Error()}, nil
	}

	// Extract reasoning
	reasoning := ""
	lines := strings.Split(content, "\n")
	var sqlLines []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "【思路】") || strings.HasPrefix(trimmed, "思路：") || strings.HasPrefix(trimmed, "思路:") {
			reasoning = strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(trimmed, "【思路】"), "思路："), "思路:")
			reasoning = strings.TrimSpace(reasoning)
			continue
		}
		if strings.HasPrefix(strings.ToUpper(trimmed), "INSERT") {
			sqlLines = append(sqlLines, trimmed)
		}
	}

	sqls := extractInsertStatements(strings.Join(sqlLines, "\n"))
	if len(sqls) == 0 {
		return PreviewSmartFillSQLResult{Success: false, Message: "AI 未返回有效的 INSERT 语句"}, nil
	}

	return PreviewSmartFillSQLResult{
		Success:   true,
		Message:   fmt.Sprintf("AI 已生成 %d 条 INSERT 语句", len(sqls)),
		Reasoning: reasoning,
		SQLs:      sqls,
	}, nil
}

func extractInsertStatements(content string) []string {
	trimmed := strings.TrimSpace(content)
	trimmed = strings.TrimPrefix(trimmed, "```sql")
	trimmed = strings.TrimPrefix(trimmed, "```SQL")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	trimmed = strings.TrimSpace(trimmed)

	raws := strings.Split(trimmed, ";")
	var statements []string
	for _, raw := range raws {
		raw = strings.TrimSpace(raw)
		if strings.HasPrefix(strings.ToUpper(raw), "INSERT") {
			statements = append(statements, raw+";")
		}
	}
	return statements
}

func formatTableDetail(detail TableDetail) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("表名: %s\n", detail.Table))
	if strings.TrimSpace(detail.DDL) != "" {
		b.WriteString(fmt.Sprintf("DDL:\n%s\n", detail.DDL))
	}
	if len(detail.Fields) > 0 {
		b.WriteString("字段:\n")
		for _, f := range detail.Fields {
			flags := []string{}
			if f.Primary {
				flags = append(flags, "主键")
			}
			if f.AutoIncrement {
				flags = append(flags, "自增")
			}
			if !f.Nullable {
				flags = append(flags, "非空")
			}
			if f.DefaultValue != "" {
				flags = append(flags, fmt.Sprintf("默认值:%s", f.DefaultValue))
			}
			line := fmt.Sprintf("  - %s (%s)", f.Name, f.Type)
			if len(flags) > 0 {
				line += " " + strings.Join(flags, ",")
			}
			if strings.TrimSpace(f.Comment) != "" {
				line += fmt.Sprintf(" 注释:%s", f.Comment)
			}
			b.WriteString(line + "\n")
		}
	}
	if len(detail.Indexes) > 0 {
		b.WriteString("索引:\n")
		for _, idx := range detail.Indexes {
			unique := ""
			if idx.Unique {
				unique = " 唯一"
			}
			b.WriteString(fmt.Sprintf("  - %s (%s)%s\n", idx.Name, strings.Join(idx.Columns, ","), unique))
		}
	}
	return b.String()
}

func (s *Service) OptimizeSQL(input SQLOptimizeRequest) (SQLOptimizeResult, error) {
	sqlText := strings.TrimSpace(input.SQL)
	if sqlText == "" {
		return SQLOptimizeResult{}, errors.New("SQL 不能为空")
	}

	state, err := s.store.LoadConfig()
	if err != nil {
		return SQLOptimizeResult{}, err
	}

	baseURL, modelName, apiKey := resolveAIConfig(state.AI)
	if strings.TrimSpace(apiKey) == "" {
		return SQLOptimizeResult{}, errors.New("尚未配置 AI API Key，无法执行 SQL 优化")
	}

	extraPrompt := strings.TrimSpace(input.Prompt)
	var schemaContext strings.Builder

	// 优先使用前端传入的当前选中表名，而不是从 SQL 中解析
	if strings.TrimSpace(input.Table) != "" && strings.TrimSpace(input.ConnectionID) != "" && strings.TrimSpace(input.Database) != "" {
		detail, err := s.GetTableDetail(TableDetailRequest{
			ConnectionID: input.ConnectionID,
			Database:     input.Database,
			Table:        input.Table,
		})
		if err == nil {
			schemaContext.WriteString(formatTableDetail(detail) + "\n")
		}
	}

	prompt := "你是数据库 SQL 优化助手。请检查并优化下面这段 SQL，并输出 JSON。要求：1. 保持原始语义，不允许扩大影响范围；2. 纠正明显语法问题；3. 保持字段、表名和条件不变；4. 若语句已合理，仅做轻量优化和规范化；5. 不要补充任何额外语句；6. reasoning 用中文简洁说明为什么这样优化。输出格式：{\"sql\":\"...\",\"reasoning\":\"...\"}。不要 markdown。\n"
	if schemaContext.Len() > 0 {
		prompt += "\n以下是当前选中数据表的结构，请结合这些信息进行优化：\n\n" + schemaContext.String()
	} else {
		prompt += "\n（未获取到当前选中数据表的结构信息，请基于 SQL 本身进行优化）\n"
	}
	prompt += "\nSQL:\n" + sqlText
	if extraPrompt != "" {
		prompt += "\n\n额外要求：\n" + extraPrompt
	}
	optimized, err := callChatCompletion(baseURL, modelName, apiKey, prompt)
	if err != nil {
		return SQLOptimizeResult{}, err
	}

	var parsed struct {
		SQL       string `json:"sql"`
		Reasoning string `json:"reasoning"`
	}
	if err := json.Unmarshal([]byte(extractJSONBlock(optimized)), &parsed); err != nil {
		parsed.SQL = extractSQLText(optimized)
	}
	cleaned := extractSQLText(parsed.SQL)
	if strings.TrimSpace(cleaned) == "" {
		return SQLOptimizeResult{}, errors.New("AI 未返回有效 SQL")
	}

	return SQLOptimizeResult{
		SQL:        cleaned,
		Analysis:   analyzeSQL(cleaned),
		Source:     "ai",
		Reasoning:  strings.TrimSpace(parsed.Reasoning),
		PromptUsed: extraPrompt,
	}, nil
}

func (s *Service) BeautifySQL(input SQLOptimizeRequest) (SQLOptimizeResult, error) {
	sqlText := strings.TrimSpace(input.SQL)
	if sqlText == "" {
		return SQLOptimizeResult{}, errors.New("SQL 不能为空")
	}

	formatted := formatSQLText(sqlText)
	return SQLOptimizeResult{
		SQL:        formatted,
		Analysis:   analyzeSQL(formatted),
		Source:     "local",
		Reasoning:  "已按本地规则统一关键字、换行和缩进。",
		PromptUsed: "",
	}, nil
}

func (s *Service) ChatWithDatabase(input ChatDatabaseRequest) (ChatDatabaseResponse, error) {
	message := strings.TrimSpace(input.Message)
	if message == "" {
		return ChatDatabaseResponse{}, errors.New("请输入想让 AI 处理的内容")
	}

	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return ChatDatabaseResponse{}, err
	}

	state, err := s.store.LoadConfig()
	if err != nil {
		return ChatDatabaseResponse{}, err
	}

	baseURL, modelName, apiKey := resolveAIConfig(state.AI)
	if strings.TrimSpace(apiKey) == "" {
		return ChatDatabaseResponse{}, errors.New("尚未配置 AI API Key")
	}

	schemaContext := s.buildChatSchemaContext(record, strings.TrimSpace(input.Database), strings.TrimSpace(input.SelectedTable), message)
	historyContext := make([]string, 0, len(input.History))
	for _, item := range input.History {
		if strings.TrimSpace(item.Content) == "" {
			continue
		}
		historyContext = append(historyContext, fmt.Sprintf("%s: %s", item.Role, item.Content))
	}

	displayMode := strings.TrimSpace(input.DisplayMode)
	if displayMode == "" {
		displayMode = "summary"
	}

	prompt := strings.Join([]string{
		"你是桌面数据库客户端里的 AI 助手。你要基于真实数据库上下文帮助用户操作当前数据库。",
		"请只输出 JSON，不要 markdown，不要额外解释。",
		"如果用户表达清楚且是安全查询（SELECT/SHOW/DESC/EXPLAIN），mode 输出 query，并给出 sql。",
		"如果用户表达不够清楚，mode 输出 ask，只追问一个最关键的问题，sql 留空。",
		"如果用户要执行 UPDATE/DELETE/INSERT/ALTER/DROP/TRUNCATE 等敏感操作，mode 输出 confirm，给出 sql 和风险说明，不要直接执行。",
		"不得编造不存在的表或字段，只能基于提供的结构上下文。",
		"displayMode 只能是 summary 或 table。用户要明细/列表/表格时优先 table，否则 summary。",
		"输出格式：{\"mode\":\"ask|query|confirm\",\"reply\":\"给用户看的中文说明\",\"sql\":\"SQL 或空字符串\",\"displayMode\":\"summary|table\",\"reasoning\":\"内部推理摘要\"}",
		"",
		"当前数据库上下文：",
		schemaContext,
		"",
		"最近对话：",
		strings.Join(historyContext, "\n"),
		"",
		fmt.Sprintf("用户期望的结果展示模式：%s", displayMode),
		"用户当前输入：",
		message,
	}, "\n")

	content, err := callChatCompletion(baseURL, modelName, apiKey, prompt)
	if err != nil {
		return ChatDatabaseResponse{}, err
	}

	return parseChatDatabaseResponse(content, displayMode)
}

func (s *Service) RepairChatSQL(input ChatRepairRequest) (ChatDatabaseResponse, error) {
	message := strings.TrimSpace(input.Message)
	attemptedSQL := strings.TrimSpace(input.AttemptedSQL)
	errorMessage := strings.TrimSpace(input.ErrorMessage)
	if message == "" || attemptedSQL == "" || errorMessage == "" {
		return ChatDatabaseResponse{}, errors.New("修正 SQL 时缺少必要上下文")
	}

	record, err := s.getConnectionRecord(input.ConnectionID)
	if err != nil {
		return ChatDatabaseResponse{}, err
	}

	state, err := s.store.LoadConfig()
	if err != nil {
		return ChatDatabaseResponse{}, err
	}

	baseURL, modelName, apiKey := resolveAIConfig(state.AI)
	if strings.TrimSpace(apiKey) == "" {
		return ChatDatabaseResponse{}, errors.New("尚未配置 AI API Key")
	}

	displayMode := strings.TrimSpace(input.DisplayMode)
	if displayMode == "" {
		displayMode = "summary"
	}

	schemaContext := s.buildChatRepairSchemaContext(record, strings.TrimSpace(input.Database), strings.TrimSpace(input.SelectedTable), message, attemptedSQL)
	historyContext := make([]string, 0, len(input.History))
	for _, item := range input.History {
		if strings.TrimSpace(item.Content) == "" {
			continue
		}
		historyContext = append(historyContext, fmt.Sprintf("%s: %s", item.Role, item.Content))
	}

	prompt := strings.Join([]string{
		"你是数据库客户端里的 SQL 修复助手。你必须根据真实报错和真实表字段继续推理，不要在第一次报错后放弃。",
		"你的任务是：1. 分析为什么 SQL 失败；2. 根据当前数据库中的真实表字段，推断用户真正想查的字段；3. 给出更合理的 SQL。",
		"如果报错是 Unknown column，请优先检查是否把 id 写成 uid、name 写成 username/nickname/real_name/title 等语义相近字段。",
		"绝对不能编造不存在的字段或表，只能从给定结构中选择。",
		"如果仍然无法确定，mode 输出 ask，只追问一个最关键的问题。",
		"如果修复后的 SQL 是 SELECT/SHOW/DESC/EXPLAIN 等安全查询，mode 输出 query。",
		"如果修复后的 SQL 是 UPDATE/DELETE/INSERT/ALTER/DROP/TRUNCATE 等敏感操作，mode 输出 confirm，不要直接执行。",
		"reply 用中文告诉用户你为什么调整了字段或条件，reasoning 用更短的中文总结推理过程。",
		"只输出 JSON，不要 markdown。输出格式：{\"mode\":\"ask|query|confirm\",\"reply\":\"...\",\"sql\":\"...\",\"displayMode\":\"summary|table\",\"reasoning\":\"...\"}",
		"",
		"当前数据库结构：",
		schemaContext,
		"",
		"最近对话：",
		strings.Join(historyContext, "\n"),
		"",
		"用户原始需求：",
		message,
		"",
		"上一次尝试执行的 SQL：",
		attemptedSQL,
		"",
		"执行报错：",
		errorMessage,
		"",
		"上一轮说明：",
		strings.TrimSpace(input.PreviousReason),
		"",
		fmt.Sprintf("默认结果展示模式：%s", displayMode),
	}, "\n")

	content, err := callChatCompletion(baseURL, modelName, apiKey, prompt)
	if err != nil {
		return ChatDatabaseResponse{}, err
	}

	return parseChatDatabaseResponse(content, displayMode)
}

func (s *Service) SummarizeChatResult(input ChatResultSummaryRequest) (ChatResultSummary, error) {
	if strings.TrimSpace(input.UserMessage) == "" || strings.TrimSpace(input.SQL) == "" {
		return ChatResultSummary{}, errors.New("总结查询结果时缺少上下文")
	}

	state, err := s.store.LoadConfig()
	if err != nil {
		return ChatResultSummary{}, err
	}

	baseURL, modelName, apiKey := resolveAIConfig(state.AI)
	if strings.TrimSpace(apiKey) == "" {
		return ChatResultSummary{}, errors.New("尚未配置 AI API Key")
	}

	historyContext := make([]string, 0, len(input.History))
	for _, item := range input.History {
		if strings.TrimSpace(item.Content) == "" {
			continue
		}
		historyContext = append(historyContext, fmt.Sprintf("%s: %s", item.Role, item.Content))
	}

	rowsPreview := input.Result.Rows
	if len(rowsPreview) > 8 {
		rowsPreview = rowsPreview[:8]
	}

	payload, err := json.Marshal(struct {
		StatementType string              `json:"statementType"`
		Columns       []string            `json:"columns"`
		Rows          []map[string]string `json:"rows"`
		RowCount      int                 `json:"rowCount"`
		AffectedRows  int64               `json:"affectedRows"`
		DurationMS    int64               `json:"durationMs"`
	}{
		StatementType: input.Result.StatementType,
		Columns:       input.Result.Columns,
		Rows:          rowsPreview,
		RowCount:      len(input.Result.Rows),
		AffectedRows:  input.Result.AffectedRows,
		DurationMS:    input.Result.DurationMS,
	})
	if err != nil {
		return ChatResultSummary{}, err
	}

	prompt := strings.Join([]string{
		"你是数据库客户端中的结果总结助手。",
		"请根据用户问题、执行 SQL、查询结果，用中文给出自然、直接、可读的结果总结。",
		"如果结果为空，要明确告诉用户未查到匹配数据，并结合 SQL 条件说明可能原因。",
		"如果结果只有一条，优先直接回答用户问题，不要只说返回了几行。",
		"如果结果有多条，先概括，再点出最重要的字段值。",
		"不要输出 markdown，不要输出标题，不要重复贴 SQL。",
		"",
		fmt.Sprintf("当前数据库：%s", input.Database),
		"用户问题：",
		input.UserMessage,
		"",
		"模型在执行前的判断：",
		strings.TrimSpace(input.Reasoning),
		"",
		"最近对话：",
		strings.Join(historyContext, "\n"),
		"",
		"执行 SQL：",
		input.SQL,
		"",
		"查询结果 JSON：",
		string(payload),
	}, "\n")

	content, err := callChatCompletion(baseURL, modelName, apiKey, prompt)
	if err != nil {
		return ChatResultSummary{}, err
	}

	return ChatResultSummary{
		Summary: strings.TrimSpace(content),
	}, nil
}

func resolveAIConfig(savedAI store.AIState) (string, string, string) {
	defaults := config.LoadAISettings()

	return firstNonEmpty(savedAI.BaseURL, defaults.BaseURL),
		firstNonEmpty(savedAI.ModelName, defaults.ModelName),
		firstNonEmpty(savedAI.APIKey, strings.TrimSpace(os.Getenv("LLM_API_KEY")))
}

func callChatCompletion(baseURL string, modelName string, apiKey string, prompt string) (string, error) {
	payload := map[string]any{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "你是严谨的数据库助手。"},
			{"role": "user", "content": prompt},
		},
		"temperature": 0.2,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	endpoint := strings.TrimRight(strings.TrimSpace(baseURL), "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("AI 请求失败：%s", resp.Status)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) == 0 {
		return "", errors.New("AI 未返回结果")
	}

	return result.Choices[0].Message.Content, nil
}

func parseChatDatabaseResponse(content string, fallbackDisplayMode string) (ChatDatabaseResponse, error) {
	var parsed struct {
		Mode        string `json:"mode"`
		Reply       string `json:"reply"`
		SQL         string `json:"sql"`
		DisplayMode string `json:"displayMode"`
		Reasoning   string `json:"reasoning"`
	}
	if err := json.Unmarshal([]byte(extractJSONBlock(content)), &parsed); err != nil {
		return ChatDatabaseResponse{}, fmt.Errorf("AI 返回格式无法识别：%w", err)
	}

	mode := strings.ToLower(strings.TrimSpace(parsed.Mode))
	if mode == "" {
		mode = "ask"
	}
	sqlText := strings.TrimSpace(parsed.SQL)
	analysis := analyzeSQL(sqlText)
	requiresConfirm := mode == "confirm" || analysis.RequiresConfirm
	responseDisplayMode := strings.TrimSpace(parsed.DisplayMode)
	if responseDisplayMode == "" {
		responseDisplayMode = fallbackDisplayMode
	}

	return ChatDatabaseResponse{
		Mode:            mode,
		Reply:           strings.TrimSpace(parsed.Reply),
		SQL:             sqlText,
		Analysis:        analysis,
		DisplayMode:     responseDisplayMode,
		RequiresConfirm: requiresConfirm,
		Reasoning:       strings.TrimSpace(parsed.Reasoning),
	}, nil
}

func extractJSONBlock(content string) string {
	trimmed := strings.TrimSpace(content)
	if strings.HasPrefix(trimmed, "{") && strings.HasSuffix(trimmed, "}") {
		return trimmed
	}

	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start >= 0 && end > start {
		return strings.TrimSpace(trimmed[start : end+1])
	}

	return trimmed
}

func (s *Service) buildChatSchemaContext(record store.ConnectionRecord, databaseName string, selectedTable string, message string) string {
	tree, err := s.getExplorerTreeByRecord(record, databaseName)
	if err != nil || len(tree.Databases) == 0 {
		return "当前无法读取数据库结构，请优先使用连接信息。"
	}

	activeDatabase := chooseActiveDatabase(databaseName, record.Database, extractDatabaseNames(tree.Databases))
	currentDatabase := tree.Databases[0]
	for _, item := range tree.Databases {
		if item.Name == activeDatabase {
			currentDatabase = item
			break
		}
	}

	builder := strings.Builder{}
	builder.WriteString(fmt.Sprintf("连接：%s\n", record.Name))
	builder.WriteString(fmt.Sprintf("数据库：%s\n", currentDatabase.Name))
	builder.WriteString("当前数据库中的表：\n")

	limit := minInt(len(currentDatabase.Tables), 24)
	for index, table := range currentDatabase.Tables[:limit] {
		builder.WriteString(fmt.Sprintf("%d. %s", index+1, table.Name))
		if strings.TrimSpace(table.Comment) != "" {
			builder.WriteString(fmt.Sprintf("（%s）", table.Comment))
		}
		builder.WriteString("\n")
	}

	interestingTables := []string{}
	if strings.TrimSpace(selectedTable) != "" {
		for _, item := range strings.Split(selectedTable, ",") {
			trimmed := strings.TrimSpace(item)
			if trimmed != "" {
				interestingTables = appendUniqueTable(interestingTables, trimmed)
			}
		}
	}

	lowerMessage := strings.ToLower(message)
	for _, table := range currentDatabase.Tables {
		if len(interestingTables) >= 3 {
			break
		}
		if strings.Contains(lowerMessage, strings.ToLower(table.Name)) {
			interestingTables = appendUniqueTable(interestingTables, table.Name)
		}
	}

	for _, tableName := range interestingTables {
		detail, err := s.getTableDetailByRecord(record, currentDatabase.Name, tableName)
		if err != nil {
			continue
		}
		builder.WriteString(fmt.Sprintf("\n表 %s 字段：\n", tableName))
		for _, field := range detail.Fields {
			builder.WriteString(fmt.Sprintf("- %s %s", field.Name, field.Type))
			if strings.TrimSpace(field.Comment) != "" {
				builder.WriteString(fmt.Sprintf("（%s）", field.Comment))
			}
			if field.Primary {
				builder.WriteString(" [主键]")
			}
			builder.WriteString("\n")
		}
	}

	return builder.String()
}

func (s *Service) buildChatRepairSchemaContext(record store.ConnectionRecord, databaseName string, selectedTable string, message string, attemptedSQL string) string {
	tree, err := s.getExplorerTreeByRecord(record, databaseName)
	if err != nil || len(tree.Databases) == 0 {
		return "当前无法读取数据库结构，请优先依据已有报错继续谨慎推断。"
	}

	activeDatabase := chooseActiveDatabase(databaseName, record.Database, extractDatabaseNames(tree.Databases))
	currentDatabase := tree.Databases[0]
	for _, item := range tree.Databases {
		if item.Name == activeDatabase {
			currentDatabase = item
			break
		}
	}

	builder := strings.Builder{}
	builder.WriteString(fmt.Sprintf("连接：%s\n", record.Name))
	builder.WriteString(fmt.Sprintf("数据库：%s\n", currentDatabase.Name))

	candidates := []string{}
	if strings.TrimSpace(selectedTable) != "" {
		for _, item := range strings.Split(selectedTable, ",") {
			trimmed := strings.TrimSpace(item)
			if trimmed != "" {
				candidates = appendUniqueTable(candidates, trimmed)
			}
		}
	}
	for _, tableName := range extractTableNamesFromSQL(attemptedSQL) {
		candidates = appendUniqueTable(candidates, tableName)
	}
	lowerMessage := strings.ToLower(message)
	for _, table := range currentDatabase.Tables {
		if len(candidates) >= 4 {
			break
		}
		if strings.Contains(lowerMessage, strings.ToLower(table.Name)) {
			candidates = appendUniqueTable(candidates, table.Name)
		}
	}

	if len(candidates) == 0 {
		builder.WriteString("候选表：未显式定位到单表，以下是当前数据库中的部分表：\n")
		limit := minInt(len(currentDatabase.Tables), 20)
		for _, table := range currentDatabase.Tables[:limit] {
			builder.WriteString(fmt.Sprintf("- %s\n", table.Name))
		}
		return builder.String()
	}

	for _, tableName := range candidates {
		detail, err := s.getTableDetailByRecord(record, currentDatabase.Name, tableName)
		if err != nil {
			continue
		}
		builder.WriteString(fmt.Sprintf("\n表 %s 结构：\n", tableName))
		for _, field := range detail.Fields {
			builder.WriteString(fmt.Sprintf("- %s %s", field.Name, field.Type))
			if strings.TrimSpace(field.Comment) != "" {
				builder.WriteString(fmt.Sprintf("（%s）", field.Comment))
			}
			if field.Primary {
				builder.WriteString(" [主键]")
			}
			builder.WriteString("\n")
		}
	}

	return builder.String()
}

func extractDatabaseNames(items []DatabaseNode) []string {
	result := make([]string, 0, len(items))
	for _, item := range items {
		result = append(result, item.Name)
	}
	return result
}

func appendUniqueTable(items []string, value string) []string {
	for _, item := range items {
		if item == value {
			return items
		}
	}
	return append(items, value)
}

func extractTableNamesFromSQL(sql string) []string {
	re := regexp.MustCompile(`(?i)\b(?:from|join|update|into|table)\s+` + "`?" + `([a-zA-Z0-9_]+)` + "`?")
	matches := re.FindAllStringSubmatch(sql, -1)
	result := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) > 1 {
			result = appendUniqueTable(result, match[1])
		}
	}
	return result
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

func formatSQLText(input string) string {
	output := strings.ReplaceAll(strings.TrimSpace(input), "\r\n", "\n")
	keywords := []string{
		"SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "LIMIT", "INSERT INTO", "VALUES",
		"UPDATE", "SET", "DELETE FROM", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "JOIN", "ON", "AND", "OR",
	}

	for _, keyword := range keywords {
		pattern := strings.ReplaceAll(keyword, " ", "\\s+")
		re := regexp.MustCompile("(?i)\\b" + pattern + "\\b")
		output = re.ReplaceAllString(output, keyword)
	}

	lineBreakKeywords := []string{"SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "LIMIT", "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "JOIN", "ON"}
	for _, keyword := range lineBreakKeywords {
		pattern := strings.ReplaceAll(keyword, " ", `\s+`)
		re := regexp.MustCompile(`(?i)\b` + pattern + `\b`)
		output = re.ReplaceAllString(output, "\n"+keyword)
	}

	output = strings.ReplaceAll(output, "\nAND", "\n  AND")
	output = strings.ReplaceAll(output, "\nOR", "\n  OR")
	output = strings.ReplaceAll(output, "\nON", "\n  ON")
	output = strings.TrimSpace(output)
	if !strings.HasSuffix(output, ";") {
		output += ";"
	}

	return output
}

func extractSQLText(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}

	trimmed = strings.TrimPrefix(trimmed, "```sql")
	trimmed = strings.TrimPrefix(trimmed, "```SQL")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	trimmed = strings.TrimSpace(trimmed)

	start := regexp.MustCompile(`(?is)\b(select|with|insert|update|delete|show|desc|describe|explain|alter|create|drop|truncate|rename)\b`).FindStringIndex(trimmed)
	if start != nil {
		trimmed = trimmed[start[0]:]
	}

	return strings.TrimSpace(trimmed)
}
