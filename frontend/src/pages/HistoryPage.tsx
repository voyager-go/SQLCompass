import { formatDateTime, copyText } from "../lib/utils";
import type { ConnectionProfile } from "../types/workspace";
import type { HistoryItem } from "../types/runtime";

type NoticeTone = "success" | "error" | "info";
type WorkbenchPage = "connections" | "query" | "history" | "schema" | "transfer" | "ai" | "theme" | "settings";
type Notice = { tone: NoticeTone; message: string };

interface HistoryPageProps {
    selectedConnection: ConnectionProfile | null;
    historyItems: HistoryItem[];
    setHistoryItems: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
    historyPage: number;
    setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
    setSQLText: (v: string) => void;
    setPreviewContext: (v: { connectionId: string; database: string; table: string } | null) => void;
    handleSelectDatabase: (db: string) => void;
    setExpandedDatabases: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    setSelectedTable: (v: string) => void;
    setActivePage: (v: WorkbenchPage) => void;
    setSidebarView: (v: "database" | "workbench") => void;
    setQueryNotice: (v: Notice | null) => void;
}

const historyPageSize = 20;

export function HistoryPage({
    selectedConnection,
    historyItems,
    setHistoryItems,
    historyPage,
    setHistoryPage,
    pushToast,
    setSQLText,
    setPreviewContext,
    handleSelectDatabase,
    setExpandedDatabases,
    setSelectedTable,
    setActivePage,
    setSidebarView,
    setQueryNotice,
}: HistoryPageProps) {
    const handleClearHistory = () => {
        if (!selectedConnection) return;
        setHistoryItems([]);
        setHistoryPage(1);
        pushToast("success", "历史已清空", "查询历史记录已清空");
    };

    const totalHistory = historyItems.length;
    const totalHistoryPages = Math.max(1, Math.ceil(totalHistory / historyPageSize));
    const currentHistoryPage = Math.min(historyPage, totalHistoryPages) || 1;
    const pagedHistoryItems = historyItems.slice(
        (currentHistoryPage - 1) * historyPageSize,
        currentHistoryPage * historyPageSize,
    );

    return (
        <section className="page-panel">
            <div className="history-header">
                {selectedConnection && (
                    <span className="history-count">共 {totalHistory} 条记录</span>
                )}
                {selectedConnection && historyItems.length > 0 && (
                    <button type="button" className="ghost-button text-button--danger" onClick={handleClearHistory}>
                        清空历史
                    </button>
                )}
            </div>

            <div className="history-stream-single">
                {historyItems.length === 0 ? (
                    <div className="empty-block">{selectedConnection ? "当前连接下还没有历史 SQL。" : "请先选择连接"}</div>
                ) : (
                    pagedHistoryItems.map((item) => (
                        <div key={item.id} className="history-item-row">
                            <div className="history-item-main">
                                <div className="history-item__head">
                                    <span className="status-chip">{item.statementType}</span>
                                    <span className={`risk-pill risk-pill--${item.riskLevel === "critical" ? "danger" : item.riskLevel === "high" ? "warn" : "safe"}`}>{item.riskLevel}</span>
                                </div>
                                <code className="history-item__sql">{item.statement}</code>
                                <div className="history-item__meta">
                                    <span>{item.database || "未指定库"}</span>
                                    <span>{item.rowCount} 行</span>
                                    <span>{item.durationMs} ms</span>
                                    <span>{formatDateTime(item.createdAt)}</span>
                                </div>
                            </div>
                            <div className="history-item-actions">
                                <button
                                    type="button"
                                    className="mini-ghost-button"
                                    onClick={() => {
                                        const stmt = item.statement;
                                        let tableName = "";
                                        const fromMatch = stmt.match(/\bFROM\s+`?(\w+)`?\b/i);
                                        const intoMatch = stmt.match(/\bINTO\s+`?(\w+)`?\b/i);
                                        const updateMatch = stmt.match(/\bUPDATE\s+`?(\w+)`?\b/i);
                                        const joinMatch = stmt.match(/\b(?:JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN)\s+`?(\w+)`?\b/i);
                                        tableName = fromMatch?.[1] || intoMatch?.[1] || updateMatch?.[1] || joinMatch?.[1] || "";

                                        setSQLText(stmt);
                                        setPreviewContext(null);

                                        if (item.database) {
                                            handleSelectDatabase(item.database);
                                            setExpandedDatabases((prev) => ({
                                                ...prev,
                                                [item.database]: true,
                                            }));
                                            if (tableName) {
                                                setTimeout(() => setSelectedTable(tableName), 100);
                                            }
                                        }
                                        setActivePage("query");
                                        setSidebarView("database");
                                        setQueryNotice({ tone: "info", message: `历史 SQL 已回填到编辑器${item.database ? `，已切换至 ${item.database}` : ""}${tableName ? `，表 ${tableName} 已定位` : ""}。` });
                                    }}
                                >
                                    回填编辑器
                                </button>
                                <button
                                    type="button"
                                    className="mini-ghost-button"
                                    onClick={() => {
                                        copyText(item.statement)
                                            .then(() => pushToast("success", "已复制 SQL", "完整语句已复制到剪贴板"))
                                            .catch(() => pushToast("error", "复制失败", "请稍后重试"));
                                    }}
                                >
                                    复制 SQL
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {totalHistoryPages > 1 && (
                <div className="history-pagination">
                    <button
                        type="button"
                        className="mini-ghost-button"
                        disabled={currentHistoryPage <= 1}
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    >
                        上一页
                    </button>
                    <span className="pagination-info">
                        {currentHistoryPage} / {totalHistoryPages}
                    </span>
                    <button
                        type="button"
                        className="mini-ghost-button"
                        disabled={currentHistoryPage >= totalHistoryPages}
                        onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                    >
                        下一页
                    </button>
                </div>
            )}
        </section>
    );
}
