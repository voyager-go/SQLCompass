import Editor from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import type { Monaco } from "@monaco-editor/react";
import { NoticeBanner } from "../components/NoticeBanner";
import type { QueryResult, TableDetail } from "../types/runtime";
import type { WorkbenchPage } from "../lib/constants";
import { formatCellPreview, isTextLikeType } from "../lib/utils";

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
    sqlFileInputRef: React.RefObject<HTMLInputElement | null>;
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
    selectedConnection: { id: string } | null;
    selectedDatabase: string;
    selectedTable: string;
    handleFillTableData: () => Promise<void>;
    isFillingTable: boolean;
    setActivePage?: (v: WorkbenchPage) => void;
}

export function QueryPage({
    isExecutingQuery,
    handleExecuteQuery,
    isOptimizingSQL,
    sqlText,
    sqlFileInputRef,
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
}: QueryPageProps) {
    return (
        <section className="page-panel page-panel--wide page-panel--scrollable">
            <div className="page-headline">
                <div className="toolbar-actions toolbar-actions--end">
                    <button type="button" className="primary-button" onClick={() => handleExecuteQuery(1)} disabled={isExecutingQuery}>
                        {isExecutingQuery ? "执行中..." : "执行"}
                    </button>
                    <button
                        type="button"
                        className="ghost-button"
                        onClick={handleFillTableData}
                        disabled={isFillingTable || !selectedConnection || !selectedDatabase || !selectedTable}
                        title={!selectedTable ? "请先选择数据表" : "根据表结构填充测试数据"}
                    >
                        {isFillingTable ? "填充中..." : "填充"}
                    </button>
                    <button type="button" className="ghost-button" onClick={() => sqlFileInputRef.current?.click()}>
                        导入
                    </button>
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
        </section>
    );
}
