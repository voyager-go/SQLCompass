package workspace

import (
	"strings"
)

// stripSQLComments removes SQL comments from a statement while preserving string literals.
func stripSQLComments(sql string) string {
	var result strings.Builder
	i := 0
	inString := false
	stringChar := byte(0)

	for i < len(sql) {
		if inString {
			result.WriteByte(sql[i])
			if sql[i] == stringChar && (i == 0 || sql[i-1] != '\\') {
				inString = false
			}
			i++
			continue
		}

		if sql[i] == '\'' || sql[i] == '"' {
			inString = true
			stringChar = sql[i]
			result.WriteByte(sql[i])
			i++
			continue
		}

		if i+1 < len(sql) && sql[i] == '-' && sql[i+1] == '-' {
			for i < len(sql) && sql[i] != '\n' {
				i++
			}
			continue
		}

		if i+1 < len(sql) && sql[i] == '/' && sql[i+1] == '*' {
			i += 2
			for i+1 < len(sql) && !(sql[i] == '*' && sql[i+1] == '/') {
				i++
			}
			if i+1 < len(sql) {
				i += 2
			}
			result.WriteByte(' ')
			continue
		}

		result.WriteByte(sql[i])
		i++
	}

	return result.String()
}

// containsMultiStatement checks if there are semicolons outside string literals.
func containsMultiStatement(normalized string) bool {
	semicolons := 0
	inString := false
	for _, ch := range normalized {
		if ch == '\'' {
			inString = !inString
		}
		if ch == ';' && !inString {
			semicolons++
		}
	}
	return semicolons > 0
}

func analyzeSQL(statement string) SQLAnalysis {
	cleaned := stripSQLComments(statement)
	trimmed := strings.TrimSpace(cleaned)
	upper := strings.ToUpper(trimmed)
	normalized := strings.Join(strings.Fields(upper), " ")

	analysis := SQLAnalysis{
		StatementType: "UNKNOWN",
		RiskLevel:     "low",
		Summary:       []string{},
		Warnings:      []string{},
	}

	switch {
	case strings.HasPrefix(normalized, "SELECT"), strings.HasPrefix(normalized, "WITH"):
		analysis.StatementType = "SELECT"
		analysis.Summary = append(analysis.Summary, "读取数据")
	case strings.HasPrefix(normalized, "SHOW"), strings.HasPrefix(normalized, "DESC"), strings.HasPrefix(normalized, "DESCRIBE"), strings.HasPrefix(normalized, "EXPLAIN"):
		analysis.StatementType = "META"
		analysis.Summary = append(analysis.Summary, "查看结构或执行计划")
	case strings.HasPrefix(normalized, "UPDATE"):
		analysis.StatementType = "UPDATE"
		analysis.Summary = append(analysis.Summary, "更新现有数据")
		analysis.RiskLevel = "high"
		analysis.RequiresConfirm = true
	case strings.HasPrefix(normalized, "DELETE"):
		analysis.StatementType = "DELETE"
		analysis.Summary = append(analysis.Summary, "删除现有数据")
		analysis.RiskLevel = "high"
		analysis.RequiresConfirm = true
	case strings.HasPrefix(normalized, "INSERT"), strings.HasPrefix(normalized, "REPLACE"):
		analysis.StatementType = "INSERT"
		analysis.Summary = append(analysis.Summary, "写入新数据")
		analysis.RiskLevel = "medium"
	case strings.HasPrefix(normalized, "ALTER"):
		analysis.StatementType = "ALTER"
		analysis.Summary = append(analysis.Summary, "修改表结构")
		analysis.RiskLevel = "high"
		analysis.RequiresConfirm = true
	case strings.HasPrefix(normalized, "DROP"), strings.HasPrefix(normalized, "TRUNCATE"):
		analysis.StatementType = "DDL"
		analysis.Summary = append(analysis.Summary, "删除对象或清空表")
		analysis.RiskLevel = "critical"
		analysis.RequiresConfirm = true
	case strings.HasPrefix(normalized, "CREATE"), strings.HasPrefix(normalized, "RENAME"):
		analysis.StatementType = "DDL"
		analysis.Summary = append(analysis.Summary, "创建或重命名数据库对象")
		analysis.RiskLevel = "medium"
	default:
		analysis.Summary = append(analysis.Summary, "未识别语句类型")
	}

	if analysis.StatementType == "UPDATE" || analysis.StatementType == "DELETE" {
		if !strings.Contains(normalized, " WHERE ") {
			analysis.Warnings = append(analysis.Warnings, "未检测到 WHERE 条件，可能影响整张表。")
			if analysis.RiskLevel != "critical" {
				analysis.RiskLevel = "critical"
			}
		}
	}

	if analysis.StatementType == "SELECT" && !strings.Contains(normalized, " LIMIT ") {
		analysis.Warnings = append(analysis.Warnings, "未检测到 LIMIT，系统会自动按每页 20 行分页展示。")
	}

	if analysis.StatementType == "ALTER" {
		analysis.Warnings = append(analysis.Warnings, "结构变更执行前应先核对 DDL 预览。")
	}

	if analysis.StatementType == "DDL" && strings.HasPrefix(normalized, "DROP") {
		analysis.Warnings = append(analysis.Warnings, "高风险删除操作，请确认对象名称和目标库。")
	}

	if containsMultiStatement(normalized) {
		analysis.Warnings = append(analysis.Warnings, "检测到多语句，可能存在注入风险。")
		if analysis.RiskLevel != "critical" {
			analysis.RiskLevel = "critical"
		}
		analysis.RequiresConfirm = true
	}

	return analysis
}

func (s *Service) AnalyzeSQL(statement string) SQLAnalysis {
	return analyzeSQL(statement)
}
