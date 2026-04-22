import { type Monaco } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IDisposable, editor as MonacoEditorNS } from "monaco-editor";
import {
    AnalyzeSQL,
    BeautifySQL,
    BrowseRedisKeys,
    CreateDatabase,
    CreateTable,
    ExecuteQuery,
    ExportTextFile,
    FillTableData,
    GetExplorerTree,
    SmartFillTableData,
    GetQueryHistory,
    GetStorageInfo,
    GetTableDetail,
    GetTableRowCounts,
    GetWorkspaceState,
    OptimizeSQL,
    PreviewTableData,
} from "../wailsjs/go/main/App";
import "./App.css";
import { NoticeBanner } from "./components/NoticeBanner";
import { FloatingToast } from "./components/FloatingToast";
import {
    copyText,
    emptyWorkspaceState,
    hasWailsBridge,
    loadBrowserWorkspaceState,
    browserGeneratedID,
    createAIForm,
    clamp,
    getErrorMessage,
    stringifyResultSQLValue,
    buildInsertStatement,
    buildRowSelectionKey,
    csvFromRows,
    downloadText,
    excelFromRows,
} from "./lib/utils";
import { OptimizeReviewModal } from "./pages/OptimizeReviewModal";
import { SplashScreen } from "./components/SplashScreen";
import { Sidebar } from "./components/Sidebar";
import { WorkbenchRouter } from "./components/WorkbenchRouter";
import { useChat } from "./hooks/useChat";
import { useConnections } from "./hooks/useConnections";
import { useSchema } from "./hooks/useSchema";
import { useAISettings } from "./hooks/useAISettings";
import { useCellEditor } from "./hooks/useCellEditor";
import { type NoticeTone, type WorkbenchPage, type WorkMode, type ThemeMode } from "./lib/constants";
import { CellEditorModal } from "./pages/CellEditorModal";
import { DeleteDialogModal } from "./pages/DeleteDialogModal";
import type {
    WorkspaceState,
} from "./types/workspace";
import type {
    ExplorerTree,
    HistoryItem,
    QueryResult,
    SQLAnalysis,
    SQLOptimizeResult,
    StorageInfoView,
    TableDetail,
} from "./types/runtime";

type CustomTheme = {
    navFontSize: number;
    resultFontSize: number;
    fontColor: string;
    accentColor: string;
    backgroundColor: string;
    backgroundImage: string | null;
};
type Notice = {
    tone: NoticeTone;
    message: string;
};

type Toast = {
    id: string;
    tone: NoticeTone;
    title: string;
    message: string;
};

type PreviewContext = {
    connectionId: string;
    database: string;
    table: string;
};

type SelectedSnippet = {
    text: string;
    start: number;
    end: number;
    anchorTop: number;
    anchorLeft: number;
};

type DeleteDialogState = {
    statement: string;
    count: number;
};

type TableContextMenuState = {
    x: number;
    y: number;
    database: string;
    table: string;
};

type DangerConfirmState = {
    open: boolean;
    title: string;
    message: string;
    actionLabel: string;
    onConfirm: (() => void) | null;
};

type SQLCompletionSpec = {
    label: string;
    insertText: string;
    detail: string;
    kind: "keyword" | "table" | "column" | "function";
};

type OptimizeReviewState = {
    target: "full" | "selection";
    sql: string;
    reasoning: string;
    prompt: string;
    analysis: SQLAnalysis;
};

const themeStorageKey = "sql-compass-theme";
const previewPageSize = 30;
const DEFAULT_QUERY_PAGE_SIZE = 20;
const QUERY_PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];
const sqlKeywordSpecs: SQLCompletionSpec[] = [
    // DML
    { label: "SELECT", insertText: "SELECT", detail: "查询字段", kind: "keyword" },
    { label: "FROM", insertText: "FROM", detail: "指定表", kind: "keyword" },
    { label: "WHERE", insertText: "WHERE", detail: "过滤条件", kind: "keyword" },
    { label: "ORDER BY", insertText: "ORDER BY", detail: "排序", kind: "keyword" },
    { label: "GROUP BY", insertText: "GROUP BY", detail: "分组", kind: "keyword" },
    { label: "HAVING", insertText: "HAVING", detail: "分组过滤", kind: "keyword" },
    { label: "LIMIT", insertText: "LIMIT", detail: "限制行数", kind: "keyword" },
    { label: "OFFSET", insertText: "OFFSET", detail: "偏移量", kind: "keyword" },
    { label: "INSERT INTO", insertText: "INSERT INTO", detail: "插入数据", kind: "keyword" },
    { label: "VALUES", insertText: "VALUES", detail: "值列表", kind: "keyword" },
    { label: "UPDATE", insertText: "UPDATE", detail: "更新数据", kind: "keyword" },
    { label: "SET", insertText: "SET", detail: "设置字段值", kind: "keyword" },
    { label: "DELETE FROM", insertText: "DELETE FROM", detail: "删除数据", kind: "keyword" },
    { label: "REPLACE INTO", insertText: "REPLACE INTO", detail: "替换插入", kind: "keyword" },
    // JOIN
    { label: "JOIN", insertText: "JOIN", detail: "连接", kind: "keyword" },
    { label: "INNER JOIN", insertText: "INNER JOIN", detail: "内连接", kind: "keyword" },
    { label: "LEFT JOIN", insertText: "LEFT JOIN", detail: "左连接", kind: "keyword" },
    { label: "RIGHT JOIN", insertText: "RIGHT JOIN", detail: "右连接", kind: "keyword" },
    { label: "CROSS JOIN", insertText: "CROSS JOIN", detail: "交叉连接", kind: "keyword" },
    { label: "ON", insertText: "ON", detail: "连接条件", kind: "keyword" },
    // DDL
    { label: "CREATE TABLE", insertText: "CREATE TABLE", detail: "创建表", kind: "keyword" },
    { label: "ALTER TABLE", insertText: "ALTER TABLE", detail: "修改表结构", kind: "keyword" },
    { label: "DROP TABLE", insertText: "DROP TABLE", detail: "删除表", kind: "keyword" },
    { label: "TRUNCATE", insertText: "TRUNCATE", detail: "清空表数据", kind: "keyword" },
    { label: "CREATE INDEX", insertText: "CREATE INDEX", detail: "创建索引", kind: "keyword" },
    { label: "DROP INDEX", insertText: "DROP INDEX", detail: "删除索引", kind: "keyword" },
    { label: "CREATE DATABASE", insertText: "CREATE DATABASE", detail: "创建数据库", kind: "keyword" },
    { label: "DROP DATABASE", insertText: "DROP DATABASE", detail: "删除数据库", kind: "keyword" },
    // Conditions & Operators
    { label: "AND", insertText: "AND", detail: "逻辑与", kind: "keyword" },
    { label: "OR", insertText: "OR", detail: "逻辑或", kind: "keyword" },
    { label: "NOT", insertText: "NOT", detail: "逻辑非", kind: "keyword" },
    { label: "IN", insertText: "IN", detail: "在列表中", kind: "keyword" },
    { label: "BETWEEN", insertText: "BETWEEN", detail: "范围之间", kind: "keyword" },
    { label: "LIKE", insertText: "LIKE", detail: "模式匹配", kind: "keyword" },
    { label: "IS NULL", insertText: "IS NULL", detail: "为空", kind: "keyword" },
    { label: "IS NOT NULL", insertText: "IS NOT NULL", detail: "不为空", kind: "keyword" },
    { label: "EXISTS", insertText: "EXISTS", detail: "存在性检查", kind: "keyword" },
    { label: "CASE WHEN", insertText: "CASE WHEN $1 THEN $1 ELSE $1 END", detail: "条件表达式", kind: "keyword" },
    { label: "AS", insertText: "AS", detail: "别名", kind: "keyword" },
    { label: "DISTINCT", insertText: "DISTINCT", detail: "去重", kind: "keyword" },
    { label: "UNION", insertText: "UNION", detail: "合并结果集（去重）", kind: "keyword" },
    { label: "UNION ALL", insertText: "UNION ALL", detail: "合并结果集（保留重复）", kind: "keyword" },
    // Aggregates
    { label: "COUNT(*)", insertText: "COUNT(*)", detail: "计数", kind: "function" },
    { label: "COUNT", insertText: "COUNT($1)", detail: "计数", kind: "function" },
    { label: "SUM", insertText: "SUM($1)", detail: "求和", kind: "function" },
    { label: "AVG", insertText: "AVG($1)", detail: "平均值", kind: "function" },
    { label: "MIN", insertText: "MIN($1)", detail: "最小值", kind: "function" },
    { label: "MAX", insertText: "MAX($1)", detail: "最大值", kind: "function" },
    { label: "ROUND", insertText: "ROUND($1, $0)", detail: "四舍五入", kind: "function" },
    { label: "IFNULL", insertText: "IFNULL($1, $0)", detail: "空值替换", kind: "function" },
    { label: "COALESCE", insertText: "COALESCE($1, $0)", detail: "返回第一个非空值", kind: "function" },
    { label: "CONCAT", insertText: "CONCAT($1, $0)", detail: "字符串拼接", kind: "function" },
    { label: "SUBSTRING", insertText: "SUBSTRING($1, $0, $0)", detail: "子字符串", kind: "function" },
    { label: "LENGTH", insertText: "LENGTH($1)", detail: "字符串长度", kind: "function" },
    { label: "NOW()", insertText: "NOW()", detail: "当前时间", kind: "function" },
    { label: "CURRENT_TIMESTAMP", insertText: "CURRENT_TIMESTAMP", detail: "当前时间戳", kind: "function" },
    { label: "DATE_FORMAT", insertText: "DATE_FORMAT($1, '%Y-%m-%d')", detail: "日期格式化", kind: "function" },
    { label: "RAND()", insertText: "RAND()", detail: "随机数", kind: "function" },
    { label: "UUID()", insertText: "UUID()", detail: "生成 UUID", kind: "function" },
    { label: "MD5", insertText: "MD5($1)", detail: "MD5 哈希", kind: "function" },
    // Other
    { label: "*", insertText: "*", detail: "所有字段", kind: "keyword" },
];

function App() {
    const browserPreview = !hasWailsBridge();
    const sqlEditorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const chatStreamRef = useRef<HTMLDivElement | null>(null);
    const completionDisposableRef = useRef<IDisposable | null>(null);
    const [monacoReady, setMonacoReady] = useState(false);

    const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(emptyWorkspaceState);
    const [, setBackendState] = useState("正在连接桌面后端");
    const [activePage, setActivePage] = useState<WorkbenchPage>("connections");
    const [workMode, setWorkMode] = useState<WorkMode>("normal");
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
        if (typeof window === "undefined") {
            return "light";
        }
        return (window.localStorage.getItem(themeStorageKey) as ThemeMode) || "light";
    });
    const [customTheme, setCustomTheme] = useState<CustomTheme>(() => {
        if (typeof window === "undefined") {
            return { navFontSize: 14, resultFontSize: 14, fontColor: "#1f2937", accentColor: "#3b82f6", backgroundColor: "#f8fcfb", backgroundImage: null };
        }
        const saved = window.localStorage.getItem("sql-compass-custom-theme");
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...parsed, backgroundImage: parsed.backgroundImage ?? null, backgroundColor: parsed.backgroundColor ?? "#f8fcfb" };
        }
        return { navFontSize: 14, resultFontSize: 14, fontColor: "#1f2937", accentColor: "#3b82f6", backgroundColor: "#f8fcfb", backgroundImage: null };
    });
    const [sidebarView, setSidebarView] = useState<"database" | "workbench">("database");
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const [selectedConnectionId, setSelectedConnectionId] = useState("");
    const [selectedDatabase, setSelectedDatabase] = useState("");
    const [selectedTable, setSelectedTable] = useState("");
    const [tableSearch, setTableSearch] = useState("");
    const [explorerTree, setExplorerTree] = useState<ExplorerTree | null>(null);
    // Database and table filters
    const [databaseFilter, setDatabaseFilter] = useState<string[]>([]);
    const [tableFilter, setTableFilter] = useState<string[]>([]);
    const [showDatabaseFilter, setShowDatabaseFilter] = useState(false);
    const [showTableFilter, setShowTableFilter] = useState(false);
    const [storageInfo, setStorageInfo] = useState<StorageInfoView | null>(null);
    const [newStoragePath, setNewStoragePath] = useState("");
    const [showPermissionModal, setShowPermissionModal] = useState(false);
    const [showClearModal, setShowClearModal] = useState<string | null>(null);
    // 启动页显示状态
    const [showSplash, setShowSplash] = useState(true);

    const loadStorageInfo = useCallback(() => {
        if (browserPreview) {
            setStorageInfo({
                dataDir: "浏览器本地预览",
                files: [],
                total: 0,
                totalHR: "0 B",
                writable: true,
            });
            return;
        }
        GetStorageInfo().then((info: StorageInfoView) => {
            setStorageInfo(info);
            setNewStoragePath(info.dataDir);
            if (!info.writable) {
                setShowPermissionModal(true);
            }
        });
    }, [browserPreview]);

    useEffect(() => {
        if (activePage === "settings") {
            loadStorageInfo();
        }
    }, [activePage, loadStorageInfo]);

    // 启动页自动关闭逻辑
    useEffect(() => {
        if (!showSplash) {
            return;
        }
        const timer = window.setTimeout(() => {
            setShowSplash(false);
        }, 2000);
        return () => window.clearTimeout(timer);
    }, [showSplash]);

    const [tableDetail, setTableDetail] = useState<TableDetail | null>(null);
    const [tablePageByDatabase, setTablePageByDatabase] = useState<Record<string, number>>({});
    const [redisCursorHistoryByDatabase, setRedisCursorHistoryByDatabase] = useState<Record<string, number[]>>({});
    const [expandedDatabases, setExpandedDatabases] = useState<Record<string, boolean>>({});

    const [sqlText, setSQLText] = useState("");
    const [sqlEditorCollapsed, setSQLEditorCollapsed] = useState(false);
    const [selectedSnippet, setSelectedSnippet] = useState<SelectedSnippet | null>(null);
    const [selectedResultRowKeys, setSelectedResultRowKeys] = useState<string[]>([]);
    const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
    const [queryErrorDetail, setQueryErrorDetail] = useState("");
    const [lastExecutedSQL, setLastExecutedSQL] = useState("");
    const [, setSQLAnalysis] = useState<SQLAnalysis | null>(null);
    const [optimizeReview, setOptimizeReview] = useState<OptimizeReviewState | null>(null);
    const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
    const [, setHistoryFocusId] = useState("");
    const [queryPage, setQueryPage] = useState(1);
    const [queryPageSize, setQueryPageSize] = useState(() => {
        const saved = localStorage.getItem("sql-compass-query-page-size");
        return saved ? Number(saved) : DEFAULT_QUERY_PAGE_SIZE;
    });
    const [jumpPageInput, setJumpPageInput] = useState("");
    const [historyPage, setHistoryPage] = useState(1);
    const [previewContext, setPreviewContext] = useState<PreviewContext | null>(null);
    const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
    const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);

    // Database import / export
    const [isExportingDB, setIsExportingDB] = useState(false);
    const [isImportingDB, setIsImportingDB] = useState(false);
    const dbImportSQLInputRef = useRef<HTMLInputElement | null>(null);
    const dbImportCSVInputRef = useRef<HTMLInputElement | null>(null);
    const [dbImportTargetDatabase, setDbImportTargetDatabase] = useState("");
    const [csvImportModalOpen, setCsvImportModalOpen] = useState(false);
    const [csvImportHeaders, setCsvImportHeaders] = useState<string[]>([]);
    const [csvImportRows, setCsvImportRows] = useState<string[][]>([]);
    const [csvImportTargetTable, setCsvImportTargetTable] = useState("");
    const [csvImportTables, setCsvImportTables] = useState<string[]>([]);

    const [workspaceNotice, setWorkspaceNotice] = useState<Notice | null>(null);
    const [queryNotice, setQueryNotice] = useState<Notice | null>(null);
    const [, setTransferNotice] = useState<Notice | null>(null);
    const [toast, setToast] = useState<Toast | null>(null);

    const [isExecutingQuery, setIsExecutingQuery] = useState(false);
    const [isOptimizingSQL, setIsOptimizingSQL] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isFillingTable, setIsFillingTable] = useState(false);
    const [isSmartFillingTable, setIsSmartFillingTable] = useState(false);
    const [showCreateDBModal, setShowCreateDBModal] = useState(false);
    const [createDBForm, setCreateDBForm] = useState({ name: "", charset: "utf8mb4", collation: "utf8mb4_unicode_ci" });
    const [isCreatingDB, setIsCreatingDB] = useState(false);
    const [dbContextMenu, setDbContextMenu] = useState<{ x: number; y: number; database: string } | null>(null);
    const [chatBlockerModalOpen, setChatBlockerModalOpen] = useState(false);
    const [dangerConfirm, setDangerConfirm] = useState<DangerConfirmState>({
        open: false,
        title: "",
        message: "",
        actionLabel: "",
        onConfirm: null,
    });

    const selectedConnection = workspaceState.connections.find((item) => item.id === selectedConnectionId) ?? null;
    const primaryFieldNames = useMemo(() => tableDetail?.fields.filter((field) => field.primary).map((field) => field.name) ?? [], [tableDetail]);
    const resultRowKeys = useMemo(
        () => (queryResult ? queryResult.rows.map((row, rowIndex) => buildRowSelectionKey(queryResult.page, queryResult.columns, row, rowIndex)) : []),
        [queryResult],
    );
    const selectedResultRows = useMemo(() => {
        if (!queryResult) {
            return [];
        }

        const selectedKeySet = new Set(selectedResultRowKeys);
        return queryResult.rows.filter((row, rowIndex) => selectedKeySet.has(buildRowSelectionKey(queryResult.page, queryResult.columns, row, rowIndex)));
    }, [queryResult, selectedResultRowKeys]);
    const allVisibleRowsSelected = queryResult && queryResult.rows.length > 0 && selectedResultRows.length === queryResult.rows.length;
    const hasNextQueryPage = Boolean(queryResult?.hasNextPage);
    const canDeleteSelectedRows = Boolean(
        selectedConnection &&
            selectedDatabase &&
            selectedTable &&
            queryResult &&
            selectedResultRows.length > 0 &&
            primaryFieldNames.length > 0 &&
            primaryFieldNames.every((fieldName) => queryResult.columns.includes(fieldName)),
    );

    const sqlCompletionSpecs = useMemo(() => {
        const currentDatabase = explorerTree?.databases.find((item) => item.name === selectedDatabase) ?? null;
        const tableSpecs =
            currentDatabase?.tables.map((table) => ({
                label: table.name,
                insertText: `\`${table.name}\``,
                detail: `数据表 · ${currentDatabase.name}`,
                kind: "table" as const,
            })) ?? [];
        const fieldSpecs =
            tableDetail?.fields.map((field) => ({
                label: field.name,
                insertText: `\`${field.name}\``,
                detail: `字段 · ${tableDetail.table}`,
                kind: "column" as const,
            })) ?? [];

        const seen = new Set<string>();
        return [...sqlKeywordSpecs, ...tableSpecs, ...fieldSpecs].filter((item) => {
            const key = `${item.kind}:${item.label}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }, [explorerTree, selectedDatabase, tableDetail]);

    const chat = useChat({
        selectedConnection,
        selectedDatabase,
        selectedTable,
        queryPageSize,
        previewPageSize,
        explorerTree,
        pushToast,
        setQueryResult,
        setLastExecutedSQL,
        setQueryPage,
        setPreviewContext,
        setSQLAnalysis,
        setQueryErrorDetail,
        loadHistory,
        handleSelectDatabase,
    });

    const conn = useConnections({
        workspaceState,
        setWorkspaceState,
        selectedConnectionId,
        setSelectedConnectionId,
        selectedConnection,
        browserPreview,
        pushToast,
        refreshWorkspaceState,
        setWorkspaceNotice,
        setActivePage: setActivePage as (page: string) => void,
    });

    const activeEngine = selectedConnection?.engine ?? conn.connectionDraft.engine;

    const schema = useSchema({
        browserPreview,
        activeEngine,
        selectedConnection,
        selectedDatabase,
        selectedTable,
        tableDetail,
        pushToast,
        setTransferNotice,
        setSelectedTable,
        loadExplorer,
        loadTable,
        exportTextFile,
    });

    const ai = useAISettings({
        browserPreview,
        workspaceState,
        setWorkspaceState,
        emptyWorkspaceState,
        refreshWorkspaceState,
    });

    const cellEditorHook = useCellEditor({
        previewContext,
        tableDetail,
        selectedTable,
        primaryFieldNames,
        selectedConnection,
        selectedDatabase,
        queryPageSize,
        queryPage,
        handlePreviewTable,
        pushToast,
        setQueryNotice,
    });


    function pushToast(tone: NoticeTone, title: string, message: string) {
        setToast({
            id: browserGeneratedID(),
            tone,
            title,
            message,
        });
    }

    const FILTER_STORAGE_KEY = "sql-compass-filter-settings-v2";

    interface ConnectionFilterSettings {
        databaseFilter: string[];
        tableFilter: string[];
        expandedDatabases: Record<string, boolean>;
        tablePageByDatabase: Record<string, number>;
    }

    function getAllFilterSettings(): Record<string, ConnectionFilterSettings> {
        try {
            const saved = localStorage.getItem(FILTER_STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch {
            // 兼容旧版本 key
            try {
                const legacy = localStorage.getItem("sql-compass-filter-settings");
                if (legacy) {
                    const parsed = JSON.parse(legacy);
                    return {
                        [selectedConnectionId]: {
                            databaseFilter: parsed.databaseFilter ?? [],
                            tableFilter: parsed.tableFilter ?? [],
                            expandedDatabases: {},
                            tablePageByDatabase: {},
                        },
                    };
                }
            } catch {
                // ignore
            }
        }
        return {};
    }

    // 保存当前连接的筛选设置到本地存储
    function saveFilterSettings() {
        if (!selectedConnectionId) {
            pushToast("info", "提示", "请先选择一个连接后再保存筛选设置");
            return;
        }
        const allSettings = getAllFilterSettings();
        allSettings[selectedConnectionId] = {
            databaseFilter,
            tableFilter,
            expandedDatabases,
            tablePageByDatabase,
        };
        localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(allSettings));
        pushToast("success", "已保存", "筛选设置已保存，下次连接时自动恢复");
    }

    // 加载指定连接的筛选设置；如果没有则清空
    function loadFilterSettingsForConnection(connectionId: string) {
        if (!connectionId) {
            setDatabaseFilter([]);
            setTableFilter([]);
            setExpandedDatabases({});
            setTablePageByDatabase({});
            return;
        }
        const allSettings = getAllFilterSettings();
        const settings = allSettings[connectionId];
        if (settings) {
            setDatabaseFilter(settings.databaseFilter ?? []);
            setTableFilter(settings.tableFilter ?? []);
            setExpandedDatabases(settings.expandedDatabases ?? {});
            setTablePageByDatabase(settings.tablePageByDatabase ?? {});
        } else {
            setDatabaseFilter([]);
            setTableFilter([]);
            setExpandedDatabases({});
            setTablePageByDatabase({});
        }
    }

    // 清理已不存在连接的残留筛选数据
    function cleanupFilterSettings(existingConnectionIds: string[]) {
        const allSettings = getAllFilterSettings();
        const existingSet = new Set(existingConnectionIds);
        let changed = false;
        for (const id of Object.keys(allSettings)) {
            if (!existingSet.has(id)) {
                delete allSettings[id];
                changed = true;
            }
        }
        if (changed) {
            localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(allSettings));
        }
    }

    async function refreshWorkspaceState() {
        if (browserPreview) {
            const state = loadBrowserWorkspaceState();
            setWorkspaceState(state);
            ai.setAIForm(createAIForm(state));
            return;
        }

        const state = (await GetWorkspaceState()) as WorkspaceState;
        setWorkspaceState(state);
        ai.setAIForm(createAIForm(state));
    }

    async function loadExplorer(connectionId: string, preferredDatabase = "") {
        if (browserPreview) {
            setExplorerTree(null);
            setWorkspaceNotice({
                tone: "info",
                message: "浏览器预览模式不支持真实库表树，请使用桌面模式。",
            });
            return;
        }

        if (!connectionId) {
            setExplorerTree(null);
            setSelectedDatabase("");
            return;
        }

        // 1. 快速获取表列表（不含行数）
        const tree = (await GetExplorerTree({ connectionId, database: preferredDatabase })) as ExplorerTree;
        setExplorerTree(tree);

        if (tree.engine === "redis") {
            const nextHistory: Record<string, number[]> = {};
            tree.databases.forEach((db) => {
                nextHistory[db.name] = [0];
            });
            setRedisCursorHistoryByDatabase(nextHistory);
        }

        // 2. 异步加载行数
        if (tree.engine !== "redis" && tree.databases && tree.databases.length > 0) {
            loadTableRowCounts(connectionId, tree);
        }

        // 不自动选中数据库，让用户自行选择
        // 仅在用户明确指定了 preferredDatabase 时才选中
        const nextDatabase = preferredDatabase
            ? tree.databases.find((item) => item.name === preferredDatabase)?.name
            : "";

        setSelectedDatabase(nextDatabase || "");
        setTablePageByDatabase((current) => ({
            ...current,
            ...(nextDatabase ? { [nextDatabase]: current[nextDatabase] ?? 1 } : {}),
        }));

        if (selectedTable && nextDatabase) {
            const tableExists = tree.databases.find((item) => item.name === nextDatabase)?.tables.some((item) => item.name === selectedTable);
            if (!tableExists) {
                setSelectedTable("");
            }
        }
    }

    async function handleBrowseRedisKeys(databaseName: string, direction: "next" | "prev") {
        if (!selectedConnection || !explorerTree || explorerTree.engine !== "redis") {
            return;
        }

        const currentDatabase = explorerTree.databases.find((db) => db.name === databaseName);
        if (!currentDatabase) {
            return;
        }

        const history = redisCursorHistoryByDatabase[databaseName] ?? [0];
        const cursor = direction === "next"
            ? (currentDatabase.nextCursor ?? 0)
            : history[Math.max(0, history.length - 2)] ?? 0;

        const result = (await BrowseRedisKeys({
            connectionId: selectedConnection.id,
            database: databaseName,
            cursor,
            count: 50,
        })) as import("./types/runtime").RedisKeyBrowseResult;

        setExplorerTree((prev) => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                databases: prev.databases.map((db) =>
                    db.name === databaseName
                        ? {
                              ...db,
                              tables: result.keys,
                              nextCursor: result.nextCursor,
                              hasMore: result.hasMore,
                          }
                        : db,
                ),
            };
        });

        setRedisCursorHistoryByDatabase((prev) => {
            const current = prev[databaseName] ?? [0];
            if (direction === "next") {
                return {
                    ...prev,
                    [databaseName]: [...current, cursor],
                };
            }
            return {
                ...prev,
                [databaseName]: current.slice(0, Math.max(1, current.length - 1)),
            };
        });
    }

    // 异步加载表行数
    async function loadTableRowCounts(connectionId: string, tree: ExplorerTree) {
        // 收集所有需要加载行数的表
        const tablesToLoad: { database: string; tables: string[] }[] = [];

        for (const db of tree.databases) {
            if (db.tables && db.tables.length > 0) {
                const tableNames = db.tables
                    .filter((t) => t.rows === -1) // 只加载尚未加载的
                    .map((t) => t.name);
                if (tableNames.length > 0) {
                    tablesToLoad.push({ database: db.name, tables: tableNames });
                }
            }
        }

        if (tablesToLoad.length === 0) return;

        // 逐库异步加载行数
        for (const { database, tables } of tablesToLoad) {
            try {
                const result = (await GetTableRowCounts({
                    connectionId,
                    database,
                    tables,
                })) as {
                    connectionId: string;
                    database: string;
                    counts: Record<string, number>;
                };

                // 更新 explorerTree 中的行数（同时更新 tables 和 schemas 中的表）
                setExplorerTree((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        databases: prev.databases.map((db) => {
                            if (db.name !== database) return db;
                            const updateTableRows = (table: typeof db.tables[0]) => ({
                                ...table,
                                rows: result.counts[table.name] ?? table.rows,
                                loading: false,
                            });
                            return {
                                ...db,
                                tables: db.tables.map(updateTableRows),
                                schemas: db.schemas
                                    ? db.schemas.map((schema) => ({
                                          ...schema,
                                          tables: schema.tables.map(updateTableRows),
                                      }))
                                    : db.schemas,
                            };
                        }),
                    };
                });
            } catch {
                // 加载失败不影响主流程
            }
        }
    }

    async function loadTable(connectionId: string, database: string, table: string) {
        if (browserPreview || !connectionId || !database || !table) {
            setTableDetail(null);
            schema.setSchemaDraftFields([]);
            schema.setSchemaDraftIndexes([]);
            return;
        }

        const detail = (await GetTableDetail({ connectionId, database, table })) as TableDetail;
        setTableDetail(detail);
        schema.setRenameTableName(detail.table);
        schema.setSchemaDraftFields(
            detail.fields.map((field) => ({
                ...field,
                id: browserGeneratedID(),
                originName: field.name,
                needsAiComment: field.comment.trim() === "",
                aiLoading: false,
            })),
        );
        schema.setSchemaDraftIndexes(
            detail.indexes.map((idx) => ({
                ...idx,
                id: browserGeneratedID(),
                originName: idx.name,
                indexType: idx.indexType || "",
            })),
        );
        schema.setSchemaNotice(null);
    }

    async function loadHistory(connectionId: string) {
        if (browserPreview || !connectionId) {
            setHistoryItems([]);
            setHistoryFocusId("");
            return;
        }

        const items = (await GetQueryHistory(connectionId)) as HistoryItem[];
        setHistoryItems(items);
        setHistoryFocusId(items[0]?.id ?? "");
    }

    async function exportTextFile(kind: "sql" | "csv" | "xls", suggestedName: string, content: string, title: string) {
        if (!content.trim()) {
            setTransferNotice({ tone: "info", message: "当前没有可导出的内容。" });
            return;
        }

        try {
            setIsExporting(true);
            if (browserPreview) {
                const mimeType =
                    kind === "csv"
                        ? "text/csv;charset=utf-8"
                        : kind === "xls"
                          ? "application/vnd.ms-excel;charset=utf-8"
                          : "text/sql;charset=utf-8";
                downloadText(suggestedName, content, mimeType);
                setTransferNotice({ tone: "success", message: `已导出 ${suggestedName}` });
                return;
            }

            const result = (await ExportTextFile({
                suggestedName,
                content,
                kind,
                title,
            })) as { saved: boolean; path: string };

            if (!result.saved) {
                setTransferNotice({ tone: "info", message: "已取消导出。" });
                return;
            }

            setTransferNotice({ tone: "success", message: `已保存到 ${result.path}` });
            pushToast("success", "导出完成", suggestedName);
        } catch (error) {
            const message = error instanceof Error ? error.message : "导出失败";
            setTransferNotice({ tone: "error", message });
        } finally {
            setIsExporting(false);
        }
    }

    function quoteIdentifierForEngine(name: string, engine: string): string {
        const normalized = engine.toLowerCase();
        if (normalized === "postgresql" || normalized === "sqlite") {
            return `"${name.replace(/"/g, "\"\"")}"`;
        }
        return `\`${name.replace(/`/g, "``")}\``;
    }

    function stringifySQLValueForEngine(value: string): string {
        if (value === "NULL" || value === "null") {
            return "NULL";
        }
        return `'${value.replace(/'/g, "''")}'`;
    }

    async function handleExportDatabaseStructure(database: string) {
        if (!selectedConnection || !explorerTree) {
            pushToast("error", "导出失败", "请先选择连接");
            return;
        }
        const dbNode = explorerTree.databases.find((d) => d.name === database);
        if (!dbNode) {
            pushToast("error", "导出失败", "未找到数据库");
            return;
        }
        try {
            setIsExportingDB(true);
            let sql = `-- Database: ${database}\n-- Engine: ${explorerTree.engine}\n-- Exported at: ${new Date().toISOString()}\n\n`;
            const tables = dbNode.schemas
                ? dbNode.schemas.flatMap((s) => s.tables)
                : dbNode.tables;
            for (const table of tables) {
                const detail = (await GetTableDetail({
                    connectionId: selectedConnection.id,
                    database,
                    table: table.name,
                })) as TableDetail;
                sql += detail.ddl + "\n\n";
            }
            await exportTextFile("sql", `${database}-structure.sql`, sql, `导出数据库 ${database} 结构`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "导出失败";
            pushToast("error", "导出失败", message);
        } finally {
            setIsExportingDB(false);
        }
    }

    async function handleExportDatabaseStructureAndData(database: string) {
        if (!selectedConnection || !explorerTree) {
            pushToast("error", "导出失败", "请先选择连接");
            return;
        }
        const dbNode = explorerTree.databases.find((d) => d.name === database);
        if (!dbNode) {
            pushToast("error", "导出失败", "未找到数据库");
            return;
        }
        try {
            setIsExportingDB(true);
            const engine = explorerTree.engine;
            let sql = `-- Database: ${database}\n-- Engine: ${engine}\n-- Exported at: ${new Date().toISOString()}\n\n`;
            const tables = dbNode.schemas
                ? dbNode.schemas.flatMap((s) => s.tables)
                : dbNode.tables;

            for (const table of tables) {
                const detail = (await GetTableDetail({
                    connectionId: selectedConnection.id,
                    database,
                    table: table.name,
                })) as TableDetail;
                sql += detail.ddl + "\n\n";

                if (detail.fields.length === 0) continue;

                const columns = detail.fields.map((f) => f.name);
                const qColumns = columns.map((c) => quoteIdentifierForEngine(c, engine)).join(", ");
                const qTable = quoteIdentifierForEngine(table.name, engine);

                let page = 1;
                const pageSize = 500;
                while (true) {
                    const result = (await ExecuteQuery({
                        connectionId: selectedConnection.id,
                        database,
                        sql: `SELECT ${qColumns} FROM ${qTable}`,
                        page,
                        pageSize,
                    })) as QueryResult;

                    if (result.rows.length === 0) break;

                    for (const row of result.rows) {
                        const values = columns.map((col) => stringifySQLValueForEngine(row[col] ?? ""));
                        sql += `INSERT INTO ${qTable} (${qColumns}) VALUES (${values.join(", ")});\n`;
                    }

                    if (!result.hasNextPage) break;
                    page++;
                }
                sql += "\n";
            }

            await exportTextFile("sql", `${database}-full.sql`, sql, `导出数据库 ${database} 结构及数据`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "导出失败";
            pushToast("error", "导出失败", message);
        } finally {
            setIsExportingDB(false);
        }
    }

    function handleImportSQLToDatabase(database: string) {
        setDbImportTargetDatabase(database);
        dbImportSQLInputRef.current?.click();
    }

    function handleImportCSVToDatabase(database: string) {
        setDbImportTargetDatabase(database);
        dbImportCSVInputRef.current?.click();
    }

    function handleTruncateTable(database: string, table: string) {
        if (!selectedConnection) return;
        const engine = selectedConnection.engine;
        const qTable = quoteIdentifierForEngine(table, engine);
        setDangerConfirm({
            open: true,
            title: "截断表",
            message: `确定要截断表 "${table}" 吗？该操作会清空表中所有数据，且不可恢复。`,
            actionLabel: "确认截断",
            onConfirm: async () => {
                setDangerConfirm((prev) => ({ ...prev, open: false }));
                try {
                    await ExecuteQuery({
                        connectionId: selectedConnection.id,
                        database,
                        sql: `TRUNCATE TABLE ${qTable};`,
                        page: 1,
                        pageSize: 1,
                    });
                    pushToast("success", "操作成功", `表 "${table}" 已截断`);
                    await loadExplorer(selectedConnection.id, database);
                } catch (error) {
                    const message = error instanceof Error ? error.message : "截断表失败";
                    pushToast("error", "操作失败", message);
                }
            },
        });
    }

    function handleDropTable(database: string, table: string) {
        if (!selectedConnection) return;
        const engine = selectedConnection.engine;
        const qTable = quoteIdentifierForEngine(table, engine);
        setDangerConfirm({
            open: true,
            title: "删除表",
            message: `确定要删除表 "${table}" 吗？该操作会永久删除表及其所有数据，且不可恢复。`,
            actionLabel: "确认删除",
            onConfirm: async () => {
                setDangerConfirm((prev) => ({ ...prev, open: false }));
                try {
                    await ExecuteQuery({
                        connectionId: selectedConnection.id,
                        database,
                        sql: `DROP TABLE ${qTable};`,
                        page: 1,
                        pageSize: 1,
                    });
                    pushToast("success", "操作成功", `表 "${table}" 已删除`);
                    if (selectedTable === table) {
                        setSelectedTable("");
                        setTableDetail(null);
                    }
                    await loadExplorer(selectedConnection.id, database);
                } catch (error) {
                    const message = error instanceof Error ? error.message : "删除表失败";
                    pushToast("error", "操作失败", message);
                }
            },
        });
    }

    function splitSQLStatements(sql: string): string[] {
        const statements: string[] = [];
        let current = "";
        let inString = false;
        let stringChar = "";
        let escaped = false;

        for (let i = 0; i < sql.length; i++) {
            const char = sql[i];

            if (escaped) {
                current += char;
                escaped = false;
                continue;
            }

            if (char === "\\") {
                current += char;
                escaped = true;
                continue;
            }

            if (inString) {
                current += char;
                if (char === stringChar) {
                    inString = false;
                }
                continue;
            }

            if (char === "'" || char === "`" || char === '"') {
                current += char;
                inString = true;
                stringChar = char;
                continue;
            }

            if (char === ";") {
                current += char;
                const trimmed = current.trim();
                if (trimmed) {
                    statements.push(trimmed);
                }
                current = "";
                continue;
            }

            current += char;
        }

        const trimmed = current.trim();
        if (trimmed) {
            statements.push(trimmed);
        }

        return statements.filter((s) => s.length > 0);
    }

    async function handleImportSQLFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file || !selectedConnection || !dbImportTargetDatabase) {
            event.target.value = "";
            return;
        }

        try {
            setIsImportingDB(true);
            const content = await file.text();
            const statements = splitSQLStatements(content);
            let executed = 0;
            let failed = 0;

            for (const stmt of statements) {
                try {
                    await ExecuteQuery({
                        connectionId: selectedConnection.id,
                        database: dbImportTargetDatabase,
                        sql: stmt,
                        page: 1,
                        pageSize: 1,
                    });
                    executed++;
                } catch {
                    failed++;
                }
            }

            if (failed > 0) {
                pushToast("info", "导入完成", `成功 ${executed} 条，失败 ${failed} 条`);
            } else {
                pushToast("success", "导入完成", `成功执行 ${executed} 条 SQL`);
            }
            await loadExplorer(selectedConnection.id, dbImportTargetDatabase);
        } catch (error) {
            const message = error instanceof Error ? error.message : "导入失败";
            pushToast("error", "导入失败", message);
        } finally {
            setIsImportingDB(false);
            event.target.value = "";
        }
    }

    function parseCSV(text: string): { headers: string[]; rows: string[][] } {
        const lines: string[] = [];
        let currentLine = "";
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (inQuotes) {
                if (char === '"') {
                    if (nextChar === '"') {
                        currentLine += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentLine += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === "\n") {
                    lines.push(currentLine);
                    currentLine = "";
                } else if (char === "\r") {
                    // skip
                } else {
                    currentLine += char;
                }
            }
        }
        if (currentLine.length > 0 || text.endsWith("\n")) {
            lines.push(currentLine);
        }

        if (lines.length === 0) {
            return { headers: [], rows: [] };
        }

        const headers = lines[0].split(",").map((h) => h.trim());
        const rows = lines.slice(1).map((line) => {
            const cells: string[] = [];
            let cell = "";
            let inQ = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (inQ) {
                    if (char === '"') {
                        const next = line[i + 1];
                        if (next === '"') {
                            cell += '"';
                            i++;
                        } else {
                            inQ = false;
                        }
                    } else {
                        cell += char;
                    }
                } else {
                    if (char === '"') {
                        inQ = true;
                    } else if (char === ",") {
                        cells.push(cell);
                        cell = "";
                    } else {
                        cell += char;
                    }
                }
            }
            cells.push(cell);
            return cells;
        });

        return { headers, rows };
    }

    async function handleImportCSVFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file || !selectedConnection || !dbImportTargetDatabase) {
            event.target.value = "";
            return;
        }

        try {
            const content = await file.text();
            const { headers, rows } = parseCSV(content);
            if (headers.length === 0) {
                pushToast("error", "导入失败", "CSV 文件为空或格式错误");
                event.target.value = "";
                return;
            }

            setCsvImportHeaders(headers);
            setCsvImportRows(rows);
            setCsvImportTargetTable("");

            const tree = (await GetExplorerTree({
                connectionId: selectedConnection.id,
                database: dbImportTargetDatabase,
            })) as ExplorerTree;
            const dbNode = tree.databases.find((d) => d.name === dbImportTargetDatabase);
            const tables = dbNode
                ? (dbNode.schemas ? dbNode.schemas.flatMap((s) => s.tables) : dbNode.tables).map((t) => t.name)
                : [];
            setCsvImportTables(tables);
            setCsvImportModalOpen(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : "导入失败";
            pushToast("error", "导入失败", message);
        } finally {
            event.target.value = "";
        }
    }

    async function handleExecuteCSVImport() {
        if (!selectedConnection || !dbImportTargetDatabase || !csvImportTargetTable) {
            pushToast("error", "导入失败", "请选择目标表");
            return;
        }
        if (csvImportRows.length === 0) {
            pushToast("info", "提示", "没有数据需要导入");
            return;
        }

        try {
            setIsImportingDB(true);
            const engine = selectedConnection.engine;
            const qTable = quoteIdentifierForEngine(csvImportTargetTable, engine);
            const qColumns = csvImportHeaders.map((h) => quoteIdentifierForEngine(h, engine)).join(", ");
            let inserted = 0;
            let failed = 0;

            for (const row of csvImportRows) {
                const values = row.map((v) => stringifySQLValueForEngine(v));
                const sql = `INSERT INTO ${qTable} (${qColumns}) VALUES (${values.join(", ")});`;
                try {
                    await ExecuteQuery({
                        connectionId: selectedConnection.id,
                        database: dbImportTargetDatabase,
                        sql,
                        page: 1,
                        pageSize: 1,
                    });
                    inserted++;
                } catch {
                    failed++;
                }
            }

            if (failed > 0) {
                pushToast("info", "导入完成", `成功 ${inserted} 条，失败 ${failed} 条`);
            } else {
                pushToast("success", "导入完成", `成功插入 ${inserted} 条数据`);
            }
            setCsvImportModalOpen(false);
            await loadExplorer(selectedConnection.id, dbImportTargetDatabase);
        } catch (error) {
            const message = error instanceof Error ? error.message : "导入失败";
            pushToast("error", "导入失败", message);
        } finally {
            setIsImportingDB(false);
        }
    }

    useEffect(() => {
        if (!toast) {
            return;
        }

        const timer = window.setTimeout(() => setToast(null), 2400);
        return () => window.clearTimeout(timer);
    }, [toast]);

    useEffect(() => {
        setSelectedResultRowKeys([]);
    }, [queryResult]);

    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }

        if (themeMode === "custom") {
            document.body.dataset.theme = "custom";
            document.documentElement.style.colorScheme = "light";
            // 应用自定义主题样式
            document.documentElement.style.setProperty("--custom-nav-font-size", `${customTheme.navFontSize}px`);
            document.documentElement.style.setProperty("--custom-result-font-size", `${customTheme.resultFontSize}px`);
            document.documentElement.style.setProperty("--custom-font-color", customTheme.fontColor);
            document.documentElement.style.setProperty("--custom-accent-color", customTheme.accentColor);
            document.documentElement.style.setProperty("--custom-background-color", customTheme.backgroundColor);
            if (customTheme.backgroundImage) {
                document.body.dataset.bgImage = "true";
                document.documentElement.style.setProperty("--custom-bg-image", `url(${customTheme.backgroundImage})`);
            } else {
                delete document.body.dataset.bgImage;
                document.documentElement.style.removeProperty("--custom-bg-image");
            }
        } else {
            document.body.dataset.theme = themeMode;
            document.documentElement.style.colorScheme = themeMode;
            // 清除自定义样式
            delete document.body.dataset.bgImage;
            document.documentElement.style.removeProperty("--custom-bg-image");
            document.documentElement.style.removeProperty("--custom-nav-font-size");
            document.documentElement.style.removeProperty("--custom-result-font-size");
            document.documentElement.style.removeProperty("--custom-font-color");
            document.documentElement.style.removeProperty("--custom-accent-color");
            document.documentElement.style.removeProperty("--custom-background-color");
        }
        window.localStorage.setItem(themeStorageKey, themeMode);
    }, [themeMode, customTheme]);

    // Sync SQL editor theme with app theme
    useEffect(() => {
        if (monacoRef.current) {
            const editorTheme = themeMode === "light" ? "sql-compass-sql-light" : "sql-compass-sql-dark";
            monacoRef.current.editor.setTheme(editorTheme);
        }
    }, [themeMode]);

    useEffect(() => {
        if (!tableContextMenu) {
            return;
        }

        const closeMenu = () => setTableContextMenu(null);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setTableContextMenu(null);
            }
        };

        window.addEventListener("click", closeMenu);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("click", closeMenu);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [tableContextMenu]);

    useEffect(() => {
        if (!dbContextMenu) {
            return;
        }

        const closeMenu = () => setDbContextMenu(null);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setDbContextMenu(null);
            }
        };

        window.addEventListener("click", closeMenu);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("click", closeMenu);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [dbContextMenu]);

    useEffect(() => {
        const monaco = monacoRef.current;
        if (!monaco) {
            return;
        }

        completionDisposableRef.current?.dispose();

        const disposable = monaco.languages.registerCompletionItemProvider("sql", {
            // 触发字符：空格、点号、反引号
            triggerCharacters: [" ", ".", "`"],
            provideCompletionItems: (model, position) => {
                try {
                    const word = model.getWordUntilPosition(position);
                    const prefix = word.word.toLowerCase();
                    
                    // 获取光标前的文本用于上下文判断
                    const textUntilPosition = model.getValueInRange({
                        startLineNumber: 1,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                    }).toLowerCase();

                    const tokens = textUntilPosition.trimEnd().split(/\s+/);
                    const prevToken = tokens[tokens.length - 2] ?? "";
                    const currToken = tokens[tokens.length - 1] ?? "";

                    // 上下文检测
                    const afterTableKeyword = /(?:from|join|into|update|table)$/i.test(prevToken || currToken);
                    const afterColumnKeyword = /(?:select|where|and|or|by|on|set|having)$/i.test(prevToken || currToken);

                    // 补全范围
                    const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: prefix ? word.startColumn : position.column,
                        endColumn: position.column,
                    };

                    // 过滤匹配项
                    let filtered = sqlCompletionSpecs;

                    if (prefix && prefix.length >= 1) {
                        filtered = filtered.filter((item) => {
                            const searchStr = [
                                item.label,
                                item.insertText.replace(/`/g, "").replace(/\$\d+/g, ""),
                                item.detail,
                            ].join(" ").toLowerCase();
                            return searchStr.includes(prefix);
                        });
                    }

                    // 根据上下文过滤类型
                    if (afterTableKeyword) {
                        filtered = filtered.filter((item) => item.kind === "table");
                    } else if (afterColumnKeyword) {
                        filtered = filtered.filter((item) =>
                            ["column", "function", "keyword"].includes(item.kind),
                        );
                    }

                    // 排序：前缀匹配优先，然后按类型排序
                    filtered.sort((a, b) => {
                        const aStarts = a.label.toLowerCase().startsWith(prefix);
                        const bStarts = b.label.toLowerCase().startsWith(prefix);
                        if (aStarts !== bStarts) return aStarts ? -1 : 1;
                        const order: Record<string, number> = { table: 0, column: 1, keyword: 2, function: 3 };
                        return (order[a.kind] ?? 99) - (order[b.kind] ?? 99);
                    });

                    // 转换为 Monaco CompletionItem 格式
                    const suggestions = filtered.map((item) => ({
                        label: item.label,
                        kind: item.kind === "table" ? monaco.languages.CompletionItemKind.Class :
                              item.kind === "column" ? monaco.languages.CompletionItemKind.Field :
                              item.kind === "function" ? monaco.languages.CompletionItemKind.Function :
                              monaco.languages.CompletionItemKind.Keyword,
                        insertText: item.insertText,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: item.detail,
                        filterText: `${item.label.toLowerCase()} ${item.insertText.replace(/`/g, "").toLowerCase()}`,
                        sortText: `${item.kind === "table" ? "0" : item.kind === "column" ? "1" : item.kind === "keyword" ? "2" : "3"}-${item.label.toLowerCase()}`,
                        range,
                    }));

                    return { suggestions };
                } catch (e) {
                    // 兜底：返回空列表防止报错
                    return { suggestions: [] };
                }
            },
        });

        completionDisposableRef.current = disposable;

        return () => {
            disposable.dispose();
            completionDisposableRef.current = null;
        };
    }, [monacoReady, sqlCompletionSpecs]);

    useEffect(() => {
        if (browserPreview) {
            const state = loadBrowserWorkspaceState();
            setWorkspaceState(state);
            ai.setAIForm(createAIForm(state));
            setBackendState("浏览器预览模式");
            return;
        }

        refreshWorkspaceState()
            .then(() => {
                setBackendState("桌面后端已连接");
            })
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : "无法读取工作区状态";
                setBackendState(message);
            });
    }, [browserPreview]);

    // 清理已删除连接的残留筛选数据
    useEffect(() => {
        if (workspaceState.connections.length > 0) {
            cleanupFilterSettings(workspaceState.connections.map((c) => c.id));
        }
    }, [workspaceState.connections]);

    useEffect(() => {
        if (workspaceState.connections.length === 0) {
            setSelectedConnectionId("");
            setExplorerTree(null);
            setSelectedDatabase("");
            setSelectedTable("");
            setQueryResult(null);
            setHistoryItems([]);
            return;
        }

        if (selectedConnectionId && !workspaceState.connections.some((item) => item.id === selectedConnectionId)) {
            setSelectedConnectionId("");
            setExplorerTree(null);
            setSelectedDatabase("");
            setSelectedTable("");
            setQueryResult(null);
            setQueryErrorDetail("");
            setHistoryItems([]);
        }
    }, [workspaceState.connections, selectedConnectionId]);

    useEffect(() => {
        if (!selectedConnectionId) {
            return;
        }

        setSelectedDatabase("");
        setSelectedTable("");
        setExplorerTree(null);
        setTableDetail(null);
        schema.setSchemaDraftFields([]);
        setQueryResult(null);
        setQueryErrorDetail("");
        setLastExecutedSQL("");
        setQueryPage(1);
        setPreviewContext(null);
        chat.setChatMessages([]);
        chat.setChatPendingAction(null);
        chat.setChatContextDatabase("");
        chat.setChatContextTables([]);
        setSelectedSnippet(null);

        // 按连接加载独立的筛选记忆
        loadFilterSettingsForConnection(selectedConnectionId);

        // 不自动选中数据库，让用户在左侧树中自行选择
        loadExplorer(selectedConnectionId, "").catch((error: unknown) => {
            const message = getErrorMessage(error);
            setWorkspaceNotice({ tone: "error", message });
        });
        loadHistory(selectedConnectionId).catch((error: unknown) => {
            const message = getErrorMessage(error);
            setWorkspaceNotice({ tone: "error", message });
        });
    }, [selectedConnectionId]);

    useEffect(() => {
        if (!selectedConnectionId || !selectedDatabase || !selectedTable) {
            setTableDetail(null);
            schema.setSchemaDraftFields([]);
            return;
        }

        loadTable(selectedConnectionId, selectedDatabase, selectedTable).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "读取表结构失败";
            schema.setSchemaNotice({ tone: "error", message });
        });
    }, [selectedConnectionId, selectedDatabase, selectedTable]);

    useEffect(() => {
        if (!sqlText.trim()) {
            setSQLAnalysis(null);
            return;
        }

        if (browserPreview) {
            setSQLAnalysis({
                statementType: "PREVIEW",
                riskLevel: "low",
                summary: ["浏览器预览模式不执行真实 SQL"],
                warnings: [],
                requiresConfirm: false,
            });
            return;
        }

        const timer = window.setTimeout(() => {
            AnalyzeSQL(sqlText)
                .then((data) => setSQLAnalysis(data as SQLAnalysis))
                .catch(() => undefined);
        }, 240);

        return () => window.clearTimeout(timer);
    }, [browserPreview, sqlText]);

    useEffect(() => {
        const element = chatStreamRef.current;
        if (!element) {
            return;
        }

        element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }, [chat.chatMessages, chat.isRunningChat, chat.chatPendingAction]);

    useEffect(() => {
        if (!chat.slashMenuOpen) {
            return;
        }

        chat.setSlashMenuPage(0);
        chat.setSlashMenuActiveIndex(0);
    }, [chat.slashMenuFilter, chat.slashMenuOpen, chat.slashMenuType]);

    useEffect(() => {
        if (!chat.slashMenuOpen) {
            return;
        }

        const maxIndex = Math.max(0, chat.pagedSlashMenuItems.length - 1);
        chat.setSlashMenuActiveIndex((current) => clamp(current, 0, maxIndex));
    }, [chat.pagedSlashMenuItems, chat.slashMenuOpen]);

    function handleSelectDatabase(databaseName: string) {
        setSelectedDatabase(databaseName);
        chat.setChatContextDatabase(databaseName);
        chat.setChatContextTables([]);
        setTableSearch("");
        setSelectedTable("");
        setTableDetail(null);
        schema.setSchemaDraftFields([]);
        setLastExecutedSQL("");
        setPreviewContext(null);
        setTableContextMenu(null);
        setTablePageByDatabase((current) => ({
            ...current,
            [databaseName]: current[databaseName] ?? 1,
        }));
        setExpandedDatabases((current) => ({
            ...current,
            [databaseName]: true,
        }));

        if (selectedConnectionId && !browserPreview) {
            loadExplorer(selectedConnectionId, databaseName).catch(() => undefined);
        }
    }

    async function handlePreviewTableWithSize(databaseName: string, tableName: string, nextPage = 1, pageSize = queryPageSize) {
        if (!selectedConnection) {
            setWorkspaceNotice({ tone: "error", message: "请先选择连接。" });
            return;
        }
        if (workMode === "chat") {
            setChatBlockerModalOpen(true);
            return;
        }

        try {
            setIsExecutingQuery(true);
            setSelectedDatabase(databaseName);
            setSelectedTable(tableName);
            setActivePage("query");
            setSQLEditorCollapsed(true);
            setSelectedSnippet(null);
            setTableContextMenu(null);
            setExpandedDatabases((current) => ({
                ...current,
                [databaseName]: true,
            }));
            const result = (await PreviewTableData({
                connectionId: selectedConnection.id,
                database: databaseName,
                table: tableName,
                page: nextPage,
                pageSize: pageSize,
            })) as QueryResult;
            setPreviewContext({
                connectionId: selectedConnection.id,
                database: databaseName,
                table: tableName,
            });
            setQueryResult(result);
            setQueryErrorDetail("");
            setLastExecutedSQL("");
            setQueryPage(nextPage);
            setSQLAnalysis(result.analysis);
            setQueryNotice(null);
        } catch (error) {
            const message = getErrorMessage(error);
            setQueryResult(null);
            setQueryErrorDetail(message);
            setQueryNotice({ tone: "error", message });
        } finally {
            setIsExecutingQuery(false);
        }
    }

    async function handlePreviewTable(databaseName: string, tableName: string, nextPage = 1) {
        return handlePreviewTableWithSize(databaseName, tableName, nextPage, queryPageSize);
    }

    async function runSQLWithSize(statement: string, nextPage = 1, pageSize = queryPageSize) {
        if (!selectedConnection) {
            setQueryNotice({ tone: "error", message: "请先选择一个连接。" });
            return;
        }

        try {
            setIsExecutingQuery(true);
            const result = (await ExecuteQuery({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                sql: statement,
                page: nextPage,
                pageSize: pageSize,
            })) as QueryResult;
            setPreviewContext(null);
            setQueryPage(nextPage);
            setQueryResult(result);
            setLastExecutedSQL(statement);
            setQueryErrorDetail("");
            setSQLAnalysis(result.analysis);
            setQueryNotice({ tone: "success", message: result.message });
            await loadHistory(selectedConnection.id);
            const nonMutatingTypes = ["SELECT", "META", "PREVIEW", "REDIS", "REDIS_KEY"];
            if (!nonMutatingTypes.includes(result.statementType)) {
                await loadExplorer(selectedConnection.id, selectedDatabase);
            }
        } catch (error) {
            const message = getErrorMessage(error);
            setQueryResult(null);
            setQueryErrorDetail(message);
            setQueryNotice({ tone: "error", message });
        } finally {
            setIsExecutingQuery(false);
        }
    }

    async function runSQL(statement: string, nextPage = 1) {
        return runSQLWithSize(statement, nextPage, queryPageSize);
    }

    function openTableDesigner(databaseName: string, tableName: string) {
        if (workMode === "chat") {
            setChatBlockerModalOpen(true);
            setTableContextMenu(null);
            return;
        }
        setSelectedDatabase(databaseName);
        setSelectedTable(tableName);
        setActivePage("schema");
        setPreviewContext(null);
        setExpandedDatabases((current) => ({
            ...current,
            [databaseName]: true,
        }));
        setTableContextMenu(null);
    }

    function syncSelectedSnippet() {
        const editor = sqlEditorRef.current;
        const model = editor?.getModel();
        const selection = editor?.getSelection();
        if (!editor || !model || !selection || selection.isEmpty()) {
            setSelectedSnippet(null);
            return;
        }

        const text = model.getValueInRange(selection);
        if (!text.trim()) {
            setSelectedSnippet(null);
            return;
        }

        const start = model.getOffsetAt(selection.getStartPosition());
        const end = model.getOffsetAt(selection.getEndPosition());
        const visiblePosition = editor.getScrolledVisiblePosition(selection.getEndPosition());
        const layoutInfo = editor.getLayoutInfo();
        const anchorLeft = visiblePosition ? Math.min(visiblePosition.left + 24, layoutInfo.contentWidth - 12) : 24;
        const anchorTop = visiblePosition ? visiblePosition.top + visiblePosition.height + 8 : 24;

        setSelectedSnippet({
            text,
            start,
            end,
            anchorTop,
            anchorLeft,
        });
    }

    function handleEditorDidMount(editor: MonacoEditorNS.IStandaloneCodeEditor, monaco: Monaco) {
        sqlEditorRef.current = editor;
        monacoRef.current = monaco;
        setMonacoReady(true);

        // Dark SQL editor theme
        monaco.editor.defineTheme("sql-compass-sql-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [
                { token: "keyword", foreground: "7aa2ff", fontStyle: "bold" },
                { token: "number", foreground: "f0b36a" },
                { token: "string", foreground: "85d6a5" },
                { token: "comment", foreground: "6f85a8", fontStyle: "italic" },
            ],
            colors: {
                "editor.background": "#0b1220",
                "editorLineNumber.foreground": "#5a6f91",
                "editorLineNumber.activeForeground": "#cdd8f3",
                "editor.selectionBackground": "#1f4fd14f",
                "editor.inactiveSelectionBackground": "#1f4fd12b",
                "editorCursor.foreground": "#dce7ff",
            },
        });

        // Light SQL editor theme — soft, muted, comfortable
        monaco.editor.defineTheme("sql-compass-sql-light", {
            base: "vs",
            inherit: true,
            rules: [
                { token: "keyword", foreground: "3a6ea5", fontStyle: "bold" },
                { token: "number", foreground: "b07830" },
                { token: "string", foreground: "488068" },
                { token: "comment", foreground: "93a3bc", fontStyle: "italic" },
            ],
            colors: {
                "editor.background": "#f9fafb",
                "editorLineNumber.foreground": "#c0c8d0",
                "editorLineNumber.activeForeground": "#5a6a80",
                "editor.selectionBackground": "#b8d4f050",
                "editor.inactiveSelectionBackground": "#b8d4f028",
                "editorCursor.foreground": "#2d5a8a",
            },
        });

        // Apply theme based on current mode
        monaco.editor.setTheme(themeMode === "light" ? "sql-compass-sql-light" : "sql-compass-sql-dark");

        // 使用 addAction 替代 addCommand，更可靠地绑定快捷键
        editor.addAction({
            id: "sql-execute-query",
            label: "执行 SQL 查询",
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
            run: () => {
                const currentSelection = editor.getSelection();
                const model = editor.getModel();
                if (currentSelection && !currentSelection.isEmpty() && model) {
                    // 直接从编辑器获取选中文本，不依赖状态
                    const selectedText = model.getValueInRange(currentSelection);
                    if (selectedText.trim()) {
                        runSQL(selectedText, 1).catch(() => undefined);
                        return;
                    }
                }
                handleExecuteQuery(1).catch(() => undefined);
            },
        });

        // 强制开启自动建议（Wails 环境下可能需要）
        editor.updateOptions({ quickSuggestionsDelay: 100 });

        editor.onDidChangeCursorSelection(() => syncSelectedSnippet());
        editor.onDidScrollChange(() => syncSelectedSnippet());

        // 检查光标所在行是否以分号结尾
        function isCurrentLineEndsWithSemicolon(): boolean {
            const model = editor.getModel();
            const position = editor.getPosition();
            if (!model || !position) return false;
            const lineContent = model.getLineContent(position.lineNumber);
            return lineContent.trim().endsWith(";");
        }

        // 监听按键，在输入字母时主动触发补全
        editor.onKeyDown((e) => {
            const key = e.browserEvent.key;
            if (key.length === 1 && /[a-zA-Z]/.test(key)) {
                window.setTimeout(() => {
                    if (editor && editor.hasTextFocus() && !isCurrentLineEndsWithSemicolon()) {
                        editor.trigger("keyboard", "editor.action.triggerSuggest", {});
                    }
                }, 80);
            }
        });

        // 内容变化时也触发（但跳过以分号结尾的行）
        editor.onDidChangeModelContent(() => {
            if (editor.hasTextFocus() && !isCurrentLineEndsWithSemicolon()) {
                setTimeout(() => {
                    editor.trigger("keyboard", "editor.action.triggerSuggest", {});
                }, 60);
            }
        });
    }

    async function handleExecuteQuery(nextPage = 1) {
        return runSQL(sqlText, nextPage);
    }

    async function handleExecuteSelectedSQL() {
        if (!selectedSnippet?.text.trim()) {
            return;
        }

        return runSQL(selectedSnippet.text, 1);
    }

    function applySelectedSnippetResult(result: SQLOptimizeResult, successMessage: string) {
        if (!selectedSnippet) {
            return;
        }

        const nextText = `${sqlText.slice(0, selectedSnippet.start)}${result.sql}${sqlText.slice(selectedSnippet.end)}`;
        const nextStart = selectedSnippet.start;
        const nextEnd = selectedSnippet.start + result.sql.length;
        setSQLText(nextText);
        setSQLAnalysis(result.analysis);
        setQueryErrorDetail("");
        setQueryNotice({
            tone: "success",
            message: successMessage,
        });
        setSelectedSnippet({
            text: result.sql,
            start: nextStart,
            end: nextEnd,
            anchorTop: selectedSnippet.anchorTop,
            anchorLeft: selectedSnippet.anchorLeft,
        });

        window.requestAnimationFrame(() => {
            const editor = sqlEditorRef.current;
            const model = editor?.getModel();
            if (!editor || !model) {
                return;
            }

            editor.focus();
            const startPosition = model.getPositionAt(nextStart);
            const endPosition = model.getPositionAt(nextEnd);
            editor.setSelection({
                startLineNumber: startPosition.lineNumber,
                startColumn: startPosition.column,
                endLineNumber: endPosition.lineNumber,
                endColumn: endPosition.column,
            });
        });
    }

    async function handleBeautifySQL() {
        if (!selectedConnection || !sqlText.trim()) {
            return;
        }

        try {
            setIsOptimizingSQL(true);
            const result = (await BeautifySQL({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                sql: sqlText,
                prompt: "",
            })) as SQLOptimizeResult;
            setSQLText(result.sql);
            setSQLAnalysis(result.analysis);
            setQueryErrorDetail("");
            setSelectedSnippet(null);
            setQueryNotice({ tone: "success", message: "SQL 已美化并回填到编辑器。" });
        } catch (error) {
            const message = getErrorMessage(error);
            setQueryNotice({ tone: "error", message });
        } finally {
            setIsOptimizingSQL(false);
        }
    }

    async function handleOptimizeSQL() {
        return requestOptimizeSQL("full", sqlText);
    }

    async function handleBeautifySelectedSQL() {
        if (!selectedConnection || !selectedSnippet?.text.trim()) {
            return;
        }

        try {
            setIsOptimizingSQL(true);
            const result = (await BeautifySQL({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                sql: selectedSnippet.text,
                prompt: "",
            })) as SQLOptimizeResult;
            applySelectedSnippetResult(result, "已美化选中的 SQL 片段。");
        } catch (error) {
            const message = getErrorMessage(error);
            setQueryNotice({ tone: "error", message });
        } finally {
            setIsOptimizingSQL(false);
        }
    }

    async function handleOptimizeSelectedSQL() {
        return requestOptimizeSQL("selection", selectedSnippet?.text ?? "");
    }

    async function requestOptimizeSQL(target: "full" | "selection", sql: string, prompt = "") {
        if (!selectedConnection || !sql.trim()) {
            return;
        }

        try {
            setIsOptimizingSQL(true);
            const result = (await OptimizeSQL({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                sql,
                prompt,
                table: selectedTable,
            })) as SQLOptimizeResult;
            setOptimizeReview({
                target,
                sql: result.sql,
                reasoning: result.reasoning || "AI 已检查语义、语法和结构，并尽量在不扩大影响范围的前提下做优化。",
                prompt: result.promptUsed || prompt,
                analysis: result.analysis,
            });
        } catch (error) {
            const message = getErrorMessage(error);
            setQueryNotice({ tone: "error", message });
        } finally {
            setIsOptimizingSQL(false);
        }
    }

    function handleApplyOptimizeReview() {
        if (!optimizeReview) {
            return;
        }

        const result: SQLOptimizeResult = {
            sql: optimizeReview.sql,
            analysis: optimizeReview.analysis,
            source: "ai",
            reasoning: optimizeReview.reasoning,
            promptUsed: optimizeReview.prompt,
        };

        if (optimizeReview.target === "selection") {
            applySelectedSnippetResult(result, "AI 优化结果已回填到选中 SQL。");
        } else {
            setSQLText(result.sql);
            setSQLAnalysis(result.analysis);
            setQueryErrorDetail("");
            setSelectedSnippet(null);
            setQueryNotice({ tone: "success", message: "AI 优化结果已回填到编辑器。" });
        }

        setOptimizeReview(null);
    }

    async function handleRetryOptimizeReview() {
        if (!optimizeReview) {
            return;
        }

        const originalSQL = optimizeReview.target === "selection" ? selectedSnippet?.text ?? optimizeReview.sql : sqlText;
        await requestOptimizeSQL(optimizeReview.target, originalSQL, optimizeReview.prompt);
    }

    async function handleExportQuerySQL() {
        if (selectedResultRows.length > 0 && queryResult && selectedTable) {
            const sql = buildInsertStatement(selectedTable, queryResult.columns, selectedResultRows);
            await exportTextFile("sql", `selected-rows-${Date.now()}.sql`, sql, `导出 ${selectedResultRows.length} 条选中记录的插入语句`);
            return;
        }

        if (!queryResult?.effectiveSql.trim()) {
            setTransferNotice({ tone: "info", message: "当前没有可导出的 SQL。" });
            return;
        }

        await exportTextFile("sql", `query-${Date.now()}.sql`, queryResult.effectiveSql, "导出查询 SQL");
    }

    async function handleExportQueryCSV() {
        if (!queryResult || queryResult.rows.length === 0) {
            setTransferNotice({ tone: "info", message: "当前没有查询结果可导出。" });
            return;
        }

        const csv = csvFromRows(queryResult.columns, queryResult.rows);
        await exportTextFile("csv", `query-result-${Date.now()}.csv`, csv, "导出查询结果 CSV");
    }

    async function handleExportQueryExcel() {
        if (!queryResult || queryResult.rows.length === 0) {
            setTransferNotice({ tone: "info", message: "当前没有查询结果可导出。" });
            return;
        }

        const workbook = excelFromRows(selectedTable || "query_result", queryResult.columns, queryResult.rows);
        await exportTextFile("xls", `query-result-${Date.now()}.xls`, workbook, "导出查询结果 Excel");
    }

    async function handleExportSelectedRows() {
        if (!queryResult || selectedResultRows.length === 0) {
            setQueryNotice({ tone: "info", message: "请先勾选需要导出的结果行。" });
            return;
        }

        const csv = csvFromRows(queryResult.columns, selectedResultRows);
        await exportTextFile("csv", `selected-rows-${Date.now()}.csv`, csv, "导出选中结果");
    }

    function handleToggleResultRow(rowKey: string) {
        setSelectedResultRowKeys((current) =>
            current.includes(rowKey) ? current.filter((item) => item !== rowKey) : [...current, rowKey],
        );
    }

    function handleToggleAllResultRows() {
        if (!queryResult) {
            return;
        }

        setSelectedResultRowKeys(allVisibleRowsSelected ? [] : resultRowKeys);
    }

    function handleCopySQL() {
        if (selectedResultRows.length > 0 && queryResult && selectedTable) {
            const sql = buildInsertStatement(selectedTable, queryResult.columns, selectedResultRows);
            copyText(sql)
                .then(() => pushToast("success", "已复制 SQL", `已复制 ${selectedResultRows.length} 条选中记录的插入语句`))
                .catch(() => pushToast("error", "复制失败", "请稍后重试"));
            return;
        }

        if (!queryResult?.effectiveSql.trim()) {
            setQueryNotice({ tone: "info", message: "当前没有可复制的 SQL。" });
            return;
        }

        copyText(queryResult.effectiveSql)
            .then(() => pushToast("success", "已复制 SQL", "实际执行语句已复制到剪贴板"))
            .catch(() => pushToast("error", "复制失败", "请稍后重试"));
    }

    function buildDeleteStatement(rows: Record<string, string>[]): string {
        return `DELETE FROM \`${selectedTable}\`\nWHERE\n${rows
            .map((row) => `  (${primaryFieldNames.map((fieldName) => `\`${fieldName}\` = ${stringifyResultSQLValue(row[fieldName] ?? "")}`).join(" AND ")})`)
            .join("\n  OR\n")};`;
    }

    function handleRequestDeleteSelectedRows() {
        if (!queryResult || selectedResultRows.length === 0) {
            setQueryNotice({ tone: "info", message: "请先勾选要删除的数据行。" });
            return;
        }

        if (!primaryFieldNames.length) {
            setQueryNotice({ tone: "error", message: "当前表没有主键，暂时无法安全删除选中项。" });
            return;
        }

        const missingFields = primaryFieldNames.filter((fieldName) => !queryResult.columns.includes(fieldName));
        if (missingFields.length > 0) {
            setQueryNotice({ tone: "error", message: `结果集缺少主键字段：${missingFields.join("、")}，无法删除。` });
            return;
        }

        setDeleteDialog({
            statement: buildDeleteStatement(selectedResultRows),
            count: selectedResultRows.length,
        });
    }

    async function handleConfirmDeleteSelectedRows() {
        if (!deleteDialog || !selectedConnection || !selectedDatabase || !selectedTable) {
            return;
        }

        try {
            setDeleteDialog(null);
            await runSQL(deleteDialog.statement, 1);
            await loadExplorer(selectedConnection.id, selectedDatabase);
            await handlePreviewTable(selectedDatabase, selectedTable, 1);
            pushToast("success", "删除完成", `已删除 ${deleteDialog.count} 项`);
        } catch (error) {
            const message = getErrorMessage(error);
            setQueryNotice({ tone: "error", message });
        }
    }

    async function handleFillTableData() {
        if (!selectedConnection || !selectedDatabase || !selectedTable) {
            setQueryNotice({ tone: "info", message: "请先选择连接、数据库和数据表。" });
            return;
        }
        try {
            setIsFillingTable(true);
            const result = (await FillTableData({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                table: selectedTable,
                count: 100,
            })) as { success: boolean; message: string; insertedRows: number };
            if (result.success) {
                pushToast("success", "填充完成", result.message);
                await handlePreviewTable(selectedDatabase, selectedTable, 1);
                await loadExplorer(selectedConnection.id, selectedDatabase);
            } else {
                setQueryNotice({ tone: "error", message: result.message });
            }
        } catch (error) {
            const message = getErrorMessage(error);
            setQueryNotice({ tone: "error", message });
        } finally {
            setIsFillingTable(false);
        }
    }

    async function handleSmartFillTableData() {
        if (!selectedConnection || !selectedDatabase || !selectedTable) {
            setQueryNotice({ tone: "info", message: "请先选择连接、数据库和数据表。" });
            return;
        }
        try {
            setIsSmartFillingTable(true);
            const result = (await SmartFillTableData({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                table: selectedTable,
                count: 10,
            })) as { success: boolean; message: string; insertedRows: number; sqls: string[] };
            if (result.success) {
                pushToast("success", "AI 智能填充完成", result.message);
                await handlePreviewTable(selectedDatabase, selectedTable, 1);
                await loadExplorer(selectedConnection.id, selectedDatabase);
            } else {
                setQueryNotice({ tone: "error", message: result.message });
            }
        } catch (error) {
            const message = getErrorMessage(error);
            setQueryNotice({ tone: "error", message });
        } finally {
            setIsSmartFillingTable(false);
        }
    }

    async function handleCreateDatabase() {
        if (!selectedConnection || !createDBForm.name.trim()) {
            return;
        }
        try {
            setIsCreatingDB(true);
            const result = (await CreateDatabase({
                connectionId: selectedConnection.id,
                databaseName: createDBForm.name.trim(),
                charset: createDBForm.charset,
                collation: createDBForm.collation,
            })) as { success: boolean; message: string };
            if (result.success) {
                pushToast("success", "创建成功", result.message);
                setShowCreateDBModal(false);
                const resetEngine = selectedConnection?.engine ?? "mysql";
                setCreateDBForm(resetEngine === "postgresql" ? { name: "", charset: "UTF8", collation: "" } : resetEngine === "clickhouse" ? { name: "", charset: "", collation: "" } : { name: "", charset: "utf8mb4", collation: "utf8mb4_unicode_ci" });
                await loadExplorer(selectedConnection.id);
            } else {
                setWorkspaceNotice({ tone: "error", message: result.message });
            }
        } catch (error) {
            const message = getErrorMessage(error);
            setWorkspaceNotice({ tone: "error", message });
        } finally {
            setIsCreatingDB(false);
        }
    }

    function openCreateTablePage(databaseName: string) {
        setSelectedDatabase(databaseName);
        setSelectedTable("");
        setActivePage("create-table");
        setTableContextMenu(null);
        setDbContextMenu(null);
        schema.setSchemaDraftFields([]);
    }

    return (
        <>
            {showSplash && <SplashScreen />}
            <div className={`studio-shell${sidebarCollapsed ? " studio-shell--collapsed" : ""}`}>
                <FloatingToast toast={toast} />
                <Sidebar
                    sidebarCollapsed={sidebarCollapsed}
                    setSidebarCollapsed={setSidebarCollapsed}
                    sidebarView={sidebarView}
                    setSidebarView={setSidebarView}
                    selectedConnection={selectedConnection}
                    workMode={workMode}
                    setWorkMode={setWorkMode}
                    showDatabaseFilter={showDatabaseFilter}
                    setShowDatabaseFilter={setShowDatabaseFilter}
                    showTableFilter={showTableFilter}
                    setShowTableFilter={setShowTableFilter}
                    selectedDatabase={selectedDatabase}
                    explorerTree={explorerTree}
                    databaseFilter={databaseFilter}
                    setDatabaseFilter={setDatabaseFilter}
                    tableFilter={tableFilter}
                    setTableFilter={setTableFilter}
                    tableSearch={tableSearch}
                    setTableSearch={setTableSearch}
                    tablePageByDatabase={tablePageByDatabase}
                    setTablePageByDatabase={setTablePageByDatabase}
                    expandedDatabases={expandedDatabases}
                    setExpandedDatabases={setExpandedDatabases}
                    selectedTable={selectedTable}
                    handleSelectDatabase={handleSelectDatabase}
                    handlePreviewTable={handlePreviewTable}
                    tableContextMenu={tableContextMenu}
                    setTableContextMenu={setTableContextMenu}
                    openTableDesigner={openTableDesigner}
                    pushToast={pushToast}
                    activePage={activePage}
                    setActivePage={setActivePage}
                    saveFilterSettings={saveFilterSettings}
                    setShowCreateDBModal={setShowCreateDBModal}
                    setCreateDBForm={setCreateDBForm}
                    dbContextMenu={dbContextMenu}
                    setDbContextMenu={setDbContextMenu}
                    openCreateTablePage={openCreateTablePage}
                    redisCursorHistoryByDatabase={redisCursorHistoryByDatabase}
                    handleBrowseRedisKeys={handleBrowseRedisKeys}
                    onExportDatabaseStructure={handleExportDatabaseStructure}
                    onExportDatabaseStructureAndData={handleExportDatabaseStructureAndData}
                    onImportSQLToDatabase={handleImportSQLToDatabase}
                    onImportCSVToDatabase={handleImportCSVToDatabase}
                    onTruncateTable={handleTruncateTable}
                    onDropTable={handleDropTable}
                />

            <main className="workbench">
                <div className="workbench-body">
                    <NoticeBanner notice={workspaceNotice} />
                    <WorkbenchRouter
                        workMode={workMode}
                        activePage={activePage}
                        selectedConnection={selectedConnection}
                        chatDisplayMode={chat.chatDisplayMode}
                        setChatDisplayMode={chat.setChatDisplayMode}
                        chatStreamRef={chatStreamRef}
                        chatMessages={chat.chatMessages}
                        isRunningChat={chat.isRunningChat}
                        handleCopyUserMessage={chat.handleCopyUserMessage}
                        handleEditUserMessage={chat.handleEditUserMessage}
                        handleCopyText={chat.handleCopyText}
                        handleCopyChatResult={chat.handleCopyChatResult}
                        handleCopyChatMessage={chat.handleCopyChatMessage}
                        chatPendingAction={chat.chatPendingAction}
                        setChatPendingAction={chat.setChatPendingAction}
                        executeChatSQL={chat.executeChatSQL}
                        isExecutingQuery={isExecutingQuery}
                        chatDropActive={chat.chatDropActive}
                        setChatDropActive={chat.setChatDropActive}
                        chatContextDatabase={chat.chatContextDatabase}
                        setChatContextDatabase={chat.setChatContextDatabase}
                        chatContextTables={chat.chatContextTables}
                        setChatContextTables={chat.setChatContextTables}
                        chatInput={chat.chatInput}
                        setChatInput={chat.setChatInput}
                        handleSendChatMessage={chat.handleSendChatMessage}
                        handleChatInputChange={chat.handleChatInputChange}
                        handleSlashSelect={chat.handleSlashSelect}
                        handleChatDrop={chat.handleChatDrop}
                        slashMenuOpen={chat.slashMenuOpen}
                        slashMenuItems={chat.slashMenuItems}
                        slashMenuTotalPages={chat.slashMenuTotalPages}
                        slashMenuPageSafe={chat.slashMenuPageSafe}
                        pagedSlashMenuItems={chat.pagedSlashMenuItems}
                        slashMenuActiveIndex={chat.slashMenuActiveIndex}
                        setSlashMenuPage={chat.setSlashMenuPage}
                        setSlashMenuActiveIndex={chat.setSlashMenuActiveIndex}
                        setSlashMenuOpen={chat.setSlashMenuOpen}
                        slashMenuType={chat.slashMenuType}
                        connectionNotice={conn.connectionNotice}
                        workspaceState={workspaceState}
                        selectedConnectionId={selectedConnectionId}
                        connectionDraft={conn.connectionDraft}
                        setConnectionDraft={conn.setConnectionDraft}
                        showPassword={conn.showPassword}
                        setShowPassword={conn.setShowPassword}
                        connectionTest={conn.connectionTest}
                        isTestingConnection={conn.isTestingConnection}
                        isSavingConnection={conn.isSavingConnection}
                        handleSelectConnection={conn.handleSelectConnection}
                        fillConnectionDraft={conn.fillConnectionDraft}
                        handleDeleteConnection={conn.handleDeleteConnection}
                        handleTestConnection={conn.handleTestConnection}
                        handleSaveConnection={conn.handleSaveConnection}
                        resetConnectionForm={conn.resetConnectionForm}
                        updateConnectionField={conn.updateConnectionField}
                        pushToast={pushToast}
                        isOptimizingSQL={isOptimizingSQL}
                        sqlText={sqlText}
                        queryNotice={queryNotice}
                        sqlEditorCollapsed={sqlEditorCollapsed}
                        setSQLEditorCollapsed={setSQLEditorCollapsed}
                        selectedSnippet={selectedSnippet}
                        setSelectedSnippet={setSelectedSnippet}
                        handleExecuteSelectedSQL={handleExecuteSelectedSQL}
                        handleBeautifySelectedSQL={handleBeautifySelectedSQL}
                        handleOptimizeSelectedSQL={handleOptimizeSelectedSQL}
                        handleEditorDidMount={handleEditorDidMount}
                        setSQLText={setSQLText}
                        queryErrorDetail={queryErrorDetail}
                        setQueryErrorDetail={setQueryErrorDetail}
                        queryResult={queryResult}
                        queryPageSize={queryPageSize}
                        setQueryPageSize={setQueryPageSize}
                        previewContext={previewContext}
                        handlePreviewTableWithSize={handlePreviewTableWithSize}
                        handlePreviewTable={handlePreviewTable}
                        runSQLWithSize={runSQLWithSize}
                        runSQL={runSQL}
                        lastExecutedSQL={lastExecutedSQL}
                        queryPage={queryPage}
                        hasNextQueryPage={hasNextQueryPage}
                        jumpPageInput={jumpPageInput}
                        setJumpPageInput={setJumpPageInput}
                        selectedResultRows={selectedResultRows}
                        allVisibleRowsSelected={allVisibleRowsSelected}
                        handleToggleAllResultRows={handleToggleAllResultRows}
                        handleToggleResultRow={handleToggleResultRow}
                        selectedResultRowKeys={selectedResultRowKeys}
                        buildRowSelectionKey={buildRowSelectionKey}
                        tableDetail={tableDetail}
                        openCellEditor={cellEditorHook.openCellEditor}
                        handleCopySQL={handleCopySQL}
                        handleExportQuerySQL={handleExportQuerySQL}
                        handleExportQueryCSV={handleExportQueryCSV}
                        handleExportQueryExcel={handleExportQueryExcel}
                        handleExportSelectedRows={handleExportSelectedRows}
                        isExporting={isExporting}
                        canDeleteSelectedRows={canDeleteSelectedRows}
                        handleRequestDeleteSelectedRows={handleRequestDeleteSelectedRows}
                        queryPageSizeOptions={QUERY_PAGE_SIZE_OPTIONS}
                        handleExecuteQuery={handleExecuteQuery}
                        selectedDatabase={selectedDatabase}
                        selectedTable={selectedTable}
                        handleFillTableData={handleFillTableData}
                        isFillingTable={isFillingTable}
                        handleSmartFillTableData={handleSmartFillTableData}
                        isSmartFillingTable={isSmartFillingTable}
                        historyItems={historyItems}
                        setHistoryItems={setHistoryItems}
                        historyPage={historyPage}
                        setHistoryPage={setHistoryPage}
                        setPreviewContext={setPreviewContext}
                        setExpandedDatabases={setExpandedDatabases}
                        setSelectedTable={setSelectedTable}
                        setActivePage={setActivePage}
                        setSidebarView={setSidebarView}
                        setQueryNotice={setQueryNotice}
                        schemaNotice={schema.schemaNotice}
                        schemaDraftFields={schema.schemaDraftFields}
                        mysqlTypeOptions={schema.mysqlTypeOptions}
                        updateDraftField={schema.updateDraftField}
                        applyFieldSuggestion={schema.applyFieldSuggestion}
                        handleGenerateFieldComment={schema.handleGenerateFieldComment}
                        handleDeleteDraftField={schema.handleDeleteDraftField}
                        handleAddField={schema.handleAddField}
                        setRenameModalOpen={schema.setRenameModalOpen}
                        handleExportDDL={schema.handleExportDDL}
                        handleCopyDDL={schema.handleCopyDDL}
                        currentAlterSQL={schema.currentAlterSQL}
                        renameModalOpen={schema.renameModalOpen}
                        renameTableName={schema.renameTableName}
                        setRenameTableName={schema.setRenameTableName}
                        handleRenameTable={schema.handleRenameTable}
                        isRenamingTable={schema.isRenamingTable}
                        schemaDraftIndexes={schema.schemaDraftIndexes}
                        handleAddIndex={schema.handleAddIndex}
                        handleDeleteDraftIndex={schema.handleDeleteDraftIndex}
                        updateDraftIndex={schema.updateDraftIndex}
                        handleGenerateIndexName={schema.handleGenerateIndexName}
                        aiConfigured={workspaceState.ai.apiKeyConfigured}
                        handleSaveFields={schema.handleSaveFields}
                        isSavingFields={schema.isSavingFields}
                        handleSaveIndexes={schema.handleSaveIndexes}
                        isSavingIndexes={schema.isSavingIndexes}
                        aiNotice={ai.aiNotice}
                        aiForm={ai.aiForm}
                        setAIForm={ai.setAIForm}
                        isSavingAI={ai.isSavingAI}
                        handleSaveAISettings={ai.handleSaveAISettings}
                        handleClearAPIKey={ai.handleClearAPIKey}
                        workspaceStateAI={workspaceState.ai}
                        selectedConnectionName={selectedConnection?.name || ""}
                        themeMode={themeMode}
                        setThemeMode={setThemeMode}
                        customTheme={customTheme}
                        setCustomTheme={setCustomTheme}
                        browserPreview={browserPreview}
                        newStoragePath={newStoragePath}
                        setNewStoragePath={setNewStoragePath}
                        storageInfo={storageInfo}
                        setStorageInfo={setStorageInfo}
                        showPermissionModal={showPermissionModal}
                        setShowPermissionModal={setShowPermissionModal}
                        showClearModal={showClearModal}
                        setShowClearModal={setShowClearModal}
                        refreshWorkspaceState={refreshWorkspaceState}
                        handleSelectDatabase={handleSelectDatabase}
                        loadExplorer={loadExplorer}
                    />
                </div>
            </main>

            <OptimizeReviewModal
                optimizeReview={optimizeReview}
                setOptimizeReview={setOptimizeReview}
                isOptimizingSQL={isOptimizingSQL}
                handleRetryOptimizeReview={handleRetryOptimizeReview}
                handleApplyOptimizeReview={handleApplyOptimizeReview}
            />

            <CellEditorModal
                cellEditor={cellEditorHook.cellEditor}
                setCellEditor={cellEditorHook.setCellEditor}
                isSavingCell={cellEditorHook.isSavingCell}
                handleConfirmCellEdit={cellEditorHook.handleConfirmCellEdit}
                pushToast={pushToast}
            />

            <DeleteDialogModal
                deleteDialog={deleteDialog}
                setDeleteDialog={setDeleteDialog}
                isExecutingQuery={isExecutingQuery}
                handleConfirmDeleteSelectedRows={handleConfirmDeleteSelectedRows}
            />

            {showCreateDBModal ? (
                <div className="modal-backdrop" onClick={() => setShowCreateDBModal(false)}>
                    <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>新建数据库</h3>
                                <p>在当前连接中创建一个新的{selectedConnection?.engine === "clickhouse" ? "ClickHouse" : selectedConnection?.engine === "postgresql" ? "PostgreSQL" : "MySQL"}数据库。</p>
                            </div>
                        </div>
                        <label className="field">
                            <span>数据库名称</span>
                            <input
                                value={createDBForm.name}
                                onChange={(event) => setCreateDBForm((current) => ({ ...current, name: event.target.value }))}
                                placeholder="例如：my_new_db"
                            />
                        </label>
                        {selectedConnection?.engine !== "clickhouse" && (
                            <label className="field">
                                <span>{selectedConnection?.engine === "postgresql" ? "编码" : "字符集"}</span>
                                <select
                                    value={createDBForm.charset}
                                    onChange={(event) => setCreateDBForm((current) => ({ ...current, charset: event.target.value }))}
                                >
                                    {selectedConnection?.engine === "postgresql" ? (
                                        <>
                                            <option value="UTF8">UTF8</option>
                                            <option value="LATIN1">LATIN1</option>
                                            <option value="EUC_JP">EUC_JP</option>
                                            <option value="EUC_CN">EUC_CN</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="utf8mb4">utf8mb4</option>
                                            <option value="utf8">utf8</option>
                                            <option value="latin1">latin1</option>
                                            <option value="gbk">gbk</option>
                                        </>
                                    )}
                                </select>
                            </label>
                        )}
                        {selectedConnection?.engine === "clickhouse" && (
                            <label className="field">
                                <span>引擎</span>
                                <select
                                    value={createDBForm.charset}
                                    onChange={(event) => setCreateDBForm((current) => ({ ...current, charset: event.target.value }))}
                                >
                                    <option value="">默认 (Atomic)</option>
                                    <option value="Ordinary">Ordinary</option>
                                    <option value="Lazy">Lazy</option>
                                    <option value="Replicated">Replicated</option>
                                </select>
                            </label>
                        )}
                        {selectedConnection?.engine !== "clickhouse" && (
                            <label className="field">
                                <span>排序规则</span>
                                <select
                                    value={createDBForm.collation}
                                    onChange={(event) => setCreateDBForm((current) => ({ ...current, collation: event.target.value }))}
                                >
                                    {selectedConnection?.engine === "postgresql" ? (
                                        <>
                                            <option value="">默认</option>
                                            <option value="en_US.UTF-8">en_US.UTF-8</option>
                                            <option value="zh_CN.UTF-8">zh_CN.UTF-8</option>
                                            <option value="C">C</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="utf8mb4_unicode_ci">utf8mb4_unicode_ci</option>
                                            <option value="utf8mb4_general_ci">utf8mb4_general_ci</option>
                                            <option value="utf8mb4_bin">utf8mb4_bin</option>
                                            <option value="utf8_unicode_ci">utf8_unicode_ci</option>
                                            <option value="utf8_general_ci">utf8_general_ci</option>
                                            <option value="latin1_swedish_ci">latin1_swedish_ci</option>
                                        </>
                                    )}
                                </select>
                            </label>
                        )}
                        <div className="toolbar-actions toolbar-actions--end">
                            <button type="button" className="ghost-button" onClick={() => setShowCreateDBModal(false)}>
                                取消
                            </button>
                            <button
                                type="button"
                                className="primary-button"
                                onClick={handleCreateDatabase}
                                disabled={isCreatingDB || !createDBForm.name.trim()}
                            >
                                {isCreatingDB ? "创建中..." : "确认创建"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {chatBlockerModalOpen ? (
                <div className="modal-backdrop" onClick={() => setChatBlockerModalOpen(false)}>
                    <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>操作受限</h3>
                                <p>当前处于 Chat 模式，该操作不可用。</p>
                            </div>
                        </div>
                        <p style={{ margin: "12px 0", color: "var(--text-primary)" }}>
                            请先关闭 Chat 模式后再进行此操作。
                        </p>
                        <div className="toolbar-actions toolbar-actions--end">
                            <button type="button" className="primary-button" onClick={() => setChatBlockerModalOpen(false)}>
                                知道了
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {dangerConfirm.open ? (
                <div className="modal-backdrop" onClick={() => setDangerConfirm((prev) => ({ ...prev, open: false }))}>
                    <div className="modal-card modal-card--danger" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3 style={{ color: "#dc2626" }}>{dangerConfirm.title}</h3>
                                <p>危险操作，请谨慎确认。</p>
                            </div>
                        </div>
                        <p style={{ margin: "12px 0", color: "var(--text-primary)" }}>
                            {dangerConfirm.message}
                        </p>
                        <div className="toolbar-actions toolbar-actions--end">
                            <button type="button" className="ghost-button" onClick={() => setDangerConfirm((prev) => ({ ...prev, open: false }))}>
                                取消
                            </button>
                            <button
                                type="button"
                                className="primary-button primary-button--danger"
                                onClick={() => dangerConfirm.onConfirm?.()}
                            >
                                {dangerConfirm.actionLabel}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <input ref={dbImportSQLInputRef} type="file" accept=".sql,.txt" hidden onChange={handleImportSQLFileChange} />
            <input ref={dbImportCSVInputRef} type="file" accept=".csv,.txt" hidden onChange={handleImportCSVFileChange} />

            {csvImportModalOpen ? (
                <div className="modal-backdrop" onClick={() => setCsvImportModalOpen(false)}>
                    <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>CSV 导入设置</h3>
                                <p>选择要导入的目标表</p>
                            </div>
                        </div>
                        <label className="field">
                            <span>目标表</span>
                            <select value={csvImportTargetTable} onChange={(event) => setCsvImportTargetTable(event.target.value)}>
                                <option value="">请选择表</option>
                                {csvImportTables.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <p style={{ margin: "12px 0", color: "var(--text-secondary)", fontSize: 13 }}>
                            共 {csvImportRows.length} 行数据，列：{csvImportHeaders.join(", ")}
                        </p>
                        <div className="toolbar-actions toolbar-actions--end">
                            <button type="button" className="ghost-button" onClick={() => setCsvImportModalOpen(false)}>
                                取消
                            </button>
                            <button type="button" className="primary-button" onClick={handleExecuteCSVImport} disabled={!csvImportTargetTable || isImportingDB}>
                                {isImportingDB ? "导入中..." : "确认导入"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            </div>
        </>
    );
}

export default App;
