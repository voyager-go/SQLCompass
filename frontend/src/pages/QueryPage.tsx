import Editor from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import type { Monaco } from "@monaco-editor/react";
import { useState, useRef, useEffect, useMemo } from "react";
import { NoticeBanner } from "../components/NoticeBanner";
import { FillTableModal } from "../components/FillTableModal";
import type { QueryResult, TableDetail, TransactionResult, BatchExecuteResult } from "../types/runtime";
import type { WorkbenchPage } from "../lib/constants";
import { formatCellPreview, isTextLikeType } from "../lib/utils";
import { PreviewSmartFillSQL, ExecuteTransaction, BatchExecute, GetTransactionStatus } from "../../wailsjs/go/main/App";

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
    handleFillTableData: (mappings?: Record<string, string>, count?: number) => Promise<void>;
    isFillingTable: boolean;
    handleSmartFillTableData: () => Promise<void>;
    isSmartFillingTable: boolean;
    setActivePage?: (v: WorkbenchPage) => void;
    pushToast?: (tone: NoticeTone, title: string, message: string) => void;
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
    pushToast,
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
    const smartFillAbortRef = useRef(false);
    const [fillTableModalOpen, setFillTableModalOpen] = useState(false);
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const colMenuRef = useRef<HTMLDivElement>(null);
    const [sortState, setSortState] = useState<{ column: string | null; direction: "asc" | "desc" | null }>({ column: null, direction: null });

    // Transaction state
    const [txLoading, setTxLoading] = useState(false);
    const [inTransaction, setInTransaction] = useState(false);
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [batchSQLText, setBatchSQLText] = useState("");
    const [batchStopOnError, setBatchStopOnError] = useState(true);
    const [batchLoading, setBatchLoading] = useState(false);
    const [batchResult, setBatchResult] = useState<BatchExecuteResult | null>(null);

    // MongoDB pipeline state
    const [mongoPipelineOpen, setMongoPipelineOpen] = useState(false);
    const [mongoStages, setMongoStages] = useState<{ stage: string; json: string }[]>([
        { stage: "$match", json: "{}" },
    ]);

    useEffect(() => {
        if (queryResult) {
            setHiddenColumns(new Set());
            setSortState({ column: null, direction: null });
        }
    }, [queryResult?.columns.map((c) => c).sort().join(",") ?? ""]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (colMenuRef.current && !colMenuRef.current.contains(event.target as Node)) {
                setColMenuOpen(false);
            }
        }
        if (colMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [colMenuOpen]);

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

    // Poll transaction status
    useEffect(() => {
        if (!selectedConnection || !selectedDatabase) {
            setInTransaction(false);
            return;
        }
        let cancelled = false;
        async function check() {
            try {
                const status = await GetTransactionStatus(selectedConnection!.id, selectedDatabase);
                if (!cancelled) setInTransaction(status);
            } catch {
                if (!cancelled) setInTransaction(false);
            }
        }
        check();
        const interval = setInterval(check, 2000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [selectedConnection, selectedDatabase]);

    function handleSort(column: string) {
        setSortState((prev) => {
            if (prev.column !== column) {
                return { column, direction: "asc" };
            }
            if (prev.direction === "asc") {
                return { column, direction: "desc" };
            }
            return { column: null, direction: null };
        });
    }

    const sortedRows = useMemo(() => {
        if (!queryResult) return [] as { row: Record<string, string>; originalIndex: number }[];
        const rows = queryResult.rows.map((row, originalIndex) => ({ row, originalIndex }));
        if (!sortState.column || !sortState.direction) return rows;
        rows.sort((a, b) => {
            const aVal = a.row[sortState.column!] ?? "";
            const bVal = b.row[sortState.column!] ?? "";
            if (aVal === "" && bVal === "") return 0;
            if (aVal === "") return 1;
            if (bVal === "") return -1;
            const numericPattern = /^-?\d+(\.\d+)?$/;
            if (numericPattern.test(aVal) && numericPattern.test(bVal)) {
                const cmp = parseFloat(aVal) - parseFloat(bVal);
                return sortState.direction === "asc" ? cmp : -cmp;
            }
            const cmp = aVal.localeCompare(bVal, "zh-CN");
            return sortState.direction === "asc" ? cmp : -cmp;
        });
        return rows;
    }, [queryResult, sortState]);

    async function startSmartFill() {
        if (!selectedConnection || !selectedDatabase || !selectedTable) return;
        smartFillAbortRef.current = false;
        setSmartFillModal({ open: true, reasoning: "", sqls: [], editableSQLs: [], loading: true, executing: false, error: "" });
        try {
            const result = (await PreviewSmartFillSQL({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                table: selectedTable,
                count: 10,
            })) as import("../types/runtime").PreviewSmartFillSQLResult;
            if (smartFillAbortRef.current) return;
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
            if (smartFillAbortRef.current) return;
            const message = error instanceof Error ? error.message : "预览失败";
            setSmartFillModal((prev) => ({ ...prev, loading: false, error: message }));
        }
    }

    function handleCloseSmartFillModal() {
        if (smartFillModal.executing) {
            if (!window.confirm("当前智能填充正在执行中，关闭将终止操作，是否继续？")) {
                return;
            }
        } else if (smartFillModal.loading) {
            smartFillAbortRef.current = true;
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
    const supportsTransaction = Boolean(
        selectedConnection && ["mysql", "mariadb", "postgresql"].includes(selectedConnection.engine ?? ""),
    );

    // Transaction handlers
    async function handleTransaction(action: "begin" | "commit" | "rollback") {
        if (!selectedConnection || !selectedDatabase) return;
        setTxLoading(true);
        try {
            const res = (await ExecuteTransaction({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                action,
            })) as TransactionResult;
            if (res.success) {
                setInTransaction(action === "begin");
            }
            if (pushToast) {
                const titleMap = { begin: "开启事务", commit: "提交事务", rollback: "回滚事务" };
                pushToast(res.success ? "success" : "error", titleMap[action], res.message);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "操作失败";
            if (pushToast) pushToast("error", action.toUpperCase(), msg);
        } finally {
            setTxLoading(false);
        }
    }

    async function handleBatchExecute() {
        if (!selectedConnection || !selectedDatabase || !batchSQLText.trim()) return;
        const sqls = batchSQLText.split(";").map((s) => s.trim()).filter(Boolean);
        if (sqls.length === 0) return;
        setBatchLoading(true);
        setBatchResult(null);
        try {
            const res = (await BatchExecute({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                sqls,
                stopOnError: batchStopOnError,
            })) as BatchExecuteResult;
            setBatchResult(res);
            if (pushToast) {
                pushToast(res.failed === 0 ? "success" : "error", "批量执行", res.message);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "批量执行失败";
            if (pushToast) pushToast("error", "批量执行", msg);
        } finally {
            setBatchLoading(false);
        }
    }

    // Redis shortcut handler
    function handleRedisShortcut(cmd: string) {
        if (cmd === "FLUSHDB") {
            if (!window.confirm("FLUSHDB 将删除当前数据库所有 Key，确认继续？")) return;
        }
        setSQLText(cmd);
    }

    // MongoDB pipeline builder
    const MONGO_STAGES = ["$match", "$group", "$sort", "$limit", "$project", "$unwind"] as const;

    function addMongoStage() {
        setMongoStages((prev) => [...prev, { stage: "$match", json: "{}" }]);
    }

    function removeMongoStage(index: number) {
        setMongoStages((prev) => prev.filter((_, i) => i !== index));
    }

    function updateMongoStage(index: number, field: "stage" | "json", value: string) {
        setMongoStages((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
    }

    function generateMongoPipeline() {
        const stages = mongoStages
            .map((s) => {
                try {
                    return `{ ${s.stage}: ${s.json} }`;
                } catch {
                    return `{ ${s.stage}: ${s.json} }`;
                }
            })
            .join(", ");
        const table = selectedTable || "collection";
        setSQLText(`db.${table}.aggregate([${stages}])`);
        setMongoPipelineOpen(false);
    }

    return (
        <section className="page-panel page-panel--wide page-panel--scrollable">
            <div className="page-headline">
                <div className="toolbar-actions toolbar-actions--end">
                    <button type="button" className="primary-button" onClick={() => handleExecuteQuery(1)} disabled={isExecutingQuery}>
                        {isExecutingQuery ? "执行中..." : "执行"}
                    </button>
                    {supportsTransaction ? (
                        <>
                            <div className="toolbar-divider" />
                            <div className={`transaction-control${inTransaction ? " transaction-control--active" : ""}`} aria-label="事务控制">
                                <span className="transaction-control__label">
                                    <span className="tx-status-dot" />
                                    {inTransaction ? "事务中" : "自动提交"}
                                </span>
                                {inTransaction ? (
                                    <span className="transaction-control__actions">
                                        <button type="button" className="tx-action tx-action--commit" onClick={() => handleTransaction("commit")} disabled={txLoading} title="提交当前事务">
                                            {txLoading ? "处理中" : "提交"}
                                        </button>
                                        <button type="button" className="tx-action tx-action--rollback" onClick={() => handleTransaction("rollback")} disabled={txLoading} title="回滚当前事务">
                                            回滚
                                        </button>
                                    </span>
                                ) : (
                                    <button type="button" className="tx-action tx-action--begin" onClick={() => handleTransaction("begin")} disabled={txLoading || !selectedConnection || !selectedDatabase} title="开启事务后，后续 SQL 会进入同一事务">
                                        {txLoading ? "开启中" : "开启事务"}
                                    </button>
                                )}
                            </div>
                        </>
                    ) : null}
                    <button type="button" className="ghost-button ghost-button--sm" onClick={() => setBatchModalOpen(true)} disabled={!selectedConnection} title="批量执行多条 SQL">
                        批量执行
                    </button>
                    <div className="toolbar-divider" />
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
                                        setFillTableModalOpen(true);
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

            {/* Redis Shortcuts */}
            {selectedConnection?.engine === "redis" ? (
                <div className="redis-shortcuts" style={{ marginTop: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginRight: 8 }}>快捷命令</span>
                    {["PING", "INFO", "DBSIZE", "FLUSHDB", "CONFIG GET *"].map((cmd) => (
                        <button
                            key={cmd}
                            type="button"
                            className={`mini-ghost-button${cmd === "FLUSHDB" ? " ghost-button--danger" : ""}`}
                            onClick={() => handleRedisShortcut(cmd)}
                        >
                            {cmd}
                        </button>
                    ))}
                </div>
            ) : null}

            {/* MongoDB Pipeline Builder */}
            {selectedConnection?.engine === "mongodb" ? (
                <div style={{ marginTop: 12 }}>
                    <button
                        type="button"
                        className="mini-ghost-button"
                        onClick={() => setMongoPipelineOpen((v) => !v)}
                    >
                        {mongoPipelineOpen ? "收起聚合构建器 ▴" : "聚合构建器 ▾"}
                    </button>
                    {mongoPipelineOpen ? (
                        <div className="mongo-pipeline" style={{ marginTop: 10 }}>
                            {mongoStages.map((stage, idx) => (
                                <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                                    <select
                                        value={stage.stage}
                                        onChange={(e) => updateMongoStage(idx, "stage", e.target.value)}
                                        style={{ padding: "6px 8px", border: "1px solid var(--border-soft)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 12.5 }}
                                    >
                                        {MONGO_STAGES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                    <textarea
                                        value={stage.json}
                                        onChange={(e) => updateMongoStage(idx, "json", e.target.value)}
                                        rows={2}
                                        placeholder="{}"
                                        style={{ flex: 1, padding: 8, border: "1px solid var(--border-soft)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 12, resize: "vertical" }}
                                    />
                                    <button type="button" className="mini-ghost-button ghost-button--danger" onClick={() => removeMongoStage(idx)}>
                                        ✕
                                    </button>
                                </div>
                            ))}
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                <button type="button" className="mini-ghost-button" onClick={addMongoStage}>
                                    + 添加阶段
                                </button>
                                <button type="button" className="mini-primary-button" onClick={generateMongoPipeline}>
                                    生成语句
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            <div className="result-board">
                <div className="result-board__header">
                    <div className="result-board__title">
                        <span className="result-board__dot"></span>
                        查询结果
                    </div>
                    {queryResult && queryResult.columns.length > 0 ? (
                        <div ref={colMenuRef} style={{ position: "relative", marginRight: "auto", marginLeft: 8 }}>
                            <button
                                type="button"
                                className="ghost-button"
                                style={{ padding: "4px 8px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                                onClick={() => setColMenuOpen((v) => !v)}
                                title="显示/隐藏列"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="3" y1="9" x2="21" y2="9"></line>
                                    <line x1="9" y1="3" x2="9" y2="21"></line>
                                </svg>
                                列
                            </button>
                            {colMenuOpen ? (
                                <div
                                    className="context-menu"
                                    style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: 180, maxHeight: 320, overflowY: "auto", zIndex: 10 }}
                                >
                                    <div style={{ padding: "6px 10px", display: "flex", gap: 10, borderBottom: "1px solid var(--border-soft)" }}>
                                        <button
                                            type="button"
                                            style={{ fontSize: 11, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                            onClick={() => setHiddenColumns(new Set())}
                                        >
                                            全选
                                        </button>
                                        <button
                                            type="button"
                                            style={{ fontSize: 11, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                            onClick={() => setHiddenColumns(new Set(queryResult.columns))}
                                        >
                                            清空
                                        </button>
                                    </div>
                                    {queryResult.columns.map((column) => (
                                        <label key={column} className="context-menu__item" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5 }}>
                                            <input
                                                type="checkbox"
                                                checked={!hiddenColumns.has(column)}
                                                onChange={(e) => {
                                                    setHiddenColumns((prev) => {
                                                        const next = new Set(prev);
                                                        if (e.target.checked) {
                                                            next.delete(column);
                                                        } else {
                                                            next.add(column);
                                                        }
                                                        return next;
                                                    });
                                                }}
                                            />
                                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{column}</span>
                                        </label>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
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
                            <span>{queryResult.columns.filter((c) => !hiddenColumns.has(c)).length}/{queryResult.columns.length} 列</span>
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
                                            {queryResult.columns.filter((c) => !hiddenColumns.has(c)).map((column) => (
                                                <th
                                                    key={column}
                                                    onClick={() => handleSort(column)}
                                                    style={{ cursor: "pointer", userSelect: "none" }}
                                                >
                                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                                        {column}
                                                        {sortState.column === column ? (
                                                            <span style={{ fontSize: 13, opacity: 0.85, color: "var(--accent)" }}>
                                                                {sortState.direction === "asc" ? "▲" : "▼"}
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: 13, opacity: 0.35 }}>⇅</span>
                                                        )}
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedRows.map(({ row, originalIndex }) => (
                                            <tr key={buildRowSelectionKey(queryResult.page, queryResult.columns, row, originalIndex)}>
                                                <td className="result-table__checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedResultRowKeys.includes(buildRowSelectionKey(queryResult.page, queryResult.columns, row, originalIndex))}
                                                        onChange={() => handleToggleResultRow(buildRowSelectionKey(queryResult.page, queryResult.columns, row, originalIndex))}
                                                    />
                                                </td>
                                                {queryResult.columns.filter((c) => !hiddenColumns.has(c)).map((column) => {
                                                    const field = tableDetail?.fields.find((item) => item.name === column);
                                                    const fieldType = field?.type ?? "";
                                                    const value = row[column] ?? "";
                                                    const rowKey = buildRowSelectionKey(queryResult.page, queryResult.columns, row, originalIndex);
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
                            <div style={{ margin: "12px 0", textAlign: "center" }}>
                                <div className="chat-thinking" style={{ justifyContent: "center" }}>
                                    <span className="chat-thinking__spinner">✦</span>
                                    <span>AI 正在分析表结构并构思数据...</span>
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                                    预计需要 10~30 秒，可随时点击取消终止
                                </div>
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

            {/* Batch Execute Modal */}
            {batchModalOpen ? (
                <div className="modal-backdrop" onClick={() => setBatchModalOpen(false)}>
                    <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>批量执行</h3>
                                <p>输入多条 SQL 语句，用分号分隔</p>
                            </div>
                        </div>
                        <textarea
                            value={batchSQLText}
                            onChange={(e) => setBatchSQLText(e.target.value)}
                            rows={8}
                            placeholder="SELECT * FROM table1;&#10;SELECT * FROM table2;"
                            style={{
                                width: "100%",
                                padding: 12,
                                border: "1px solid var(--border-soft)",
                                borderRadius: 8,
                                background: "var(--input-bg)",
                                color: "var(--text-primary)",
                                fontFamily: "var(--font-mono)",
                                fontSize: 13,
                                lineHeight: 1.6,
                                resize: "vertical",
                            }}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--text-primary)" }}>
                            <input type="checkbox" checked={batchStopOnError} onChange={(e) => setBatchStopOnError(e.target.checked)} />
                            遇到错误时停止
                        </label>
                        {batchResult ? (
                            <div style={{ marginTop: 12, padding: 12, background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--panel-border)" }}>
                                <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>
                                    <strong>总执行:</strong> {batchResult.total} | <strong>成功:</strong> <span style={{ color: "#059669" }}>{batchResult.success}</span> | <strong>失败:</strong> <span style={{ color: "#dc2626" }}>{batchResult.failed}</span>
                                </div>
                                {batchResult.errors.length > 0 ? (
                                    <div style={{ fontSize: 12, color: "#dc2626", fontFamily: "var(--font-mono)" }}>
                                        {batchResult.errors.map((e, i) => (
                                            <div key={i}>{e}</div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        <div className="toolbar-actions toolbar-actions--end" style={{ marginTop: 16 }}>
                            <button type="button" className="ghost-button" onClick={() => setBatchModalOpen(false)} disabled={batchLoading}>
                                取消
                            </button>
                            <button type="button" className="primary-button" onClick={handleBatchExecute} disabled={batchLoading || !batchSQLText.trim()}>
                                {batchLoading ? "执行中..." : "执行"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <FillTableModal
                open={fillTableModalOpen}
                fields={tableDetail?.fields ?? []}
                onClose={() => setFillTableModalOpen(false)}
                onConfirm={(mappings, cnt) => {
                    setFillTableModalOpen(false);
                    handleFillTableData(mappings, cnt);
                }}
                isFilling={isFillingTable}
            />
        </section>
    );
}
