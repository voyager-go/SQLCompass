import Editor from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import type { Monaco } from "@monaco-editor/react";
import { useState, useRef, useEffect } from "react";
import { NoticeBanner } from "../components/NoticeBanner";
import type { QueryResult, TableDetail } from "../types/runtime";
import type { WorkbenchPage } from "../lib/constants";
import { formatCellPreview, isTextLikeType } from "../lib/utils";
import { PreviewSmartFillSQL } from "../../wailsjs/go/main/App";

type NoticeTone = "success" | "error" | "info";

type SelectedSnippet = {
    text: string;
    start: number;
    end: number;
    anchorTop: number;
    anchorLeft: number;
};

interface QueryPageProps {
    isExecutingQuery: boolean;
    handleExecuteQuery: (page: number) => void;
    isOptimizingSQL: boolean;
    sqlText: string;
    queryNotice: { tone: NoticeTone; message: string } | null;
    sqlEditorCollapsed: boolean;
    setSQLEditorCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    selectedSnippet: SelectedSnippet | null;
    setSelectedSnippet: React.Dispatch<React.SetStateAction<SelectedSnippet | null>>;
    handleExecuteSelectedSQL: () => void;
    handleBeautifySelectedSQL: () => void;
    handleOptimizeSelectedSQL: () => void;
    handleEditorDidMount: (editor: MonacoEditorNS.IStandaloneCodeEditor, monaco: Monaco) => void;
    setSQLText: (v: string) => void;
    queryErrorDetail: string;
    setQueryErrorDetail: (v: string) => void;
    queryResult: QueryResult | null;
    queryPageSize: number;
    setQueryPageSize: (v: number) => void;
    previewContext: { database: string; table: string } | null;
    handlePreviewTableWithSize: (database: string, table: string, page: number, size: number) => Promise<void>;
    handlePreviewTable: (database: string, table: string, page: number) => Promise<void>;
    runSQLWithSize: (sql: string, page: number, size: number) => Promise<void>;
    runSQL: (sql: string, page: number) => Promise<void>;
    lastExecutedSQL: string;
    queryPage: number;
    hasNextQueryPage: boolean;
    jumpPageInput: string;
    setJumpPageInput: (v: string) => void;
    selectedResultRows: Record<string, any>[];
    allVisibleRowsSelected: boolean | null;
    handleToggleAllResultRows: () => void;
    handleToggleResultRow: (key: string) => void;
    selectedResultRowKeys: string[];
    buildRowSelectionKey: (page: number, columns: string[], row: Record<string, any>, index: number) => string;
    tableDetail: TableDetail | null;
    openCellEditor: (row: Record<string, any>, rowKey: string, column: string) => void;
    handleCopySQL: () => void;
    handleExportQuerySQL: () => void;
    handleExportQueryCSV: () => void;
    handleExportQueryExcel: () => void;
    handleExportSelectedRows: () => void;
    isExporting: boolean;
    canDeleteSelectedRows: boolean;
    handleRequestDeleteSelectedRows: () => void;
    queryPageSizeOptions: number[];
    selectedConnection: { id: string; engine?: string } | null;
    selectedDatabase: string;
    selectedTable: string;
    handleFillTableData: () => Promise<void>;
    isFillingTable: boolean;
    handleSmartFillTableData: () => Promise<void>;
    isSmartFillingTable: boolean;
    setActivePage?: (v: WorkbenchPage) => void;
}

export function QueryPage({
    isExecutingQuery,
    handleExecuteQuery,
    isOptimizingSQL,
    sqlText,
    queryNotice,
    sqlEditorCollapsed,
    setSQLEditorCollapsed,
    selectedSnippet,
    setSelectedSnippet,
    handleExecuteSelectedSQL,
    handleBeautifySelectedSQL,
    handleOptimizeSelectedSQL,
    handleEditorDidMount,
    setSQLText,
    queryErrorDetail,
    setQueryErrorDetail,
    queryResult,
    queryPageSize,
    setQueryPageSize,
    previewContext,
    handlePreviewTableWithSize,
    handlePreviewTable,
    runSQLWithSize,
    runSQL,
    lastExecutedSQL,
    queryPage,
    hasNextQueryPage,
    jumpPageInput,
    setJumpPageInput,
    selectedResultRows,
    allVisibleRowsSelected,
    handleToggleAllResultRows,
    handleToggleResultRow,
    selectedResultRowKeys,
    buildRowSelectionKey,
    tableDetail,
    openCellEditor,
    handleCopySQL,
    handleExportQuerySQL,
    handleExportQueryCSV,
    handleExportQueryExcel,
    handleExportSelectedRows,
    isExporting,
    canDeleteSelectedRows,
    handleRequestDeleteSelectedRows,
    queryPageSizeOptions,
    selectedConnection,
    selectedDatabase,
    selectedTable,
    handleFillTableData,
    isFillingTable,
    handleSmartFillTableData,
    isSmartFillingTable,
}: QueryPageProps) {
    const [fillMenuOpen, setFillMenuOpen] = useState(false);
    const fillMenuRef = useRef<HTMLDivElement>(null);
    const [smartFillModal, setSmartFillModal] = useState<{
        open: boolean;
        reasoning: string;
        sqls: string[];
        editableSQLs: string[];
        loading: boolean;
        executing: boolean;
        error: string;
    }>({ open: false, reasoning: "", sqls: [], editableSQLs: [], loading: false, executing: false, error: "" });

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (fillMenuRef.current && !fillMenuRef.current.contains(event.target as Node)) {
                setFillMenuOpen(false);
            }
        }
        if (fillMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [fillMenuOpen]);

    async function startSmartFill() {
        if (!selectedConnection || !selectedDatabase || !selectedTable) return;
        setSmartFillModal({ open: true, reasoning: "", sqls: [], editableSQLs: [], loading: true, executing: false, error: "" });
        try {
            const result = (await PreviewSmartFillSQL({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                table: selectedTable,
                count: 10,
            })) as import("../types/runtime").PreviewSmartFillSQLResult;
            if (result.success) {
                setSmartFillModal((prev) => ({
                    ...prev,
                    loading: false,
                    reasoning: result.reasoning,
                    sqls: result.sqls,
                    editableSQLs: result.sqls,
                }));
            } else {
                setSmartFillModal((prev) => ({ ...prev, loading: false, error: result.message }));
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "预览失败";
            setSmartFillModal((prev) => ({ ...prev, loading: false, error: message }));
        }
    }

    function handleCloseSmartFillModal() {
        if (smartFillModal.loading || smartFillModal.executing) {
            if (!window.confirm("当前智能填充正在进行中，关闭将终止操作，是否继续？")) {
                return;
            }
        }
        setSmartFillModal({ open: false, reasoning: "", sqls: [], editableSQLs: [], loading: false, executing: false, error: "" });
    }

    async function handleExecuteSmartFill() {
        if (!smartFillModal.editableSQLs.length) return;
        setSmartFillModal((prev) => ({ ...prev, executing: true }));
        try {
            for (const sql of smartFillModal.editableSQLs) {
                if (!sql.trim()) continue;
                await runSQL(sql, 1);
            }
            setSmartFillModal({ open: false, reasoning: "", sqls: [], editableSQLs: [], loading: false, executing: false, error: "" });
            if (selectedDatabase && selectedTable) {
                await handlePreviewTable(selectedDatabase, selectedTable, 1);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "执行失败";
            setSmartFillModal((prev) => ({ ...prev, executing: false, error: message }));
        }
    }

    const fillDisabled = isFillingTable || isSmartFillingTable || !selectedConnection || !selectedDatabase || !selectedTable;
    const hideFill = selectedConnection && ["redis", "mongodb"].includes(selectedConnection.engine ?? "");

    return (
        <section className="page-panel page-panel--wide page-panel--scrollable">
            <div className="page-headline">
                <div className="toolbar-actions toolbar-actions--end">
                    <button type="button" className="primary-button" onClick={() => handleExecuteQuery(1)} disabled={isExecutingQuery}>
                        {isExecutingQuery ? "执行中..." : "执行"}
                    </button>
                    <div ref={fillMenuRef} style={{ position: "relative", display: hideFill ? "none" : undefined }}>
                        <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setFillMenuOpen((v) => !v)}
                            disabled={fillDisabled}
                            title={!selectedTable ? "请先选择数据表" : "填充测试数据"}
                        >
                            {isFillingTable || isSmartFillingTable ? "填充中..." : "填充 ▾"}
                        </button>
                        {fillMenuOpen ? (
                            <div
                                className="context-menu"
                                style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, left: "auto", minWidth: 140 }}
                            >
                                <button
                                    type="button"
                                    className="context-menu__item"
                                    onClick={() => {
                                        setFillMenuOpen(false);
                                        handleFillTableData();
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                        <line x1="3" y1="9" x2="21" y2="9"></line>
                                        <line x1="9" y1="3" x2="9" y2="21"></line>
                                    </svg>
                                    常规填充
                                </button>
                                <button
                                    type="button"
                                    className="context-menu__item"
                                    onClick={() => {
                                        setFillMenuOpen(false);
                                        startSmartFill();
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                                        <path d="M2 17l10 5 10-5"></path>
                                        <path d="M2 12l10 5 10-5"></path>
                                    </svg>
                                    智能填充
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {queryNotice ? <NoticeBanner notice={queryNotice} /> : null}

            <div className={`editor-shell${sqlEditorCollapsed ? " editor-shell--collapsed" : ""}`}>
                <div className="editor-shell__top">
                    <div className="editor-shell__signals">
                        <span className="editor-dot" />
                        <span className="editor-dot" />
                        <span className="editor-dot" />
                    </div>
                    <button
                        type="button"
                        className="editor-toggle-fab"
                        onClick={() => setSQLEditorCollapsed((current) => !current)}
                        aria-label={sqlEditorCollapsed ? "展开编辑器" : "收起编辑器"}
                    >
                        {sqlEditorCollapsed ? "▾" : "▴"}
                    </button>
                </div>
                {!sqlEditorCollapsed ? (
                    <div className="sql-editor">
                        {isOptimizingSQL ? <div className="editor-ai-mask"><span className="editor-ai-spinner">✦</span><strong>AI 正在优化</strong></div> : null}
                        {!isOptimizingSQL && !sqlText.trim() ? (
                            <div className="editor-placeholder">
                                <span className="editor-placeholder__icon">⌨</span>
                                <span>输入 SQL 语句，按 <kbd>Ctrl</kbd>+<kbd>Enter</kbd> / <kbd>Cmd</kbd>+<kbd>Enter</kbd> 执行查询</span>
                            </div>
                        ) : null}
                        {!isOptimizingSQL && selectedSnippet?.text.trim() ? (
                            <div
                                className="selection-actions selection-actions--floating"
                                style={{
                                    top: selectedSnippet.anchorTop,
                                    left: selectedSnippet.anchorLeft,
                                }}
                            >
                                <button type="button" className="mini-primary-button" onClick={() => handleExecuteSelectedSQL()} disabled={isExecutingQuery}>
                                    执行
                                </button>
                                <button type="button" className="mini-ghost-button" onClick={() => handleBeautifySelectedSQL()} disabled={isOptimizingSQL}>
                                    美化
                                </button>
                                <button type="button" className="mini-ghost-button" onClick={() => handleOptimizeSelectedSQL()} disabled={isOptimizingSQL}>
                                    优化
                                </button>
                            </div>
                        ) : null}
                        <Editor
                            height="320px"
                            defaultLanguage="sql"
                            value={sqlText}
                            onMount={handleEditorDidMount}
                            onChange={(value) => {
                                setSQLText(value ?? "");
                                setSelectedSnippet(null);
                                setQueryErrorDetail("");
                            }}
                            options={{
                                automaticLayout: true,
                                minimap: { enabled: false },
                                fontSize: 14,
                                lineHeight: 22,
                                readOnly: isOptimizingSQL,
                                roundedSelection: true,
                                scrollBeyondLastLine: false,
                                wordWrap: "on",
                                quickSuggestions: {
                                    other: true,
                                    comments: false,
                                    strings: true,
                                },
                                suggestOnTriggerCharacters: true,
                                quickSuggestionsDelay: 80,
                                suggest: {
                                    snippetsPreventQuickSuggestions: false,
                                    showKeywords: true,
                                    localityBonus: true,
                                },
                                tabSize: 2,
                                padding: {
                                    top: 14,
                                    bottom: 14,
                                },
                            }}
                        />
                    </div>
                ) : null}
            </div>

            <div className="result-board">
                <div className="result-board__header">
                    <div className="result-board__title">
                        <span className="result-board__dot"></span>
                        查询结果
                    </div>
                    {queryResult && (
                        <div className="result-board__pagination">
                            <div className="pagination-size">
                                <span className="pagination-label">每页</span>
                                <select
                                    className="pagination-select"
                                    value={queryPageSize}
                                    onChange={(e) => {
                                        const newSize = Number(e.target.value);
                                        setQueryPageSize(newSize);
                                        localStorage.setItem("sql-compass-query-page-size", String(newSize));
                                        if (previewContext) {
                                            handlePreviewTableWithSize(previewContext.database, previewContext.table, 1, newSize).catch(() => undefined);
                                        } else {
                                            runSQLWithSize(lastExecutedSQL || sqlText, 1, newSize).catch(() => undefined);
                                        }
                                    }}
                                    disabled={isExecutingQuery}
                                >
                                    {queryPageSizeOptions.map((size) => (
                                        <option key={size} value={size}>
                                            {size}
                                        </option>
                                    ))}
                                </select>
                                <span className="pagination-label">条</span>
                            </div>

                            <div className="pagination-nav">
                                <button
                                    type="button"
                                    className="pagination-btn"
                                    onClick={() => {
                                        const nextPage = Math.max(1, queryPage - 1);
                                        if (previewContext) {
                                            handlePreviewTable(previewContext.database, previewContext.table, nextPage).catch(() => undefined);
                                            return;
                                        }
                                        runSQL(lastExecutedSQL || sqlText, nextPage).catch(() => undefined);
                                    }}
                                    disabled={queryPage <= 1 || isExecutingQuery}
                                    title="上一页"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="15 18 9 12 15 6"></polyline>
                                    </svg>
                                </button>
                                <span className="pagination-current">{queryPage}</span>
                                <button
                                    type="button"
                                    className="pagination-btn"
                                    onClick={() => {
                                        const nextPage = queryPage + 1;
                                        if (previewContext) {
                                            handlePreviewTable(previewContext.database, previewContext.table, nextPage).catch(() => undefined);
                                            return;
                                        }
                                        runSQL(lastExecutedSQL || sqlText, nextPage).catch(() => undefined);
                                    }}
                                    disabled={isExecutingQuery || !hasNextQueryPage}
                                    title="下一页"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6"></polyline>
                                    </svg>
                                </button>
                            </div>

                            <div className="pagination-goto">
                                <span className="pagination-label">跳至</span>
                                <input
                                    type="text"
                                    className="pagination-input"
                                    value={jumpPageInput}
                                    onChange={(e) => setJumpPageInput(e.target.value.replace(/\D/g, ""))}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            const page = Number(jumpPageInput);
                                            if (page > 0) {
                                                if (previewContext) {
                                                    handlePreviewTable(previewContext.database, previewContext.table, page).catch(() => undefined);
                                                } else {
                                                    runSQL(lastExecutedSQL || sqlText, page).catch(() => undefined);
                                                }
                                                setJumpPageInput("");
                                            }
                                        }
                                    }}
                                    placeholder=""
                                    disabled={isExecutingQuery}
                                />
                                <span className="pagination-label">页</span>
                            </div>
                        </div>
                    )}
                </div>

                {queryErrorDetail ? (
                    <div className="query-error-card">
                        <div className="section-title">
                            <div>
                                <h3>完整报错</h3>
                                <p>这里展示数据库返回的完整错误信息，不再只提示执行失败。</p>
                            </div>
                        </div>
                        <div className="code-block">
                            <pre>{queryErrorDetail}</pre>
                        </div>
                    </div>
                ) : null}

                {queryResult ? (
                    <>
                        <div className="result-meta">
                            <span>{queryResult.durationMs} ms</span>
                            <span>第 {queryResult.page} 页</span>
                            <span>{queryResult.rows.length} 行</span>
                            <span>{queryResult.columns.length} 列</span>
                            {selectedResultRows.length > 0 ? <span>已选 {selectedResultRows.length} 项</span> : null}
                        </div>

                        {queryResult.statementType === "REDIS_KEY" && queryResult.rows[0] ? (
                            <div className="detail-card">
                                <div className="section-title">
                                    <div>
                                        <h3>Key 详情</h3>
                                        <p>结构化展示 Redis Key 的基本信息与预览值。</p>
                                    </div>
                                </div>
                                <div className="schema-detail-grid">
                                    <div className="summary-item"><span>Key</span><strong>{queryResult.rows[0].key}</strong></div>
                                    <div className="summary-item"><span>Type</span><strong>{queryResult.rows[0].type}</strong></div>
                                    <div className="summary-item"><span>TTL</span><strong>{queryResult.rows[0].ttl}</strong></div>
                                    <div className="summary-item"><span>Encoding</span><strong>{queryResult.rows[0].encoding}</strong></div>
                                </div>
                                <div className="code-block code-block--wide code-block--tall" style={{ marginTop: 16 }}>
                                    <pre>{queryResult.rows[0].preview}</pre>
                                </div>
                            </div>
                        ) : null}

                        {queryResult.columns.length > 0 ? (
                            <>
                                <div className="result-table-shell">
                                <table className="result-table">
                                    <thead>
                                        <tr>
                                            <th className="result-table__checkbox">
                                                <input type="checkbox" checked={Boolean(allVisibleRowsSelected)} onChange={handleToggleAllResultRows} />
                                            </th>
                                            {queryResult.columns.map((column) => (
                                                <th key={column}>{column}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {queryResult.rows.map((row, rowIndex) => (
                                            <tr key={buildRowSelectionKey(queryResult.page, queryResult.columns, row, rowIndex)}>
                                                <td className="result-table__checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedResultRowKeys.includes(buildRowSelectionKey(queryResult.page, queryResult.columns, row, rowIndex))}
                                                        onChange={() => handleToggleResultRow(buildRowSelectionKey(queryResult.page, queryResult.columns, row, rowIndex))}
                                                    />
                                                </td>
                                                {queryResult.columns.map((column) => {
                                                    const field = tableDetail?.fields.find((item) => item.name === column);
                                                    const fieldType = field?.type ?? "";
                                                    const value = row[column] ?? "";
                                                    const rowKey = buildRowSelectionKey(queryResult.page, queryResult.columns, row, rowIndex);
                                                    return (
                                                        <td key={column} onDoubleClick={() => openCellEditor(row, rowKey, column)}>
                                                            {isTextLikeType(fieldType) ? (
                                                                <div className="result-cell result-cell--text" title={value}>
                                                                    {formatCellPreview(value, fieldType) || "空值"}
                                                                </div>
                                                            ) : (
                                                                <div className="result-cell" title={value}>
                                                                    {value || ""}
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>

                                <div className="result-actions-bar">
                                    <div className="result-actions-bar__summary">
                                        <strong>{selectedResultRows.length}</strong>
                                        <span>已勾选结果项</span>
                                    </div>
                                    <div className="toolbar-actions">
                                        <button type="button" className="ghost-button" onClick={handleCopySQL} disabled={!queryResult?.effectiveSql && selectedResultRows.length === 0}>
                                            复制 SQL
                                        </button>
                                        <button type="button" className="ghost-button" onClick={handleExportQuerySQL} disabled={!queryResult?.effectiveSql || isExporting}>
                                            导出 SQL
                                        </button>
                                        <button type="button" className="ghost-button" onClick={handleExportQueryCSV} disabled={!queryResult || queryResult.rows.length === 0 || isExporting}>
                                            导出 CSV
                                        </button>
                                        <button type="button" className="ghost-button" onClick={handleExportQueryExcel} disabled={!queryResult || queryResult.rows.length === 0 || isExporting}>
                                            导出 Excel
                                        </button>
                                        <button type="button" className="ghost-button" onClick={handleExportSelectedRows} disabled={selectedResultRows.length === 0 || isExporting}>
                                            导出选中项
                                        </button>
                                        <button type="button" className="ghost-button ghost-button--danger" onClick={handleRequestDeleteSelectedRows} disabled={!canDeleteSelectedRows || isExecutingQuery}>
                                            删除选中项
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="empty-block">该 SQL 没有返回结果集。</div>
                        )}
                    </>
                ) : (
                    <div className="empty-block">执行 SQL 或点击左侧某张表后，这里会展示真实数据结果。</div>
                )}
            </div>

            {smartFillModal.open ? (
                <div className="modal-backdrop" onClick={handleCloseSmartFillModal}>
                    <div className="modal-card modal-card--wide" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>智能填充</h3>
                                <p>AI 根据表结构语义生成真实测试数据。</p>
                            </div>
                        </div>

                        {smartFillModal.loading ? (
                            <div className="chat-thinking" style={{ margin: "12px 0", justifyContent: "center" }}>
                                <span className="chat-thinking__spinner">✦</span>
                                <span>AI 正在思考数据生成策略...</span>
                            </div>
                        ) : null}

                        {smartFillModal.error ? (
                            <div className="notice notice--error" style={{ marginBottom: 12 }}>
                                <span>{smartFillModal.error}</span>
                            </div>
                        ) : null}

                        {!smartFillModal.loading && smartFillModal.reasoning ? (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>思考过程</div>
                                <div className="chat-reasoning">{smartFillModal.reasoning}</div>
                            </div>
                        ) : null}

                        {!smartFillModal.loading && smartFillModal.sqls.length > 0 ? (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>生成的 SQL（可修改）</div>
                                <textarea
                                    value={smartFillModal.editableSQLs.join("\n")}
                                    onChange={(e) => setSmartFillModal((prev) => ({ ...prev, editableSQLs: e.target.value.split("\n") }))}
                                    style={{
                                        width: "100%",
                                        minHeight: 160,
                                        padding: 10,
                                        border: "1px solid var(--border-soft)",
                                        borderRadius: 8,
                                        background: "var(--input-bg)",
                                        color: "var(--text-primary)",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: 12.5,
                                        lineHeight: 1.6,
                                        resize: "vertical",
                                    }}
                                />
                            </div>
                        ) : null}

                        <div className="toolbar-actions toolbar-actions--end">
                            <button type="button" className="ghost-button" onClick={handleCloseSmartFillModal} disabled={smartFillModal.executing}>
                                取消
                            </button>
                            {!smartFillModal.loading && smartFillModal.sqls.length > 0 ? (
                                <button type="button" className="primary-button" onClick={handleExecuteSmartFill} disabled={smartFillModal.executing}>
                                    {smartFillModal.executing ? "执行中..." : "确认执行"}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
