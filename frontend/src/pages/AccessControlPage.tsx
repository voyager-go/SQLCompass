import { useState, useCallback } from "react";
import { GetDatabaseUsers } from "../../wailsjs/go/main/App";
import type { DatabaseUsersResult, DatabaseUser } from "../types/runtime";

type NoticeTone = "success" | "error" | "info";

interface AccessControlPageProps {
    selectedConnection: { id: string; engine: string } | null;
    selectedDatabase: string;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
}

export function AccessControlPage({ selectedConnection, selectedDatabase, pushToast }: AccessControlPageProps) {
    const [result, setResult] = useState<DatabaseUsersResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        if (!selectedConnection) {
            pushToast("error", "未选择连接", "请先选择一个数据库连接");
            return;
        }
        setLoading(true);
        try {
            const res = (await GetDatabaseUsers({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
            })) as DatabaseUsersResult;
            setResult(res);
            if (!res.supported) {
                pushToast("info", "不支持", res.message || "当前引擎不支持用户管理");
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "查询失败";
            pushToast("error", "查询失败", msg);
        } finally {
            setLoading(false);
        }
    }, [selectedConnection, selectedDatabase, pushToast]);

    function toggleExpand(name: string, host: string) {
        const key = `${name}@${host}`;
        setExpandedUser((prev) => (prev === key ? null : key));
    }

    return (
        <section className="page-panel">
            <div className="page-headline">
                <div>
                    <h2>用户权限</h2>
                    <p>数据库用户与访问控制管理</p>
                </div>
                <div className="toolbar-actions toolbar-actions--end">
                    <button
                        type="button"
                        className="primary-button"
                        onClick={fetchUsers}
                        disabled={!selectedConnection || loading}
                    >
                        {loading ? "查询中..." : "查询用户"}
                    </button>
                </div>
            </div>

            {result && !result.supported ? (
                <div className="notice-banner notice-banner--info">
                    <span className="notice-banner__icon">i</span>
                    <span className="notice-banner__text">{result.message || "当前引擎不支持用户管理"}</span>
                </div>
            ) : null}

            {result && result.supported ? (
                result.users.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {result.users.map((user: DatabaseUser) => {
                            const key = `${user.name}@${user.host}`;
                            const isExpanded = expandedUser === key;
                            return (
                                <div key={key} className="access-user-card">
                                    <div
                                        className="access-user-card__header"
                                        onClick={() => toggleExpand(user.name, user.host)}
                                        style={{ cursor: "pointer" }}
                                    >
                                        <div className="access-user-card__info">
                                            <strong>{user.name}</strong>
                                            <span className="access-user-card__host">@{user.host}</span>
                                        </div>
                                        <span className="access-user-card__toggle">{isExpanded ? "▴" : "▾"}</span>
                                    </div>
                                    {isExpanded ? (
                                        <div className="access-user-card__grants">
                                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                                                权限列表
                                            </div>
                                            <div className="code-block code-block--wide" style={{ fontSize: 12 }}>
                                                <pre>{user.grants || "无权限信息"}</pre>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="empty-block">暂无用户数据</div>
                )
            ) : !loading ? (
                <div className="empty-block">点击"查询用户"获取数据库用户列表</div>
            ) : (
                <div className="empty-block">加载中...</div>
            )}
        </section>
    );
}
