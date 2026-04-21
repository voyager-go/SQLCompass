package workspace

import (
	"strings"
)

func analyzeSQL(statement string) SQLAnalysis {
	trimmed := strings.TrimSpace(statement)
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

	return analysis
}

func (s *Service) AnalyzeSQL(statement string) SQLAnalysis {
	return analyzeSQL(statement)
}
