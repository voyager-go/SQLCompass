import type { QueryResult, ChatEntry, ChatPendingAction, ChatDropPayload, ChatDisplayMode } from "../types/runtime";

interface ChatPageProps {
    selectedConnection: { name: string } | null;
    chatDisplayMode: ChatDisplayMode;
    setChatDisplayMode: (v: ChatDisplayMode) => void;
    chatStreamRef: React.RefObject<HTMLDivElement | null>;
    chatMessages: ChatEntry[];
    isRunningChat: boolean;
    handleCopyUserMessage: (item: ChatEntry) => void;
    handleEditUserMessage: (item: ChatEntry) => void;
    handleCopyText: (text: string, label?: string) => void;
    handleCopyChatResult: (item: ChatEntry) => Promise<void>;
    handleCopyChatMessage: (item: ChatEntry) => Promise<void>;
    chatPendingAction: ChatPendingAction | null;
    setChatPendingAction: (v: ChatPendingAction | null) => void;
    executeChatSQL: (statement: string, displayMode: ChatDisplayMode, replyPrefix?: string, userMessage?: string, previousReason?: string, repairAttempt?: number) => Promise<void>;
    isExecutingQuery: boolean;
    chatDropActive: boolean;
    setChatDropActive: (v: boolean) => void;
    chatContextDatabase: string;
    setChatContextDatabase: (v: string) => void;
    chatContextTables: string[];
    setChatContextTables: (v: string[] | ((prev: string[]) => string[])) => void;
    chatInput: string;
    setChatInput: (v: string | ((prev: string) => string)) => void;
    handleSendChatMessage: (rawMessage?: string) => Promise<void>;
    handleChatInputChange: (value: string, cursorPos?: number) => void;
    handleSlashSelect: (item: string) => void;
    handleChatDrop: (payload: ChatDropPayload) => void;
    slashMenuOpen: boolean;
    slashMenuItems: { key: string; label: string; desc: string; tone: "command" | "database" | "table" }[];
    slashMenuTotalPages: number;
    slashMenuPageSafe: number;
    pagedSlashMenuItems: { key: string; label: string; desc: string; tone: "command" | "database" | "table" }[];
    slashMenuActiveIndex: number;
    setSlashMenuPage: (v: number | ((prev: number) => number)) => void;
    setSlashMenuActiveIndex: (v: number | ((prev: number) => number)) => void;
    setSlashMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
    slashMenuType: "command" | "database" | "table";
}

export function ChatPage({
    selectedConnection,
    chatDisplayMode,
    setChatDisplayMode,
    chatStreamRef,
    chatMessages,
    isRunningChat,
    handleCopyUserMessage,
    handleEditUserMessage,
    handleCopyText,
    handleCopyChatResult,
    handleCopyChatMessage,
    chatPendingAction,
    setChatPendingAction,
    executeChatSQL,
    isExecutingQuery,
    chatDropActive,
    setChatDropActive,
    chatContextDatabase,
    setChatContextDatabase,
    chatContextTables,
    setChatContextTables,
    chatInput,
    setChatInput,
    handleSendChatMessage,
    handleChatInputChange,
    handleSlashSelect,
    handleChatDrop,
    slashMenuOpen,
    slashMenuItems,
    slashMenuTotalPages,
    slashMenuPageSafe,
    pagedSlashMenuItems,
    slashMenuActiveIndex,
    setSlashMenuPage,
    setSlashMenuActiveIndex,
    setSlashMenuOpen,
    slashMenuType,
}: ChatPageProps) {
    const SLASH_PAGE_SIZE = 20;

    return (
        <section className="page-panel page-panel--wide page-panel--scrollable page-panel--chat">
            <div className="page-headline">
                <div>
                    <h2>AI 对话</h2>
                    <p>{selectedConnection ? "直接用自然语言描述你想查询或操作的内容" : "请先选择一个连接"}</p>
                </div>
                <div className="toolbar-actions">
                    <span className="status-chip">结果展示</span>
                    <button type="button" className={`ghost-button${chatDisplayMode === "summary" ? " ghost-button--active" : ""}`} onClick={() => setChatDisplayMode("summary")}>
                        摘要
                    </button>
                    <button type="button" className={`ghost-button${chatDisplayMode === "table" ? " ghost-button--active" : ""}`} onClick={() => setChatDisplayMode("table")}>
                        表格
                    </button>
                </div>
            </div>

            <div className="chat-layout">
                <div ref={chatStreamRef as React.LegacyRef<HTMLDivElement>} className="chat-stream">
                    {chatMessages.length === 0 ? <div className="empty-block">直接用自然语言描述你想查询或操作当前数据库的内容，我会先理解意图，再自动生成 SQL。</div> : null}
                    {chatMessages.map((item) => (
                        <div key={item.id} className={`chat-message chat-message--${item.role}`}>
                            <div className="chat-message__body">
                                <div className="chat-message__meta">
                                    <div className="chat-message__label">{item.role === "assistant" ? "AI 助手" : "你"}</div>
                                </div>
                                <div className={`chat-bubble chat-bubble--${item.role}`}>
                                    <p>{item.content}</p>
                                </div>
                                {item.role === "user" ? (
                                    <div className="chat-bubble-actions">
                                        <button type="button" className="chat-bubble-actions__btn" onClick={() => handleCopyUserMessage(item)} title="复制内容">📋</button>
                                        <button type="button" className="chat-bubble-actions__btn" onClick={() => handleEditUserMessage(item)} title="修改内容">✏️</button>
                                    </div>
                                ) : null}
                                {item.reasoning ? <span className="chat-reasoning">{item.reasoning}</span> : null}
                                {item.sql ? (
                                    <div className="code-block code-block--light code-block--with-copy">
                                        <pre>{item.sql}</pre>
                                        <button type="button" className="code-block__copy-btn" onClick={() => handleCopyText(item.sql ?? "", "SQL")}>📋 复制</button>
                                    </div>
                                ) : null}
                                {item.result ? (
                                    <div className="chat-result-shell">
                                        <div className="chat-result-shell__meta">
                                            <span>{item.result.statementType || "SELECT"}</span>
                                            <span>{item.result.rows.length} 行</span>
                                            <span>{item.result.durationMs} ms</span>
                                            <button type="button" className="chat-result-shell__copy-btn" onClick={() => handleCopyChatResult(item)}>📋 复制结果</button>
                                        </div>
                                        {item.displayMode === "summary" ? (
                                            <div className="chat-result-summary">
                                                {item.result.rows.slice(0, 3).map((row, rowIndex) => (
                                                    <div key={`${item.id}-summary-${rowIndex}`} className="chat-result-summary__row">
                                                        {item.result?.columns.slice(0, 4).map((column) => (
                                                            <div key={column} className="chat-result-summary__cell">
                                                                <span>{column}</span>
                                                                <strong>{row[column] ?? "-"}</strong>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <table className="result-table">
                                                <thead>
                                                    <tr>
                                                        {item.result.columns.map((column) => (
                                                            <th key={column}>{column}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {item.result.rows.slice(0, 10).map((row, rowIndex) => (
                                                        <tr key={`${item.id}-${rowIndex}`}>
                                                            {item.result?.columns.map((column) => (
                                                                <td key={column}>{row[column] ?? ""}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                ) : null}
                                {item.role === "assistant" ? (
                                    <div className="chat-message__footer">
                                        <button type="button" className="chat-copy-all-btn" onClick={() => handleCopyChatMessage(item)} title="复制整轮对话">
                                            📋 复制全部
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ))}
                    {isRunningChat ? (
                        <div className="chat-message chat-message--assistant">
                            <div className="chat-message__body">
                                <div className="chat-message__meta">
                                    <div className="chat-message__label">AI 助手</div>
                                </div>
                                <div className="chat-thinking">
                                    <span className="chat-thinking__spinner">✦</span>
                                    <span>正在思考并读取当前数据库上下文...</span>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {chatPendingAction ? (
                        <div className="chat-pending-card">
                            <strong>敏感操作待确认</strong>
                            <p>{chatPendingAction.reply}</p>
                            <div className="code-block code-block--light">
                                <pre>{chatPendingAction.sql}</pre>
                            </div>
                            <div className="toolbar-actions">
                                <button type="button" className="ghost-button" onClick={() => setChatPendingAction(null)}>
                                    取消
                                </button>
                                <button type="button" className="primary-button" onClick={() => executeChatSQL(chatPendingAction.sql, chatPendingAction.displayMode, chatPendingAction.reply, chatPendingAction.userMessage, chatPendingAction.reasoning, 0)} disabled={isRunningChat || isExecutingQuery}>
                                    确认执行
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div
                    className={`chat-composer-wrap${chatDropActive ? " chat-composer-wrap--drop-active" : ""}`}
                    onDragOver={(event) => {
                        if (!selectedConnection) {
                            return;
                        }
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                        setChatDropActive(true);
                    }}
                    onDragEnter={(event) => {
                        if (!selectedConnection) {
                            return;
                        }
                        event.preventDefault();
                        setChatDropActive(true);
                    }}
                    onDragLeave={(event) => {
                        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            return;
                        }
                        setChatDropActive(false);
                    }}
                    onDrop={(event) => {
                        event.preventDefault();
                        setChatDropActive(false);
                        const raw = event.dataTransfer.getData("application/x-sql-compass-chat-item");
                        if (!raw) {
                            return;
                        }
                        try {
                            const payload = JSON.parse(raw) as ChatDropPayload;
                            handleChatDrop(payload);
                        } catch {
                            return;
                        }
                    }}
                >
                    {slashMenuOpen && pagedSlashMenuItems.length > 0 ? (
                        <div className="slash-menu">
                            <div className="slash-menu__header">
                                <span>{slashMenuType === "command" ? "命令" : slashMenuType === "database" ? "选择数据库" : "选择数据表"}</span>
                                {slashMenuItems.length > SLASH_PAGE_SIZE && (
                                    <span className="slash-menu__pager">
                                        <button type="button" className="slash-menu__pager-btn" disabled={slashMenuPageSafe === 0} onClick={() => setSlashMenuPage((page) => page - 1)}>‹</button>
                                        <span>{slashMenuPageSafe + 1}/{slashMenuTotalPages}</span>
                                        <button type="button" className="slash-menu__pager-btn" disabled={slashMenuPageSafe >= slashMenuTotalPages - 1} onClick={() => setSlashMenuPage((page) => page + 1)}>›</button>
                                    </span>
                                )}
                            </div>
                            <div className="slash-menu__list">
                                {pagedSlashMenuItems.map((item, index) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        className={`slash-menu__item${index === slashMenuActiveIndex ? " slash-menu__item--active" : ""}`}
                                        onClick={() => handleSlashSelect(item.key)}
                                    >
                                        <span className="slash-menu__item-main">
                                            <span className={`slash-menu__item-tag slash-menu__item-tag--${item.tone}`}>{item.tone === "command" ? "命令" : item.tone === "database" ? "库" : "表"}</span>
                                            <span className="slash-menu__item-label">{item.label}</span>
                                        </span>
                                        <span className="slash-menu__item-desc">{item.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <div className="chat-composer">
                        <div className="chat-context-tags">
                            {chatContextDatabase ? (
                                <button type="button" className="chat-context-tag chat-context-tag--database" onClick={() => {
                                    setChatContextDatabase("");
                                    setChatContextTables([]);
                                }}>
                                    数据库 · {chatContextDatabase}<span aria-hidden="true">×</span>
                                </button>
                            ) : null}
                            {chatContextTables.map((tableName) => (
                                <button key={tableName} type="button" className="chat-context-tag chat-context-tag--table" onClick={() => setChatContextTables((current) => current.filter((item) => item !== tableName))}>
                                    数据表 · {tableName}
                                    <span aria-hidden="true">×</span>
                                </button>
                            ))}
                            {!chatContextDatabase && chatContextTables.length === 0 ? <span className="chat-context-tag chat-context-tag--muted">可从左侧拖入数据库或数据表作为上下文</span> : null}
                        </div>
                        <div className="chat-composer__field">
                            <textarea
                                value={chatInput}
                                onChange={(event) => handleChatInputChange(event.target.value, event.target.selectionStart)}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape" && slashMenuOpen) {
                                        setSlashMenuOpen(false);
                                        event.preventDefault();
                                        return;
                                    }

                                    if (slashMenuOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                                        const delta = event.key === "ArrowDown" ? 1 : -1;
                                        const maxIndex = pagedSlashMenuItems.length - 1;
                                        setSlashMenuActiveIndex((current) => {
                                            if (maxIndex <= 0) {
                                                return 0;
                                            }
                                            return current + delta < 0 ? maxIndex : current + delta > maxIndex ? 0 : current + delta;
                                        });
                                        event.preventDefault();
                                        return;
                                    }

                                    if (slashMenuOpen && event.key === "Enter") {
                                        const activeItem = pagedSlashMenuItems[slashMenuActiveIndex];
                                        if (activeItem) {
                                            handleSlashSelect(activeItem.key);
                                            event.preventDefault();
                                            return;
                                        }
                                    }

                                    if (!(event.nativeEvent as any).isComposing && event.key === "Enter" && !event.shiftKey && !slashMenuOpen) {
                                        event.preventDefault();
                                        if (chatInput.trim()) {
                                            handleSendChatMessage();
                                        }
                                        return;
                                    }
                                }}
                                placeholder="输入你的问题，或从左侧拖入数据库 / 数据表"
                                rows={5}
                            />
                            <button
                                type="button"
                                className={`chat-send-button${isRunningChat ? " chat-send-button--loading" : ""}`}
                                onClick={() => handleSendChatMessage()}
                                disabled={!selectedConnection || !chatInput.trim() || isRunningChat}
                                aria-label={isRunningChat ? "正在思考" : "发送"}
                            >
                                {isRunningChat ? (
                                    <span className="chat-send-button__spinner">✦</span>
                                ) : (
                                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M21 3L10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M21 3L14 21L10 14L3 10L21 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        <div className="chat-composer__hint">
                            <span>{selectedConnection ? `当前连接：${selectedConnection.name}` : "请先选择连接后再发送"}</span>
                            <span>输入 <code>/</code> 或直接拖拽左侧数据库 / 表到这里</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
