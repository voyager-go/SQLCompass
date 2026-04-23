import { useState, useCallback, useEffect, useMemo } from "react";
import { GetPerformanceMetrics } from "../../wailsjs/go/main/App";
import type { PerformanceResult } from "../types/runtime";

type NoticeTone = "success" | "error" | "info";

interface PerformancePageProps {
    selectedConnection: { id: string; engine: string } | null;
    selectedDatabase: string;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
}

interface MetricTab {
    key: string;
    label: string;
    icon: string;
    description: string;
}

const ENGINE_METRICS: Record<string, MetricTab[]> = {
    mysql: [
        { key: "slow_queries", label: "慢查询", icon: "⏱", description: "慢查询日志" },
        { key: "status", label: "状态变量", icon: "📊", description: "全局状态变量" },
        { key: "variables", label: "系统变量", icon: "⚙", description: "全局系统变量" },
        { key: "processlist", label: "进程列表", icon: "👥", description: "当前连接进程" },
        { key: "innodb_status", label: "InnoDB", icon: "🔄", description: "InnoDB 引擎状态" },
    ],
    mariadb: [
        { key: "slow_queries", label: "慢查询", icon: "⏱", description: "慢查询日志" },
        { key: "status", label: "状态变量", icon: "📊", description: "全局状态变量" },
        { key: "variables", label: "系统变量", icon: "⚙", description: "全局系统变量" },
        { key: "processlist", label: "进程列表", icon: "👥", description: "当前连接进程" },
        { key: "innodb_status", label: "InnoDB", icon: "🔄", description: "InnoDB 引擎状态" },
    ],
    postgresql: [
        { key: "slow_queries", label: "慢查询", icon: "⏱", description: "pg_stat_statements" },
        { key: "activity", label: "活动连接", icon: "👥", description: "pg_stat_activity" },
        { key: "settings", label: "配置参数", icon: "⚙", description: "pg_settings" },
    ],
    clickhouse: [
        { key: "slow_queries", label: "查询日志", icon: "⏱", description: "system.query_log" },
        { key: "metrics", label: "系统指标", icon: "📊", description: "system.metrics" },
    ],
};

const DEFAULT_TABS: MetricTab[] = [
    { key: "slow_queries", label: "慢查询", icon: "⏱", description: "查询性能指标" },
];

export function PerformancePage({ selectedConnection, selectedDatabase, pushToast }: PerformancePageProps) {
    const engine = selectedConnection?.engine ?? "mysql";
    const tabs = useMemo(() => ENGINE_METRICS[engine] ?? DEFAULT_TABS, [engine]);

    const [activeTab, setActiveTab] = useState<string>(tabs[0]?.key ?? "slow_queries");
    const [result, setResult] = useState<PerformanceResult | null>(null);
    const [loading, setLoading] = useState(false);

    // Reset active tab when engine changes
    useEffect(() => {
        const newDefault = tabs[0]?.key ?? "slow_queries";
        if (!tabs.find((t) => t.key === activeTab)) {
            setActiveTab(newDefault);
        }
    }, [tabs, activeTab]);

    const fetchMetrics = useCallback(
        async (metricType: string) => {
            if (!selectedConnection) {
                pushToast("error", "未选择连接", "请先选择一个数据库连接");
                return;
            }
            setLoading(true);
            setResult(null);
            try {
                const res = (await GetPerformanceMetrics({
                    connectionId: selectedConnection.id,
                    database: selectedDatabase,
                    metricType,
                })) as PerformanceResult;
                setResult(res);
                if (!res.supported) {
                    pushToast("info", "不支持", res.message || "当前引擎不支持该指标");
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : "查询失败";
                pushToast("error", "查询失败", msg);
            } finally {
                setLoading(false);
            }
        },
        [selectedConnection, selectedDatabase, pushToast],
    );

    function handleTabChange(key: string) {
        setActiveTab(key);
        fetchMetrics(key);
    }

    const engineLabel = engine === "mariadb" ? "MariaDB" : engine === "postgresql" ? "PostgreSQL" : engine === "clickhouse" ? "ClickHouse" : engine === "mysql" ? "MySQL" : engine;

    return (
        <section className="page-panel">
            <div className="page-headline">
                <div>
                    <h2>性能监控</h2>
                    <p>慢查询与状态指标，实时洞察数据库运行状况</p>
                </div>
                {selectedConnection && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                            style={{
                                fontSize: 11.5,
                                fontWeight: 600,
                                padding: "3px 10px",
                                borderRadius: 6,
                                background: "var(--sidebar-surface-strong)",
                                color: "var(--sidebar-accent)",
                            }}
                        >
                            {engineLabel}
                        </span>
                    </div>
                )}
            </div>

            {!selectedConnection ? (
                <div className="empty-block" style={{ marginTop: 20 }}>
                    请先选择一个数据库连接以查看性能指标
                </div>
            ) : (
                <>
                    <div className="performance-tabs">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                className={`perf-tab${activeTab === tab.key ? " perf-tab--active" : ""}`}
                                onClick={() => handleTabChange(tab.key)}
                                disabled={loading}
                                title={tab.description}
                            >
                                <span style={{ marginRight: 4 }}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="empty-block" style={{ marginTop: 20 }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                                <div style={{ fontSize: 28, opacity: 0.5 }}>⏳</div>
                                <span>正在查询 {tabs.find((t) => t.key === activeTab)?.label ?? activeTab}...</span>
                            </div>
                        </div>
                    ) : result ? (
                        <div className="detail-card" style={{ marginTop: 20 }}>
                            {!result.supported ? (
                                <div className="notice-banner notice-banner--info">
                                    <span className="notice-banner__icon">i</span>
                                    <span className="notice-banner__text">{result.message || "当前引擎不支持该指标"}</span>
                                </div>
                            ) : result.columns.length > 0 ? (
                                <div className="schema-table-shell">
                                    <table className="schema-table">
                                        <thead>
                                            <tr>
                                                {result.columns.map((col) => (
                                                    <th key={col}>{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.rows.map((row, idx) => (
                                                <tr key={idx}>
                                                    {result.columns.map((col) => (
                                                        <td key={col} title={row[col] ?? ""}>
                                                            <div className="result-cell">{row[col] ?? ""}</div>
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="empty-block">暂无数据</div>
                            )}
                            {result.supported && result.rows.length > 0 && (
                                <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>
                                    {result.message}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="empty-block" style={{ marginTop: 20 }}>
                            选择一个指标标签页开始查询
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
