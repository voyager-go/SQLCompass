import { NoticeBanner } from "../components/NoticeBanner";
import { CopyableText } from "../components/CopyableText";
import { engineLabels, EngineIcon } from "../lib/engine";
import type { ConnectionInput, ConnectionProfile, ConnectionTestResult, WorkspaceState } from "../types/workspace";

type NoticeTone = "success" | "error" | "info";

function connectionTargetLabel(profile: ConnectionProfile): string {
    if (profile.engine === "sqlite") {
        return profile.filePath || "未选择文件";
    }
    if (profile.url) {
        return profile.url;
    }
    return `${profile.host}:${profile.port}`;
}

type UpdateConnectionField = <K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) => void;

interface ConnectionsPageProps {
    connectionNotice: { tone: NoticeTone; message: string } | null;
    workspaceState: WorkspaceState;
    selectedConnectionId: string;
    connectionDraft: ConnectionInput;
    setConnectionDraft: React.Dispatch<React.SetStateAction<ConnectionInput>>;
    showPassword: boolean;
    setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
    connectionTest: ConnectionTestResult | null;
    isTestingConnection: boolean;
    isSavingConnection: boolean;
    handleSelectConnection: (profile: ConnectionProfile) => void;
    fillConnectionDraft: (profile: ConnectionProfile) => void;
    handleDeleteConnection: (profile: ConnectionProfile) => Promise<void>;
    handleTestConnection: () => Promise<void>;
    handleSaveConnection: () => Promise<void>;
    resetConnectionForm: (engine?: string) => void;
    updateConnectionField: UpdateConnectionField;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
}

export function ConnectionsPage({
    connectionNotice,
    workspaceState,
    selectedConnectionId,
    connectionDraft,
    setConnectionDraft,
    showPassword,
    setShowPassword,
    connectionTest,
    isTestingConnection,
    isSavingConnection,
    handleSelectConnection,
    fillConnectionDraft,
    handleDeleteConnection,
    handleTestConnection,
    handleSaveConnection,
    resetConnectionForm,
    updateConnectionField,
    pushToast,
}: ConnectionsPageProps) {
    const isSQLite = connectionDraft.engine === "sqlite";

    return (
        <section className="page-panel">
            <NoticeBanner notice={connectionNotice} />

            <div className="connection-layout">
                <div className="connection-card">
                    <div className="section-title">
                        <h3>已保存连接</h3>
                        <span className="count-chip">{workspaceState.connections.length}</span>
                    </div>

                    <div className="connection-groups">
                        {workspaceState.connections.length === 0 ? <div className="empty-block">还没有连接，先创建一个。</div> : null}
                        {Array.from(
                            workspaceState.connections.reduce((groups, conn) => {
                                const groupName = conn.group || "默认分组";
                                if (!groups.has(groupName)) {
                                    groups.set(groupName, { name: groupName, color: conn.groupColor, connections: [] });
                                }
                                groups.get(groupName)!.connections.push(conn);
                                return groups;
                            }, new Map<string, { name: string; color: string; connections: ConnectionProfile[] }>()).values()
                        ).map((group) => (
                            <div key={group.name} className="connection-group-card" style={{ borderLeftColor: group.color || "#3b82f6" }}>
                                <div className="connection-group-header">
                                    <div className="connection-group-color" style={{ backgroundColor: group.color || "#3b82f6" }} />
                                    <span className="connection-group-name">{group.name}</span>
                                    <span className="connection-group-count">{group.connections.length} 个连接</span>
                                </div>
                                <div className="connection-group-list">
                                    {group.connections.map((profile) => (
                                        <div key={profile.id} className={`connection-card__item${profile.id === selectedConnectionId ? " connection-card__item--active" : ""}`}>
                                            <div
                                                className="connection-card__main"
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => handleSelectConnection(profile)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        handleSelectConnection(profile);
                                                    }
                                                }}
                                            >
                                                <div className="connection-card__title">
                                                    <div className="connection-name-row">
                                                        <span className="engine-icon" title={engineLabels[profile.engine] ?? profile.engine}>
                                                            <EngineIcon engine={profile.engine} size={18} />
                                                        </span>
                                                        <CopyableText
                                                            value={profile.name}
                                                            onCopied={(value) => pushToast(value ? "success" : "error", value ? "已复制连接名称" : "复制失败", value || "请重试")}
                                                        />
                                                    </div>
                                                </div>
                                                <span className="connection-card__target">{connectionTargetLabel(profile)}</span>
                                            </div>
                                            <div className="row-actions row-actions--icon">
                                                <button
                                                    type="button"
                                                    className="icon-btn icon-btn--edit"
                                                    onClick={() => fillConnectionDraft(profile)}
                                                    title="编辑"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="icon-btn icon-btn--delete"
                                                    onClick={() => handleDeleteConnection(profile)}
                                                    title="删除"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="connection-editor">
                    <div className="section-title section-title--with-actions">
                        <h3>{connectionDraft.id ? "编辑连接" : "新建连接"}</h3>
                        <div className="toolbar-actions toolbar-actions--compact">
                            <button
                                type="button"
                                className="ghost-button ghost-button--sm"
                                onClick={() => {
                                    resetConnectionForm("mysql");
                                    pushToast("info", "新建连接", "已重置为新的连接表单");
                                }}
                            >
                                新建
                            </button>
                            <button
                                type="button"
                                className="ghost-button ghost-button--sm"
                                onClick={() => {
                                    setConnectionDraft({
                                        id: "",
                                        name: "本地MYSQL",
                                        engine: "mysql",
                                        group: "默认分组",
                                        groupColor: "#3b82f6",
                                        host: "127.0.0.1",
                                        port: 3306,
                                        username: "root",
                                        password: "",
                                        database: "",
                                        url: "",
                                        filePath: "",
                                        notes: "",
                                    });
                                    pushToast("info", "快速填充", "已自动填充本地 MySQL 默认配置");
                                }}
                            >
                                快速
                            </button>
                            <button type="button" className="ghost-button ghost-button--sm" onClick={handleTestConnection} disabled={isTestingConnection}>
                                {isTestingConnection ? "测试中..." : "测试"}
                            </button>
                            <button type="button" className="primary-button primary-button--sm" onClick={handleSaveConnection} disabled={isSavingConnection}>
                                {isSavingConnection ? "保存中..." : "保存"}
                            </button>
                        </div>
                    </div>

                    <div className="form-grid">
                        <label className="field">
                            <span>连接名称</span>
                            <input value={connectionDraft.name} onChange={(event) => updateConnectionField("name", event.target.value)} placeholder="例如：Docker-ms" />
                        </label>
                        <label className="field field--engine">
                            <span>数据库类型</span>
                            <select value={connectionDraft.engine} onChange={(event) => updateConnectionField("engine", event.target.value)}>
                                {Object.entries(engineLabels).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="field">
                            <span>分组</span>
                            <div className="group-input-row">
                                <input
                                    list="group-suggestions"
                                    value={connectionDraft.group}
                                    onChange={(event) => updateConnectionField("group", event.target.value)}
                                    placeholder="例如：开发环境"
                                />
                                <datalist id="group-suggestions">
                                    {Array.from(new Set(workspaceState.connections.map((c) => c.group).filter(Boolean))).map((group) => (
                                        <option key={group} value={group} />
                                    ))}
                                </datalist>
                                <div className="color-picker-compact">
                                    {["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#6366f1"].slice(0, 6).map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            className={`color-dot${connectionDraft.groupColor === color ? " color-dot--active" : ""}`}
                                            style={{ backgroundColor: color }}
                                            onClick={() => updateConnectionField("groupColor", color)}
                                            title={color}
                                        />
                                    ))}
                                    <div className="color-custom-wrapper">
                                        <input
                                            type="color"
                                            value={connectionDraft.groupColor || "#3b82f6"}
                                            onChange={(event) => updateConnectionField("groupColor", event.target.value)}
                                            className="color-input-native"
                                            title="自定义颜色"
                                        />
                                        <span className="color-custom-icon">+</span>
                                    </div>
                                </div>
                            </div>
                        </label>

                        {!isSQLite ? (
                            <>
                                <label className="field">
                                    <span>主机地址</span>
                                    <input value={connectionDraft.host} onChange={(event) => updateConnectionField("host", event.target.value)} />
                                </label>
                                <label className="field">
                                    <span>端口</span>
                                    <input type="number" value={connectionDraft.port} onChange={(event) => updateConnectionField("port", Number(event.target.value))} />
                                </label>
                                <label className="field">
                                    <span>用户名</span>
                                    <input value={connectionDraft.username} onChange={(event) => updateConnectionField("username", event.target.value)} />
                                </label>
                                <label className="field field--password">
                                    <span>密码</span>
                                    <div className="password-input-wrap">
                                        <input type={showPassword ? "text" : "password"} value={connectionDraft.password} onChange={(event) => updateConnectionField("password", event.target.value)} />
                                        <button
                                            type="button"
                                            className="password-toggle-btn"
                                            onClick={() => setShowPassword((prev) => !prev)}
                                            title={showPassword ? "隐藏密码" : "显示密码"}
                                        >
                                            {showPassword ? (
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                    <circle cx="12" cy="12" r="3"></circle>
                                                    <path d="M3 3l18 18"></path>
                                                </svg>
                                            ) : (
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                    <circle cx="12" cy="12" r="3"></circle>
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </label>
                                <label className="field">
                                    <span>默认数据库</span>
                                    <input value={connectionDraft.database} onChange={(event) => updateConnectionField("database", event.target.value)} placeholder="可选，连接后默认进入" />
                                </label>
                                <label className="field">
                                    <span>连接 URL</span>
                                    <input value={connectionDraft.url} onChange={(event) => updateConnectionField("url", event.target.value)} placeholder="可选" />
                                </label>
                            </>
                        ) : (
                            <label className="field field--full">
                                <span>SQLite 文件</span>
                                <input value={connectionDraft.filePath} onChange={(event) => updateConnectionField("filePath", event.target.value)} />
                            </label>
                        )}

                        <label className="field field--full">
                            <span>备注</span>
                            <textarea value={connectionDraft.notes} onChange={(event) => updateConnectionField("notes", event.target.value)} rows={4} />
                        </label>
                    </div>

                    {connectionTest ? (
                        <div className={`status-strip${connectionTest.success ? " status-strip--success" : " status-strip--error"}`}>
                            <strong>{connectionTest.message}</strong>
                            <span>{connectionTest.detail}</span>
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
