import { type Monaco } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { IDisposable, editor as MonacoEditorNS } from "monaco-editor";
import {
    AnalyzeSQL,
    BeautifySQL,
    ChatWithDatabase,
    ClearAIAPIKey,
    DeleteConnection,
    ExecuteQuery,
    ExportTextFile,
    GenerateFieldComment,
    GetExplorerTree,
    GetFieldDictionarySuggestion,
    GetQueryHistory,
    GetStorageInfo,
    GetTableDetail,
    GetTableRowCounts,
    GetWorkspaceState,
    OptimizeSQL,
    PreviewTableData,
    RepairChatSQL,
    RenameTable,
    SaveAISettings,
    SaveConnection,
    TestConnection,
} from "../wailsjs/go/main/App";
import "./App.css";
import splashLogo from "./assets/images/start.png";
import { NoticeBanner } from "./components/NoticeBanner";
import { FloatingToast } from "./components/FloatingToast";
import { AIPage } from "./pages/AIPage";
import { ThemePage } from "./pages/ThemePage";
import { SettingsPage } from "./pages/SettingsPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { engineLabels, defaultPortForEngine } from "./lib/engine";
import { copyText, toEditorValue, fromEditorValue, escapeHTML } from "./lib/utils";
import { HistoryPage } from "./pages/HistoryPage";
import { SchemaPage } from "./pages/SchemaPage";
import { QueryPage } from "./pages/QueryPage";
import { ChatPage } from "./pages/ChatPage";
import { SidebarTree } from "./pages/SidebarTree";
import { OptimizeReviewModal } from "./pages/OptimizeReviewModal";
import { CellEditorModal } from "./pages/CellEditorModal";
import { DeleteDialogModal } from "./pages/DeleteDialogModal";
import type {
    AISettingsInput,
    ConnectionInput,
    ConnectionProfile,
    ConnectionTestResult,
    WorkspaceState,
} from "./types/workspace";
import type {
    AIFieldCommentResult,
    ChatDatabaseResponse,
    ChatMessage,
    ExplorerTree,
    FieldDictionarySuggestion,
    HistoryItem,
    QueryResult,
    SQLAnalysis,
    SQLOptimizeResult,
    StorageInfoView,
    TableDetail,
    TableField,
} from "./types/runtime";

type NoticeTone = "success" | "error" | "info";
type WorkbenchPage = "connections" | "query" | "history" | "schema" | "transfer" | "ai" | "theme" | "settings";
type WorkMode = "normal" | "chat";
type ThemeMode = "light" | "dark" | "custom";

type CustomTheme = {
    navFontSize: number;
    resultFontSize: number;
    fontColor: string;
    accentColor: string;
    backgroundColor: string;
    backgroundImage: string | null;
};
type ChatDisplayMode = "summary" | "table";

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

type PageEntry = {
    id: WorkbenchPage;
    label: string;
    summary: string;
};

type SchemaDraftField = TableField & {
    id: string;
    originName: string;
    needsAiComment: boolean;
    aiLoading: boolean;
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

type ChatEntry = {
    id: string;
    role: "user" | "assistant";
    content: string;
    sql?: string;
    reasoning?: string;
    result?: QueryResult | null;
    displayMode?: ChatDisplayMode;
};

type ChatPendingAction = {
    reply: string;
    sql: string;
    analysis: SQLAnalysis;
    displayMode: ChatDisplayMode;
    reasoning: string;
    userMessage: string;
};

type ChatDropPayload = {
    kind: "database" | "table";
    database: string;
    table?: string;
};

type CellEditorState = {
    rowKey: string;
    row: Record<string, string>;
    column: string;
    fieldType: string;
    originalValue: string;
    nextValue: string;
};

const browserStorageKey = "sql-compass-browser-workspace";
const themeStorageKey = "sql-compass-theme";
const previewPageSize = 30;
const DEFAULT_QUERY_PAGE_SIZE = 20;
const QUERY_PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];
const SLASH_COMMANDS = [
    { key: "database", label: "/database", desc: "选择数据库" },
    { key: "table", label: "/table", desc: "选择数据表" },
] as const;
const SLASH_PAGE_SIZE = 20;

const pages: PageEntry[] = [
    { id: "connections", label: "连接管理", summary: "切换与维护连接" },
    { id: "history", label: "历史查询", summary: "按连接回看 SQL" },
    { id: "ai", label: "AI 设置", summary: "模型与注释助手" },
    { id: "theme", label: "自定义主题", summary: "个性化外观设置" },
    { id: "settings", label: "系统设置", summary: "存储路径与数据管理" },
];

const emptyWorkspaceState: WorkspaceState = {
    connections: [],
    ai: {
        baseUrl: "https://api.siliconflow.cn/v1",
        modelName: "deepseek-ai/DeepSeek-V3.2",
        apiKeyConfigured: false,
        apiKeySource: "等待本地配置",
        apiKeyPreview: "",
        storageMode: "本地安全存储",
    },
    storagePath: "",
};

const mysqlFieldTypes = [
    "bit",
    "tinyint",
    "smallint",
    "mediumint",
    "int",
    "bigint",
    "decimal(10,2)",
    "float",
    "double",
    "char(16)",
    "char(32)",
    "varchar(16)",
    "varchar(32)",
    "varchar(64)",
    "varchar(128)",
    "varchar(255)",
    "binary(16)",
    "varbinary(255)",
    "tinytext",
    "text",
    "mediumtext",
    "longtext",
    "tinyblob",
    "blob",
    "mediumblob",
    "longblob",
    "date",
    "time",
    "year",
    "datetime",
    "timestamp",
    "json",
    "enum('Y','N')",
    "set('A','B')",
];

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

function hasWailsBridge(): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    const runtime = window as Window & {
        go?: {
            main?: {
                App?: Record<string, unknown>;
            };
        };
    };

    return Boolean(runtime.go?.main?.App);
}

function loadBrowserWorkspaceState(): WorkspaceState {
    if (typeof window === "undefined") {
        return emptyWorkspaceState;
    }

    try {
        const raw = window.localStorage.getItem(browserStorageKey);
        if (!raw) {
            return emptyWorkspaceState;
        }

        const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
        return {
            connections: parsed.connections ?? [],
            ai: parsed.ai ?? emptyWorkspaceState.ai,
            storagePath: "浏览器本地预览",
        };
    } catch {
        return emptyWorkspaceState;
    }
}

function saveBrowserWorkspaceState(state: WorkspaceState) {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(
        browserStorageKey,
        JSON.stringify({
            connections: state.connections,
            ai: state.ai,
        }),
    );
}

function browserGeneratedID(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }

    return `browser-${Date.now()}`;
}

function createConnectionDraft(engine = "mysql"): ConnectionInput {
    return {
        id: "",
        name: "",
        engine,
        host: engine === "sqlite" ? "" : "127.0.0.1",
        port: defaultPortForEngine(engine),
        username: "",
        password: "",
        database: "",
        filePath: "",
        url: "",
        notes: "",
        group: "默认分组",
        groupColor: "",
    };
}

function createAIForm(state: WorkspaceState): AISettingsInput {
    return {
        baseUrl: state.ai.baseUrl,
        modelName: state.ai.modelName,
        apiKey: "",
    };
}

function upsertBrowserConnection(state: WorkspaceState, input: ConnectionInput): WorkspaceState {
    const now = new Date().toISOString();
    const existing = state.connections.find((item) => item.id === input.id);
    const profile: ConnectionProfile = {
        id: input.id || browserGeneratedID(),
        name: input.name || `${engineLabels[input.engine] ?? input.engine} 连接`,
        engine: input.engine,
        host: input.host,
        port: input.port,
        username: input.username,
        database: input.database,
        filePath: input.filePath,
        url: input.url,
        notes: input.notes,
        group: input.group || "默认分组",
        groupColor: input.groupColor || "",
        passwordSet: input.password.length > 0 || existing?.passwordSet === true,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };

    return {
        ...state,
        connections: [profile, ...state.connections.filter((item) => item.id !== profile.id)],
    };
}

function removeBrowserConnection(state: WorkspaceState, id: string): WorkspaceState {
    return {
        ...state,
        connections: state.connections.filter((item) => item.id !== id),
    };
}

function updateBrowserAIState(state: WorkspaceState, form: AISettingsInput): WorkspaceState {
    return {
        ...state,
        ai: {
            baseUrl: form.baseUrl,
            modelName: form.modelName,
            apiKeyConfigured: form.apiKey.trim().length > 0 || state.ai.apiKeyConfigured,
            apiKeySource: form.apiKey.trim().length > 0 ? "浏览器预览表单" : state.ai.apiKeySource,
            apiKeyPreview: form.apiKey.trim().length > 0 ? "已写入浏览器本地存储" : state.ai.apiKeyPreview,
            storageMode: "浏览器本地预览",
        },
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function stripSlashCommand(input: string, slashStart: number): string {
    return input.substring(0, slashStart).replace(/\s+$/, "");
}

function summarizeChatResult(result: QueryResult): string {
    if (result.rows.length === 0) {
        return result.message?.trim() || "已执行完成，但没有返回数据。";
    }

    const firstRow = result.rows[0] ?? {};
    const highlights = result.columns
        .slice(0, 3)
        .map((column) => `${column}: ${firstRow[column] ?? ""}`)
        .join("，");

    return `${result.message?.trim() || `共返回 ${result.rows.length} 行`}。${highlights ? ` 首行结果：${highlights}` : ""}`;
}

function appendUnique(items: string[], value: string): string[] {
    return items.includes(value) ? items : [...items, value];
}

function stringifySQLValue(value: string): string {
    if (value === "") {
        return "NULL";
    }

    if (/^-?\d+(\.\d+)?$/.test(value)) {
        return value;
    }

    if (value.toUpperCase() === "CURRENT_TIMESTAMP") {
        return value;
    }

    return `'${value.replace(/'/g, "''")}'`;
}

    function stringifyResultSQLValue(value: string): string {
        const normalized = value ?? "";
        if (/^-?\d+(\.\d+)?$/.test(normalized)) {
            return normalized;
        }

        return `'${normalized.replace(/'/g, "''")}'`;
    }

    function buildInsertStatement(tableName: string, columns: string[], rows: Record<string, string>[]): string {
        const escapedColumns = columns.map((column) => `\`${column}\``).join(", ");
        const values = rows
            .map((row) => `(${columns.map((column) => stringifyResultSQLValue(row[column] ?? "")).join(", ")})`)
            .join(",\n");

        return `INSERT INTO \`${tableName}\` (${escapedColumns})\nVALUES\n${values};`;
    }

function buildRowSelectionKey(page: number, columns: string[], row: Record<string, string>, rowIndex: number): string {
    const signature = columns.map((column) => `${column}:${row[column] ?? ""}`).join("\u241f");
    return `${page}:${rowIndex}:${signature}`;
}



function buildFieldDefinition(field: SchemaDraftField): string {
    const parts = [`\`${field.name || "new_column"}\``, field.type || "varchar(255)"];
    parts.push(field.nullable ? "NULL" : "NOT NULL");

    if (field.defaultValue.trim()) {
        parts.push(`DEFAULT ${stringifySQLValue(field.defaultValue.trim())}`);
    }

    if (field.autoIncrement) {
        parts.push("AUTO_INCREMENT");
    }

    if (field.comment.trim()) {
        parts.push(`COMMENT '${field.comment.replace(/'/g, "''")}'`);
    }

    return parts.join(" ");
}

function fieldSignature(field: SchemaDraftField | TableField): string {
    return [
        field.name.trim(),
        field.type.trim(),
        field.nullable ? "1" : "0",
        field.defaultValue.trim(),
        field.comment.trim(),
        field.primary ? "1" : "0",
        field.autoIncrement ? "1" : "0",
    ].join("|");
}

function buildAlterSQL(tableDetail: TableDetail | null, tableName: string, draftFields: SchemaDraftField[]): string {
    if (!tableDetail) {
        return "-- 请选择一张真实表";
    }

    const statements: string[] = [];
    const originals = new Map(tableDetail.fields.map((field) => [field.name, field]));
    const draftNames = new Set(draftFields.map((field) => field.originName || field.name));

    tableDetail.fields.forEach((field) => {
        if (!draftNames.has(field.name)) {
            statements.push(`DROP COLUMN \`${field.name}\``);
        }
    });

    draftFields.forEach((field) => {
        if (!field.originName) {
            statements.push(`ADD COLUMN ${buildFieldDefinition(field)}`);
            return;
        }

        const original = originals.get(field.originName);
        if (!original) {
            statements.push(`ADD COLUMN ${buildFieldDefinition(field)}`);
            return;
        }

        if (original.name !== field.name) {
            statements.push(`CHANGE COLUMN \`${original.name}\` ${buildFieldDefinition(field)}`);
            return;
        }

        if (fieldSignature(original) !== fieldSignature(field)) {
            statements.push(`MODIFY COLUMN ${buildFieldDefinition(field)}`);
        }
    });

    if (statements.length === 0) {
        return "-- 当前没有结构变更";
    }

    return `ALTER TABLE \`${tableName}\`\n  ${statements.join(",\n  ")};`;
}

function csvFromRows(columns: string[], rows: Record<string, string>[]): string {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [columns.map(escape).join(",")];
    rows.forEach((row) => {
        lines.push(columns.map((column) => escape(row[column] ?? "")).join(","));
    });
    return lines.join("\n");
}

function downloadText(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function excelFromRows(sheetName: string, columns: string[], rows: Record<string, string>[]): string {
    const headerCells = columns.map((column) => `<th>${escapeHTML(column)}</th>`).join("");
    const bodyRows = rows
        .map(
            (row) =>
                `<tr>${columns
                    .map((column) => `<td>${escapeHTML(row[column] ?? "")}</td>`)
                    .join("")}</tr>`,
        )
        .join("");

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
    <meta charset="UTF-8" />
    <meta name="ProgId" content="Excel.Sheet" />
    <style>
        table { border-collapse: collapse; width: 100%; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
        th, td { border: 1px solid #d8e0ef; padding: 8px 10px; text-align: left; white-space: nowrap; }
        th { background: #eef4ff; font-weight: 700; }
    </style>
</head>
<body>
    <table data-sheet-name="${escapeHTML(sheetName)}">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
    </table>
</body>
</html>`;
}

function App() {
    const browserPreview = !hasWailsBridge();
    const sqlFileInputRef = useRef<HTMLInputElement | null>(null);
    const sqlEditorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const chatStreamRef = useRef<HTMLDivElement | null>(null);
    const completionDisposableRef = useRef<IDisposable | null>(null);
    const completionPrimedRef = useRef(false);
    const [monacoReady, setMonacoReady] = useState(false);

    const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(emptyWorkspaceState);
    const [backendState, setBackendState] = useState("正在连接桌面后端");
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
    const [chatDisplayMode, setChatDisplayMode] = useState<ChatDisplayMode>("summary");
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [workbenchExpanded, setWorkbenchExpanded] = useState(false);

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
    const [expandedDatabases, setExpandedDatabases] = useState<Record<string, boolean>>({});

    const [connectionDraft, setConnectionDraft] = useState<ConnectionInput>(createConnectionDraft("mysql"));
    const [showPassword, setShowPassword] = useState(false);
    const [aiForm, setAIForm] = useState<AISettingsInput>(createAIForm(emptyWorkspaceState));
    const [sqlText, setSQLText] = useState("");
    const [sqlEditorCollapsed, setSQLEditorCollapsed] = useState(false);
    const [selectedSnippet, setSelectedSnippet] = useState<SelectedSnippet | null>(null);
    const [selectedResultRowKeys, setSelectedResultRowKeys] = useState<string[]>([]);
    const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
    const [queryErrorDetail, setQueryErrorDetail] = useState("");
    const [lastExecutedSQL, setLastExecutedSQL] = useState("");
    const [sqlAnalysis, setSQLAnalysis] = useState<SQLAnalysis | null>(null);
    const [optimizeReview, setOptimizeReview] = useState<OptimizeReviewState | null>(null);
    const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
    const [historyFocusId, setHistoryFocusId] = useState("");
    const [queryPage, setQueryPage] = useState(1);
    const [queryPageSize, setQueryPageSize] = useState(() => {
        const saved = localStorage.getItem("sql-compass-query-page-size");
        return saved ? Number(saved) : DEFAULT_QUERY_PAGE_SIZE;
    });
    const [jumpPageInput, setJumpPageInput] = useState("");
    const [historyPage, setHistoryPage] = useState(1);
    const historyPageSize = 20;
    const [schemaDraftFields, setSchemaDraftFields] = useState<SchemaDraftField[]>([]);
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [renameTableName, setRenameTableName] = useState("");
    const [previewContext, setPreviewContext] = useState<PreviewContext | null>(null);
    const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
    const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);
    const [cellEditor, setCellEditor] = useState<CellEditorState | null>(null);
    const [chatInput, setChatInput] = useState("");
    const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
    const [chatPendingAction, setChatPendingAction] = useState<ChatPendingAction | null>(null);
    const [chatContextDatabase, setChatContextDatabase] = useState("");
    const [chatContextTables, setChatContextTables] = useState<string[]>([]);
    const [chatDropActive, setChatDropActive] = useState(false);
    const [slashMenuOpen, setSlashMenuOpen] = useState(false);
    const [slashMenuType, setSlashMenuType] = useState<"command" | "database" | "table">("command");
    const [slashMenuFilter, setSlashMenuFilter] = useState("");
    const [slashMenuPage, setSlashMenuPage] = useState(0);
    const [slashMenuDB, setSlashMenuDB] = useState("");
    const [slashMenuStart, setSlashMenuStart] = useState(0); // cursor position where / was typed
    const [slashMenuActiveIndex, setSlashMenuActiveIndex] = useState(0);

    const [workspaceNotice, setWorkspaceNotice] = useState<Notice | null>(null);
    const [connectionNotice, setConnectionNotice] = useState<Notice | null>(null);
    const [queryNotice, setQueryNotice] = useState<Notice | null>(null);
    const [schemaNotice, setSchemaNotice] = useState<Notice | null>(null);
    const [transferNotice, setTransferNotice] = useState<Notice | null>(null);
    const [aiNotice, setAINotice] = useState<Notice | null>(null);
    const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null);
    const [toast, setToast] = useState<Toast | null>(null);

    const [isSavingConnection, setIsSavingConnection] = useState(false);
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [isExecutingQuery, setIsExecutingQuery] = useState(false);
    const [isOptimizingSQL, setIsOptimizingSQL] = useState(false);
    const [isRenamingTable, setIsRenamingTable] = useState(false);
    const [isSavingAI, setIsSavingAI] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isRunningChat, setIsRunningChat] = useState(false);
    const [isSavingCell, setIsSavingCell] = useState(false);

    const selectedConnection = workspaceState.connections.find((item) => item.id === selectedConnectionId) ?? null;
    const activeEngine = selectedConnection?.engine ?? connectionDraft.engine;
    const currentAlterSQL = useMemo(() => buildAlterSQL(tableDetail, selectedTable, schemaDraftFields), [tableDetail, selectedTable, schemaDraftFields]);
    const historyFocusItem = useMemo(
        () => historyItems.find((item) => item.id === historyFocusId) ?? historyItems[0] ?? null,
        [historyFocusId, historyItems],
    );
    const mysqlTypeOptions = useMemo(() => {
        const dynamicTypes = schemaDraftFields.map((item) => item.type).filter(Boolean);
        return [...new Set([...mysqlFieldTypes, ...dynamicTypes])];
    }, [schemaDraftFields]);
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

    const historyStats = useMemo(() => {
        const dangerous = historyItems.filter((item) => item.riskLevel === "high" || item.riskLevel === "critical").length;
        const avgDuration = historyItems.length
            ? Math.round(historyItems.reduce((sum, item) => sum + item.durationMs, 0) / historyItems.length)
            : 0;

        return {
            total: historyItems.length,
            dangerous,
            avgDuration,
        };
    }, [historyItems]);
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
    const slashMenuItems = useMemo(() => {
        if (slashMenuType === "command") {
            return SLASH_COMMANDS.filter((c) => c.key.includes(slashMenuFilter)).map((item) => ({
                key: item.key,
                label: item.label,
                desc: item.desc,
                tone: "command" as const,
            }));
        }

        if (slashMenuType === "database" && explorerTree) {
            return explorerTree.databases
                .filter((db) => !db.isSystem && db.name.toLowerCase().includes(slashMenuFilter))
                .map((db) => ({
                    key: db.name,
                    label: db.name,
                    desc: `${db.tableCount} 张表`,
                    tone: "database" as const,
                }));
        }

        if (slashMenuType === "table" && explorerTree) {
            const dbName = slashMenuDB || selectedDatabase;
            if (!dbName) {
                return explorerTree.databases
                    .filter((db) => !db.isSystem)
                    .flatMap((db) =>
                        db.tables
                            .filter((table) => table.name.toLowerCase().includes(slashMenuFilter))
                            .map((table) => ({
                                key: `${db.name}.${table.name}`,
                                label: table.name,
                                desc: `${db.name} · ${table.rows === -1 ? "..." : table.rows >= 0 ? table.rows.toLocaleString() : "-"} 行`,
                                tone: "table" as const,
                            })),
                    );
            }

            const db = explorerTree.databases.find((item) => item.name === dbName);
            if (!db) {
                return [];
            }

            return db.tables
                .filter((table) => table.name.toLowerCase().includes(slashMenuFilter))
                .map((table) => ({
                    key: table.name,
                    label: table.name,
                    desc: `${table.rows === -1 ? "..." : table.rows >= 0 ? table.rows.toLocaleString() : "-"} 行`,
                    tone: "table" as const,
                }));
        }

        return [];
    }, [explorerTree, selectedDatabase, slashMenuDB, slashMenuFilter, slashMenuType]);
    const slashMenuTotalPages = Math.max(1, Math.ceil(slashMenuItems.length / SLASH_PAGE_SIZE));
    const slashMenuPageSafe = Math.min(slashMenuPage, slashMenuTotalPages - 1);
    const pagedSlashMenuItems = useMemo(
        () => slashMenuItems.slice(slashMenuPageSafe * SLASH_PAGE_SIZE, (slashMenuPageSafe + 1) * SLASH_PAGE_SIZE),
        [slashMenuItems, slashMenuPageSafe],
    );

    function pushToast(tone: NoticeTone, title: string, message: string) {
        setToast({
            id: browserGeneratedID(),
            tone,
            title,
            message,
        });
    }

    // 保存筛选设置到本地存储（仅保留过滤项，不保存面板展开状态）
    function saveFilterSettings() {
        const settings = {
            databaseFilter,
            tableFilter,
        };
        localStorage.setItem("sql-compass-filter-settings", JSON.stringify(settings));
        pushToast("success", "已保存", "筛选设置已保存，下次连接时自动恢复");
    }

    // 加载保存的筛选设置（仅恢复过滤项，不自动展开面板）
    function loadFilterSettings() {
        try {
            const saved = localStorage.getItem("sql-compass-filter-settings");
            if (saved) {
                const settings = JSON.parse(saved);
                if (settings.databaseFilter?.length > 0) setDatabaseFilter(settings.databaseFilter);
                if (settings.tableFilter?.length > 0) setTableFilter(settings.tableFilter);
            }
        } catch {
            // 忽略加载错误
        }
    }

    function getErrorMessage(error: unknown): string {
        if (error instanceof Error && error.message.trim()) {
            return error.message;
        }

        if (typeof error === "string" && error.trim()) {
            return error;
        }

        try {
            const serialized = JSON.stringify(error);
            if (serialized && serialized !== "{}") {
                return serialized;
            }
        } catch {
            return "未知错误";
        }

        return "未知错误";
    }

    async function refreshWorkspaceState() {
        if (browserPreview) {
            const state = loadBrowserWorkspaceState();
            setWorkspaceState(state);
            setAIForm(createAIForm(state));
            return;
        }

        const state = (await GetWorkspaceState()) as WorkspaceState;
        setWorkspaceState(state);
        setAIForm(createAIForm(state));
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

        // 2. 异步加载行数
        if (tree.databases && tree.databases.length > 0) {
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

                // 更新 explorerTree 中的行数
                setExplorerTree((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        databases: prev.databases.map((db) => {
                            if (db.name !== database) return db;
                            return {
                                ...db,
                                tables: db.tables.map((table) => ({
                                    ...table,
                                    rows: result.counts[table.name] ?? table.rows,
                                    loading: false,
                                })),
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
            setSchemaDraftFields([]);
            return;
        }

        const detail = (await GetTableDetail({ connectionId, database, table })) as TableDetail;
        setTableDetail(detail);
        setRenameTableName(detail.table);
        setSchemaDraftFields(
            detail.fields.map((field) => ({
                ...field,
                id: browserGeneratedID(),
                originName: field.name,
                needsAiComment: field.comment.trim() === "",
                aiLoading: false,
            })),
        );
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
            setAIForm(createAIForm(state));
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

    // 组件挂载时加载保存的筛选设置
    useEffect(() => {
        loadFilterSettings();
    }, []);

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
        setSchemaDraftFields([]);
        setQueryResult(null);
        setQueryErrorDetail("");
        setLastExecutedSQL("");
        setQueryPage(1);
        setPreviewContext(null);
        setChatMessages([]);
        setChatPendingAction(null);
        setChatContextDatabase("");
        setChatContextTables([]);
        setTablePageByDatabase({});
        setExpandedDatabases({});
        setSelectedSnippet(null);

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
            setSchemaDraftFields([]);
            return;
        }

        loadTable(selectedConnectionId, selectedDatabase, selectedTable).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "读取表结构失败";
            setSchemaNotice({ tone: "error", message });
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
    }, [chatMessages, isRunningChat, chatPendingAction]);

    useEffect(() => {
        if (!slashMenuOpen) {
            return;
        }

        setSlashMenuPage(0);
        setSlashMenuActiveIndex(0);
    }, [slashMenuFilter, slashMenuOpen, slashMenuType]);

    useEffect(() => {
        if (!slashMenuOpen) {
            return;
        }

        const maxIndex = Math.max(0, pagedSlashMenuItems.length - 1);
        setSlashMenuActiveIndex((current) => clamp(current, 0, maxIndex));
    }, [pagedSlashMenuItems, slashMenuOpen]);

    function updateConnectionField<K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) {
        setConnectionDraft((current) => {
            if (key === "engine") {
                const nextEngine = String(value);
                return {
                    ...createConnectionDraft(nextEngine),
                    id: current.id,
                    name: current.name,
                    notes: current.notes,
                };
            }

            return {
                ...current,
                [key]: value,
            };
        });
    }

    function resetConnectionForm(engine = selectedConnection?.engine ?? "mysql") {
        setConnectionDraft(createConnectionDraft(engine));
        setConnectionTest(null);
    }

    function fillConnectionDraft(profile: ConnectionProfile) {
        setConnectionDraft({
            id: profile.id,
            name: profile.name,
            engine: profile.engine,
            host: profile.host,
            port: profile.port,
            username: profile.username,
            password: "",
            database: profile.database,
            filePath: profile.filePath,
            url: profile.url,
            notes: profile.notes,
            group: profile.group || "默认分组",
            groupColor: profile.groupColor || "",
        });
        setActivePage("connections");
    }

    function handleSelectConnection(profile: ConnectionProfile) {
        setSelectedConnectionId(profile.id);
        setWorkspaceNotice(null);
        pushToast("success", "已定位连接", `当前连接：${profile.name}`);
    }

    function handleSelectDatabase(databaseName: string) {
        setSelectedDatabase(databaseName);
        setChatContextDatabase(databaseName);
        setChatContextTables([]);
        setTableSearch("");
        setSelectedTable("");
        setTableDetail(null);
        setSchemaDraftFields([]);
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

    async function handleSaveConnection() {
        try {
            setIsSavingConnection(true);
            if (browserPreview) {
                const nextState = upsertBrowserConnection(workspaceState, connectionDraft);
                saveBrowserWorkspaceState(nextState);
                setWorkspaceState(nextState);
                setSelectedConnectionId(nextState.connections[0]?.id ?? "");
                setConnectionNotice({ tone: "success", message: "连接已保存到浏览器预览存储。" });
                resetConnectionForm(connectionDraft.engine);
                return;
            }

            const profile = (await SaveConnection(connectionDraft)) as ConnectionProfile;
            await refreshWorkspaceState();
            setSelectedConnectionId(profile.id);
            setConnectionNotice({ tone: "success", message: `连接已保存：${profile.name}` });
            pushToast("success", "连接已保存", profile.name);
            resetConnectionForm(profile.engine);
        } catch (error) {
            const message = error instanceof Error ? error.message : "保存连接失败";
            setConnectionNotice({ tone: "error", message });
        } finally {
            setIsSavingConnection(false);
        }
    }

    async function handleDeleteConnection(profile: ConnectionProfile) {
        if (!window.confirm(`确认删除连接“${profile.name}”吗？`)) {
            return;
        }

        try {
            if (browserPreview) {
                const nextState = removeBrowserConnection(workspaceState, profile.id);
                saveBrowserWorkspaceState(nextState);
                setWorkspaceState(nextState);
                setConnectionNotice({ tone: "success", message: `连接已删除：${profile.name}` });
                return;
            }

            await DeleteConnection(profile.id);
            await refreshWorkspaceState();
            setConnectionNotice({ tone: "success", message: `连接已删除：${profile.name}` });
        } catch (error) {
            const message = error instanceof Error ? error.message : "删除连接失败";
            setConnectionNotice({ tone: "error", message });
        }
    }

    async function handleTestConnection() {
        try {
            setIsTestingConnection(true);
            if (browserPreview) {
                setConnectionNotice({ tone: "info", message: "浏览器预览模式不支持真实数据库测试。" });
                return;
            }

            const result = (await TestConnection(connectionDraft)) as ConnectionTestResult;
            setConnectionTest(result);
            setConnectionNotice({ tone: result.success ? "success" : "error", message: result.detail });
        } catch (error) {
            const message = error instanceof Error ? error.message : "测试连接失败";
            setConnectionNotice({ tone: "error", message });
        } finally {
            setIsTestingConnection(false);
        }
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

    async function handleSaveAISettings() {
        try {
            setIsSavingAI(true);
            if (browserPreview) {
                const nextState = updateBrowserAIState(workspaceState, aiForm);
                saveBrowserWorkspaceState(nextState);
                setWorkspaceState(nextState);
                setAINotice({ tone: "success", message: "AI 设置已保存到浏览器预览存储。" });
                return;
            }

            await SaveAISettings(aiForm);
            await refreshWorkspaceState();
            setAIForm((current) => ({ ...current, apiKey: "" }));
            setAINotice({ tone: "success", message: "AI 设置已保存。" });
        } catch (error) {
            const message = error instanceof Error ? error.message : "保存 AI 设置失败";
            setAINotice({ tone: "error", message });
        } finally {
            setIsSavingAI(false);
        }
    }

    async function handleClearAPIKey() {
        try {
            setIsSavingAI(true);
            if (browserPreview) {
                const nextState: WorkspaceState = {
                    ...workspaceState,
                    ai: {
                        ...workspaceState.ai,
                        apiKeyConfigured: false,
                        apiKeySource: "未配置",
                        apiKeyPreview: "",
                        storageMode: "浏览器本地预览",
                    },
                };
                saveBrowserWorkspaceState(nextState);
                setWorkspaceState(nextState);
                setAINotice({ tone: "success", message: "AI Key 已清空。" });
                return;
            }

            await ClearAIAPIKey();
            await refreshWorkspaceState();
            setAINotice({ tone: "success", message: "AI Key 已清空。" });
        } catch (error) {
            const message = error instanceof Error ? error.message : "清空 AI Key 失败";
            setAINotice({ tone: "error", message });
        } finally {
            setIsSavingAI(false);
        }
    }

    async function applyFieldSuggestion(index: number, fieldName: string) {
        if (!fieldName.trim()) {
            return;
        }

        try {
            if (browserPreview) {
                setSchemaDraftFields((current) =>
                    current.map((field, itemIndex) =>
                        itemIndex === index
                            ? {
                                  ...field,
                                  needsAiComment: true,
                              }
                            : field,
                    ),
                );
                return;
            }

            const suggestion = (await GetFieldDictionarySuggestion({
                engine: activeEngine,
                fieldName,
            })) as FieldDictionarySuggestion;

            setSchemaDraftFields((current) =>
                current.map((field, itemIndex) =>
                    itemIndex === index
                        ? {
                              ...field,
                              type: suggestion.type || field.type,
                              comment: field.comment.trim() || suggestion.comment,
                              needsAiComment: suggestion.needsAiComment && !suggestion.comment,
                          }
                        : field,
                ),
            );
        } catch {
            setSchemaDraftFields((current) =>
                current.map((field, itemIndex) =>
                    itemIndex === index
                        ? {
                              ...field,
                              needsAiComment: true,
                          }
                        : field,
                ),
            );
        }
    }

    async function handleGenerateFieldComment(index: number) {
        const field = schemaDraftFields[index];
        if (!field?.name.trim()) {
            return;
        }

        try {
            setSchemaDraftFields((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index
                        ? {
                              ...item,
                              aiLoading: true,
                          }
                        : item,
                ),
            );

            const result = (await GenerateFieldComment({ fieldName: field.name })) as AIFieldCommentResult;
            setSchemaDraftFields((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index
                        ? {
                              ...item,
                              comment: result.comment,
                              needsAiComment: false,
                              aiLoading: false,
                          }
                        : item,
                ),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "生成字段注释失败";
            setSchemaNotice({ tone: "error", message });
            setSchemaDraftFields((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index
                        ? {
                              ...item,
                              aiLoading: false,
                          }
                        : item,
                ),
            );
        }
    }

    function updateDraftField<K extends keyof SchemaDraftField>(index: number, key: K, value: SchemaDraftField[K]) {
        setSchemaDraftFields((current) =>
            current.map((field, itemIndex) =>
                itemIndex === index
                    ? {
                          ...field,
                          [key]: value,
                      }
                    : field,
            ),
        );
    }

    function handleAddField() {
        setSchemaDraftFields((current) => [
            ...current,
            {
                id: browserGeneratedID(),
                originName: "",
                name: "",
                type: "varchar(255)",
                nullable: true,
                defaultValue: "",
                comment: "",
                primary: false,
                autoIncrement: false,
                needsAiComment: true,
                aiLoading: false,
            },
        ]);
    }

    function handleDeleteDraftField(index: number) {
        setSchemaDraftFields((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }

    async function handleRenameTable() {
        if (!selectedConnection || !selectedDatabase || !selectedTable || !renameTableName.trim()) {
            return;
        }

        if (renameTableName.trim() === selectedTable) {
            setSchemaNotice({ tone: "info", message: "表名未变化。" });
            setRenameModalOpen(false);
            return;
        }

        try {
            setIsRenamingTable(true);
            await RenameTable({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                oldName: selectedTable,
                newName: renameTableName.trim(),
            });
            setSchemaNotice({ tone: "success", message: "表已重命名。" });
            setRenameModalOpen(false);
            setSelectedTable(renameTableName.trim());
            await loadExplorer(selectedConnection.id, selectedDatabase);
            await loadTable(selectedConnection.id, selectedDatabase, renameTableName.trim());
        } catch (error) {
            const message = error instanceof Error ? error.message : "重命名表失败";
            setSchemaNotice({ tone: "error", message });
        } finally {
            setIsRenamingTable(false);
        }
    }

    async function handleExportDDL() {
        if (!tableDetail) {
            setTransferNotice({ tone: "info", message: "请先选择一张真实表。" });
            return;
        }

        await exportTextFile("sql", `${tableDetail.table}.sql`, tableDetail.ddl, "导出表 DDL");
    }

    function handleCopyDDL() {
        if (!tableDetail?.ddl.trim()) {
            setSchemaNotice({ tone: "info", message: "当前没有可复制的 DDL。" });
            return;
        }

        copyText(tableDetail.ddl)
            .then(() => pushToast("success", "已复制 DDL", tableDetail.table))
            .catch(() => pushToast("error", "复制失败", "请稍后重试"));
    }

    async function handleExportQuerySQL() {
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

    async function handleImportSQLFile(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        const content = await file.text();
        setSQLText(content);
        setSQLEditorCollapsed(false);
        setPreviewContext(null);
        setQueryErrorDetail("");
        setSelectedSnippet(null);
        setActivePage("query");
        setQueryNotice({ tone: "success", message: `已加载 SQL 文件：${file.name}` });
        event.target.value = "";
    }

    function openCellEditor(row: Record<string, string>, rowKey: string, column: string) {
        if (!previewContext || !tableDetail || previewContext.table !== tableDetail.table) {
            return;
        }

        const field = tableDetail.fields.find((item) => item.name === column);
        if (!field) {
            return;
        }

        setCellEditor({
            rowKey,
            row,
            column,
            fieldType: field.type,
            originalValue: row[column] ?? "",
            nextValue: toEditorValue(row[column] ?? "", field.type),
        });
    }

    function buildCellUpdateStatement(editorState: CellEditorState): string {
        const nextValue = fromEditorValue(editorState.nextValue, editorState.fieldType);
        return `UPDATE \`${selectedTable}\`\nSET \`${editorState.column}\` = ${stringifySQLValue(nextValue)}\nWHERE ${primaryFieldNames
            .map((fieldName) => `\`${fieldName}\` = ${stringifyResultSQLValue(editorState.row[fieldName] ?? "")}`)
            .join(" AND ")};`;
    }

    async function handleConfirmCellEdit() {
        if (!cellEditor || !selectedConnection || !selectedDatabase || !selectedTable) {
            return;
        }

        try {
            setIsSavingCell(true);
            const statement = buildCellUpdateStatement(cellEditor);
            await ExecuteQuery({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                sql: statement,
                page: 1,
                pageSize: queryPageSize,
            });
            await handlePreviewTable(selectedDatabase, selectedTable, queryPage);
            setCellEditor(null);
            pushToast("success", "字段已更新", `${cellEditor.column} 已保存`);
        } catch (error) {
            const message = getErrorMessage(error);
            setQueryNotice({ tone: "error", message });
        } finally {
            setIsSavingCell(false);
        }
    }

    async function handleSendChatMessage(rawMessage?: string) {
        const message = (rawMessage ?? chatInput).trim();
        if (!message || !selectedConnection) {
            return;
        }

        const effectiveDatabase = chatContextDatabase || selectedDatabase;
        const effectiveTables = chatContextTables.length > 0 ? chatContextTables : selectedTable ? [selectedTable] : [];
        const selectedTableText = effectiveTables.join(", ");
        const contextualMessage = [
            effectiveDatabase ? `当前数据库：${effectiveDatabase}` : "",
            selectedTableText ? `限定数据表：${selectedTableText}` : "",
            message,
        ]
            .filter(Boolean)
            .join("\n");

        const nextUserMessage: ChatEntry = {
            id: browserGeneratedID(),
            role: "user",
            content: message,
        };
        const nextHistory: ChatMessage[] = [...chatMessages, nextUserMessage].slice(-8).map((item) => ({
            role: item.role,
            content: item.content,
        }));

        setChatMessages((current) => [...current, nextUserMessage]);
        setChatInput("");
        setIsRunningChat(true);

        try {
            const response = (await ChatWithDatabase({
                connectionId: selectedConnection.id,
                database: effectiveDatabase,
                selectedTable: selectedTableText,
                message: contextualMessage,
                history: nextHistory,
                displayMode: chatDisplayMode,
            })) as ChatDatabaseResponse;

            if (response.sql && !response.requiresConfirm) {
                await executeChatSQL(response.sql, response.displayMode as ChatDisplayMode, response.reply, contextualMessage, response.reasoning, 0);
                return;
            }

            const assistantMessage: ChatEntry = {
                id: browserGeneratedID(),
                role: "assistant",
                content: response.reply || "AI 已完成本轮分析。",
                sql: response.sql,
                reasoning: response.reasoning,
                displayMode: (response.displayMode as ChatDisplayMode) || chatDisplayMode,
            };
            setChatMessages((current) => [...current, assistantMessage]);

            if (response.sql && response.requiresConfirm) {
                setChatPendingAction({
                    reply: response.reply,
                    sql: response.sql,
                    analysis: response.analysis,
                    displayMode: (response.displayMode as ChatDisplayMode) || "summary",
                    reasoning: response.reasoning,
                    userMessage: contextualMessage,
                });
            }
        } catch (error) {
            const messageText = getErrorMessage(error);
            setChatMessages((current) => [
                ...current,
                {
                    id: browserGeneratedID(),
                    role: "assistant",
                    content: `处理失败：${messageText}`,
                },
            ]);
        } finally {
            setIsRunningChat(false);
        }
    }

    // Chat action helpers: copy, edit, format
    async function handleCopyText(text: string, label?: string) {
        try {
            await copyText(text);
            pushToast("success", "已复制", label ? `${label} 已复制到剪贴板` : "内容已复制到剪贴板");
        } catch {
            pushToast("error", "复制失败", "请稍后重试");
        }
    }

    function handleCopyUserMessage(item: ChatEntry) {
        handleCopyText(item.content, "消息");
    }

    function handleEditUserMessage(item: ChatEntry) {
        setChatInput(item.content);
        const textarea = document.querySelector(".chat-composer textarea") as HTMLTextAreaElement;
        if (textarea) {
            textarea.focus();
            textarea.selectionStart = item.content.length;
            textarea.selectionEnd = item.content.length;
        }
    }

    async function handleCopyChatMessage(item: ChatEntry) {
        let text = "";
        if (item.role === "assistant") {
            const parts: string[] = [item.content];
            if (item.sql) parts.push(`\n--- SQL ---\n${item.sql}`);
            if (item.result) {
                parts.push(`\n--- 查询结果 (${item.result.statementType || "SELECT"} | ${item.result.rows.length} 行 | ${item.result.durationMs}ms) ---`);
                const header = (item.result.columns ?? []).join("\t");
                const rows = item.result.rows.slice(0, 20).map((r: Record<string, string>) => (item.result?.columns ?? []).map((c: string) => r[c] ?? "").join("\t"));
                parts.push([header, ...rows].join("\n"));
                if (item.result.rows.length > 20) {
                    parts.push(`\n... 共 ${item.result.rows.length} 行，仅展示前 20 行 ...`);
                }
            }
            text = parts.join("\n\n");
        } else {
            text = item.content;
        }
        await handleCopyText(text, item.role === "assistant" ? "对话" : "消息");
    }

    async function handleCopyChatResult(item: ChatEntry) {
        if (!item.result) return;
        const cols = item.result.columns ?? [];
        const header = cols.join("\t");
        const rows = item.result.rows.slice(0, 50).map((r: Record<string, string>) => cols.map((c: string) => r[c] ?? "").join("\t"));
        const lines = [`查询类型：${item.result.statementType || "SELECT"}`, `耗时：${item.result.durationMs} ms`, `行数：${item.result.rows.length}`, "", header, ...rows];
        if (item.result.rows.length > 50) {
            lines.push("", `... 共 ${item.result.rows.length} 行，仅展示前 50 行 ...`);
        }
        await handleCopyText(lines.join("\n"), "查询结果");
    }

    async function executeChatSQL(statement: string, displayMode: ChatDisplayMode, replyPrefix = "", userMessage = "", previousReason = "", repairAttempt = 0) {
        if (!selectedConnection) {
            return;
        }

        const effectiveDatabase = chatContextDatabase || selectedDatabase;
        const selectedTableText = chatContextTables.length > 0 ? chatContextTables.join(", ") : selectedTable;

        try {
            const result = (await ExecuteQuery({
                connectionId: selectedConnection.id,
                database: effectiveDatabase,
                sql: statement,
                page: 1,
                pageSize: displayMode === "table" ? previewPageSize : queryPageSize,
            })) as QueryResult;

            setQueryResult(result);
            setLastExecutedSQL(statement);
            setQueryPage(1);
            setPreviewContext(null);
            setSQLAnalysis(result.analysis);
            setQueryErrorDetail("");

            setChatMessages((current) => [
                ...current,
                {
                    id: browserGeneratedID(),
                    role: "assistant",
                    content:
                        displayMode === "table"
                            ? `${replyPrefix || "已执行 SQL。"} 已为你展示结果表格。`
                            : `${replyPrefix || "已执行 SQL。"} ${summarizeChatResult(result)} 耗时 ${result.durationMs} ms。`,
                    sql: statement,
                    result,
                    reasoning: previousReason,
                    displayMode,
                },
            ]);
            await loadHistory(selectedConnection.id);
        } catch (error) {
            const message = getErrorMessage(error);
            if (repairAttempt < 2) {
                try {
                    const repairHistory: ChatMessage[] = chatMessages.slice(-8).map((item) => ({
                        role: item.role,
                        content: item.content,
                    }));
                    const repair = (await RepairChatSQL({
                        connectionId: selectedConnection.id,
                        database: effectiveDatabase,
                        selectedTable: selectedTableText,
                        message: userMessage || statement,
                        attemptedSql: statement,
                        errorMessage: message,
                        previousReason: previousReason,
                        history: repairHistory,
                        displayMode,
                    })) as ChatDatabaseResponse;

                    setChatMessages((current) => [
                        ...current,
                        {
                            id: browserGeneratedID(),
                            role: "assistant",
                            content: repair.reply || `上一条 SQL 执行失败，我已根据报错继续修正。`,
                            sql: repair.sql || statement,
                            reasoning: repair.reasoning,
                        },
                    ]);

                    const repairedSQL = repair.sql?.trim() ?? "";
                    if (repairedSQL && repairedSQL !== statement.trim()) {
                        if (repair.requiresConfirm) {
                            setChatPendingAction({
                                reply: repair.reply,
                                sql: repairedSQL,
                                analysis: repair.analysis,
                                displayMode: (repair.displayMode as ChatDisplayMode) || displayMode,
                                reasoning: repair.reasoning,
                                userMessage: userMessage || statement,
                            });
                            return;
                        }

                        await executeChatSQL(
                            repairedSQL,
                            (repair.displayMode as ChatDisplayMode) || displayMode,
                            repair.reply || replyPrefix,
                            userMessage || statement,
                            repair.reasoning,
                            repairAttempt + 1,
                        );
                        return;
                    }

                    if (repair.mode === "ask" || !repairedSQL) {
                        return;
                    }
                } catch (repairError) {
                    const repairMessage = getErrorMessage(repairError);
                    setChatMessages((current) => [
                        ...current,
                        {
                            id: browserGeneratedID(),
                            role: "assistant",
                            content: `SQL 执行失败：${message}\n继续修正时又失败：${repairMessage}`,
                            sql: statement,
                        },
                    ]);
                    return;
                }
            }

            setChatMessages((current) => [
                ...current,
                {
                    id: browserGeneratedID(),
                    role: "assistant",
                    content: `SQL 执行失败：${message}`,
                    sql: statement,
                },
            ]);
        } finally {
            setChatPendingAction(null);
        }
    }

    function handleChatInputChange(value: string, cursorPos?: number) {
        setChatInput(value);
        const pos = cursorPos ?? value.length;
        const textBeforeCursor = value.substring(0, pos);
        const lastSlash = textBeforeCursor.lastIndexOf("/");
        const charBefore = lastSlash > 0 ? textBeforeCursor[lastSlash - 1] : "";

        if (lastSlash >= 0 && (lastSlash === 0 || /\s/.test(charBefore))) {
            const afterSlash = textBeforeCursor.substring(lastSlash + 1);
            const lowerAfter = afterSlash.toLowerCase();

            // Check if afterSlash starts with a known command keyword followed by space
            // e.g. "/database myfilter" → command is "database", filter is "myfilter"
            const commandWithFilter = SLASH_COMMANDS.find((c) =>
                lowerAfter === c.key || lowerAfter.startsWith(c.key + " ")
            );

            if (commandWithFilter) {
                setSlashMenuStart(lastSlash);
                const filterText = lowerAfter.startsWith(commandWithFilter.key + " ")
                    ? lowerAfter.substring(commandWithFilter.key.length + 1).trim()
                    : "";
                if (commandWithFilter.key === "database") {
                    setSlashMenuType("database");
                } else {
                    setSlashMenuType("table");
                }
                setSlashMenuFilter(filterText);
                setSlashMenuOpen(true);
                setSlashMenuPage(0);
                return;
            }

            // No space after slash — typing a command or filter
            if (!afterSlash.includes(" ")) {
                setSlashMenuStart(lastSlash);

                // Exact command match
                const exactMatch = SLASH_COMMANDS.find((c) => c.key === lowerAfter);
                if (exactMatch) {
                    if (exactMatch.key === "database") {
                        setSlashMenuType("database");
                    } else {
                        setSlashMenuType("table");
                    }
                    setSlashMenuFilter("");
                    setSlashMenuOpen(true);
                    setSlashMenuPage(0);
                    return;
                }

                // Partial command match
                const matchingCmds = SLASH_COMMANDS.filter((c) => c.key.startsWith(lowerAfter));
                if (matchingCmds.length === 1) {
                    // Single matching command — show its sub-menu
                    if (matchingCmds[0].key === "database") {
                        setSlashMenuType("database");
                    } else {
                        setSlashMenuType("table");
                    }
                    setSlashMenuFilter("");
                } else if (slashMenuOpen && (slashMenuType === "database" || slashMenuType === "table")) {
                    // Already in a sub-menu — use text as filter
                    setSlashMenuFilter(lowerAfter);
                } else {
                    // Show command list
                    setSlashMenuType("command");
                    setSlashMenuFilter(lowerAfter);
                }
                setSlashMenuOpen(true);
                setSlashMenuPage(0);
                return;
            }
        }
        setSlashMenuOpen(false);
    }

    function handleSlashSelect(item: string) {
        if (slashMenuType === "command") {
            // Replace from slash start to end with the command + space
            const before = chatInput.substring(0, slashMenuStart);
            const newText = before + "/" + item + " ";
            setChatInput(newText);
            if (item === "database") {
                setSlashMenuType("database");
                setSlashMenuFilter("");
            } else if (item === "table") {
                setSlashMenuType("table");
                setSlashMenuFilter("");
            }
            setSlashMenuOpen(true);
            setSlashMenuPage(0);
            setSlashMenuDB("");
        } else if (slashMenuType === "database") {
            const baseText = stripSlashCommand(chatInput, slashMenuStart);
            setChatInput(baseText ? `${baseText} ` : "");
            handleSelectDatabase(item);
            setSlashMenuOpen(false);
            setSlashMenuDB(item);
        } else if (slashMenuType === "table") {
            const baseText = stripSlashCommand(chatInput, slashMenuStart);
            setChatInput(baseText ? `${baseText} ` : "");
            if (item.includes(".")) {
                const [databaseName, tableName] = item.split(".", 2);
                handleSelectDatabase(databaseName);
                setChatContextTables((current) => appendUnique(current.filter((name) => name !== tableName), tableName));
                setSlashMenuDB(databaseName);
            } else {
                setChatContextTables((current) => appendUnique(current, item));
            }
            setSlashMenuOpen(false);
        }
    }

    function handleChatDrop(payload: ChatDropPayload) {
        if (payload.kind === "database") {
            handleSelectDatabase(payload.database);
            return;
        }

        if (!payload.table) {
            return;
        }

        const tableName = payload.table;

        setChatContextDatabase(payload.database);
        setChatContextTables((current) => (chatContextDatabase && chatContextDatabase !== payload.database ? [tableName] : appendUnique(current, tableName)));
    }



    function renderAIPage() {
        return (
            <AIPage
                aiNotice={aiNotice}
                aiForm={aiForm}
                setAIForm={setAIForm}
                isSavingAI={isSavingAI}
                onSave={handleSaveAISettings}
                onClear={handleClearAPIKey}
                aiState={workspaceState.ai}
                selectedConnectionName={selectedConnection?.name || ""}
            />
        );
    }

    function renderThemePage() {
        return (
            <ThemePage
                themeMode={themeMode}
                setThemeMode={setThemeMode}
                customTheme={customTheme}
                setCustomTheme={setCustomTheme}
                pushToast={pushToast}
            />
        );
    }

    function renderCurrentPage() {
        if (workMode === "chat") {
            return (
                <ChatPage
                    selectedConnection={selectedConnection}
                    chatDisplayMode={chatDisplayMode}
                    setChatDisplayMode={setChatDisplayMode}
                    chatStreamRef={chatStreamRef}
                    chatMessages={chatMessages}
                    isRunningChat={isRunningChat}
                    handleCopyUserMessage={handleCopyUserMessage}
                    handleEditUserMessage={handleEditUserMessage}
                    handleCopyText={handleCopyText}
                    handleCopyChatResult={handleCopyChatResult}
                    handleCopyChatMessage={handleCopyChatMessage}
                    chatPendingAction={chatPendingAction}
                    setChatPendingAction={setChatPendingAction}
                    executeChatSQL={executeChatSQL}
                    isExecutingQuery={isExecutingQuery}
                    chatDropActive={chatDropActive}
                    setChatDropActive={setChatDropActive}
                    chatContextDatabase={chatContextDatabase}
                    setChatContextDatabase={setChatContextDatabase}
                    chatContextTables={chatContextTables}
                    setChatContextTables={setChatContextTables}
                    chatInput={chatInput}
                    setChatInput={setChatInput}
                    handleSendChatMessage={handleSendChatMessage}
                    handleChatInputChange={handleChatInputChange}
                    handleSlashSelect={handleSlashSelect}
                    handleChatDrop={handleChatDrop}
                    slashMenuOpen={slashMenuOpen}
                    slashMenuItems={slashMenuItems}
                    slashMenuTotalPages={slashMenuTotalPages}
                    slashMenuPageSafe={slashMenuPageSafe}
                    pagedSlashMenuItems={pagedSlashMenuItems}
                    slashMenuActiveIndex={slashMenuActiveIndex}
                    setSlashMenuPage={setSlashMenuPage}
                    setSlashMenuActiveIndex={setSlashMenuActiveIndex}
                    setSlashMenuOpen={setSlashMenuOpen}
                    slashMenuType={slashMenuType}
                />
            );
        }

        switch (activePage) {
            case "connections":
                return (
                    <ConnectionsPage
                        connectionNotice={connectionNotice}
                        workspaceState={workspaceState}
                        selectedConnectionId={selectedConnectionId}
                        connectionDraft={connectionDraft}
                        setConnectionDraft={setConnectionDraft}
                        showPassword={showPassword}
                        setShowPassword={setShowPassword}
                        connectionTest={connectionTest}
                        isTestingConnection={isTestingConnection}
                        isSavingConnection={isSavingConnection}
                        handleSelectConnection={handleSelectConnection}
                        fillConnectionDraft={fillConnectionDraft}
                        handleDeleteConnection={handleDeleteConnection}
                        handleTestConnection={handleTestConnection}
                        handleSaveConnection={handleSaveConnection}
                        updateConnectionField={updateConnectionField}
                        pushToast={pushToast}
                    />
                );
            case "query":
                return (
                    <QueryPage
                        isExecutingQuery={isExecutingQuery}
                        handleExecuteQuery={handleExecuteQuery}
                        handleBeautifySQL={handleBeautifySQL}
                        isOptimizingSQL={isOptimizingSQL}
                        sqlText={sqlText}
                        handleOptimizeSQL={handleOptimizeSQL}
                        sqlFileInputRef={sqlFileInputRef}
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
                        openCellEditor={openCellEditor}
                        handleCopySQL={handleCopySQL}
                        handleExportQuerySQL={handleExportQuerySQL}
                        handleExportQueryCSV={handleExportQueryCSV}
                        handleExportQueryExcel={handleExportQueryExcel}
                        handleExportSelectedRows={handleExportSelectedRows}
                        isExporting={isExporting}
                        canDeleteSelectedRows={canDeleteSelectedRows}
                        handleRequestDeleteSelectedRows={handleRequestDeleteSelectedRows}
                        queryPageSizeOptions={QUERY_PAGE_SIZE_OPTIONS}
                    />
                );
            case "history":
                return (
                    <HistoryPage
                        selectedConnection={selectedConnection}
                        historyItems={historyItems}
                        setHistoryItems={setHistoryItems}
                        historyPage={historyPage}
                        setHistoryPage={setHistoryPage}
                        pushToast={pushToast}
                        setSQLText={setSQLText}
                        setPreviewContext={setPreviewContext}
                        handleSelectDatabase={handleSelectDatabase}
                        setExpandedDatabases={setExpandedDatabases}
                        setSelectedTable={setSelectedTable}
                        setActivePage={setActivePage}
                        setSidebarView={setSidebarView}
                        setQueryNotice={setQueryNotice}
                    />
                );
            case "schema":
                return (
                    <SchemaPage
                        selectedTable={selectedTable}
                        tableDetail={tableDetail}
                        schemaNotice={schemaNotice}
                        schemaDraftFields={schemaDraftFields}
                        mysqlTypeOptions={mysqlTypeOptions}
                        updateDraftField={updateDraftField}
                        applyFieldSuggestion={applyFieldSuggestion}
                        handleGenerateFieldComment={handleGenerateFieldComment}
                        handleDeleteDraftField={handleDeleteDraftField}
                        handleAddField={handleAddField}
                        setRenameModalOpen={setRenameModalOpen}
                        handleExportDDL={handleExportDDL}
                        isExporting={isExporting}
                        handleCopyDDL={handleCopyDDL}
                        currentAlterSQL={currentAlterSQL}
                        renameModalOpen={renameModalOpen}
                        renameTableName={renameTableName}
                        setRenameTableName={setRenameTableName}
                        handleRenameTable={handleRenameTable}
                        isRenamingTable={isRenamingTable}
                    />
                );
            case "ai":
                return renderAIPage();
            case "theme":
                return renderThemePage();
            case "settings":
                return (
                    <SettingsPage
                        browserPreview={browserPreview}
                        newStoragePath={newStoragePath}
                        setNewStoragePath={setNewStoragePath}
                        storageInfo={storageInfo}
                        setStorageInfo={setStorageInfo}
                        showPermissionModal={showPermissionModal}
                        setShowPermissionModal={setShowPermissionModal}
                        showClearModal={showClearModal}
                        setShowClearModal={setShowClearModal}
                        pushToast={pushToast}
                        refreshWorkspaceState={refreshWorkspaceState}
                    />
                );
            default:
                return null;
        }
    }

    return (
        <>
            {/* 启动页 */}
            {showSplash && (
                <div className="splash-screen">
                    <div className="splash-bg-decoration">
                        <div className="splash-orb splash-orb--1" />
                        <div className="splash-orb splash-orb--2" />
                        <div className="splash-orb splash-orb--3" />
                    </div>
                    <div className="splash-content">
                        <div className="splash-logo-wrap">
                            <div className="splash-pulse-ring" />
                            <div className="splash-pulse-ring splash-pulse-ring--delay" />
                            <img src={splashLogo} alt="SQLCompass" className="splash-logo" />
                        </div>
                        <div className="splash-brand">SQLCompass</div>
                        <div className="splash-tagline">更懂开发的数据库客户端</div>
                        <div className="splash-loader">
                            <div className="splash-loader-track">
                                <div className="splash-loader-thumb" />
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <div className={`studio-shell${sidebarCollapsed ? " studio-shell--collapsed" : ""}`}>
                <FloatingToast toast={toast} />
                <input ref={sqlFileInputRef} type="file" accept=".sql,.txt" hidden onChange={handleImportSQLFile} />

            <aside className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
                <div className="sidebar-brand">
                    {!sidebarCollapsed ? (
                        <div className="sidebar-brand__title">
                            <img src={splashLogo} alt="SQLCompass" className="sidebar-brand__logo" />
                            <div className="sidebar-brand__text">
                                <strong>SQLCompass</strong>
                                <span>更懂开发的数据库客户端</span>
                            </div>
                            <button type="button" className="sidebar-collapse" onClick={() => setSidebarCollapsed((current) => !current)} title="收起侧边栏">
                                ‹
                            </button>
                        </div>
                    ) : (
                        <button type="button" className="sidebar-collapse sidebar-collapse--collapsed" onClick={() => setSidebarCollapsed((current) => !current)} title="展开侧边栏">
                            <img src={splashLogo} alt="SQLCompass" className="sidebar-brand__logo--collapsed" />
                        </button>
                    )}
                </div>

                {!sidebarCollapsed ? (
                    <>
                        <div className="sidebar-tabs">
                            <button
                                type="button"
                                className={`sidebar-tab${sidebarView === "database" ? " sidebar-tab--active" : ""}`}
                                onClick={() => setSidebarView("database")}
                                title="数据库"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                                </svg>
                                <span>数据库</span>
                            </button>
                            <button
                                type="button"
                                className={`sidebar-tab${sidebarView === "workbench" ? " sidebar-tab--active" : ""}`}
                                onClick={() => setSidebarView("workbench")}
                                title="工作台"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                    <line x1="8" y1="21" x2="16" y2="21"></line>
                                    <line x1="12" y1="17" x2="12" y2="21"></line>
                                </svg>
                                <span>工作台</span>
                            </button>
                        </div>

                        {sidebarView === "database" && selectedConnection && (
                            <div className="sidebar-chat-toggle">
                                <label className="chat-toggle-label">
                                    <input
                                        type="checkbox"
                                        checked={workMode === "chat"}
                                        onChange={(e) => setWorkMode(e.target.checked ? "chat" : "normal")}
                                    />
                                    <span className="chat-toggle-slider"></span>
                                    <span className="chat-toggle-text">启用Chat模式</span>
                                </label>
                            </div>
                        )}

                        {sidebarView === "database" ? (
                            <div className="sidebar-section sidebar-section--fill">
                                <div className="sidebar-title sidebar-title--with-actions">
                                    <span>数据库 / 数据表</span>
                                    <div className="sidebar-title__actions">
                                        <button
                                            type="button"
                                            className={`sidebar-icon-btn${showDatabaseFilter ? " sidebar-icon-btn--active" : ""}`}
                                            onClick={() => setShowDatabaseFilter((prev) => !prev)}
                                            title="筛选数据库"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                            </svg>
                                        </button>
                                        {selectedDatabase && (
                                            <button
                                                type="button"
                                                className={`sidebar-icon-btn${showTableFilter ? " sidebar-icon-btn--active" : ""}`}
                                                onClick={() => setShowTableFilter((prev) => !prev)}
                                                title="筛选数据表"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18"></path>
                                                </svg>
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="sidebar-icon-btn"
                                            onClick={saveFilterSettings}
                                            title="保存筛选设置"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                                <polyline points="7 3 7 8 15 8"></polyline>
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Database Filter Panel */}
                                {showDatabaseFilter && explorerTree && (
                                    <div className="filter-panel">
                                        <div className="filter-panel__header">
                                            <span>筛选数据库</span>
                                            <button
                                                type="button"
                                                className="filter-panel__clear"
                                                onClick={() => setDatabaseFilter([])}
                                            >
                                                清空
                                            </button>
                                        </div>
                                        <div className="filter-panel__list">
                                            {explorerTree.databases.map((db) => (
                                                <label key={db.name} className="filter-panel__item">
                                                    <input
                                                        type="checkbox"
                                                        checked={databaseFilter.includes(db.name)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setDatabaseFilter((prev) => [...prev, db.name]);
                                                            } else {
                                                                setDatabaseFilter((prev) => prev.filter((n) => n !== db.name));
                                                            }
                                                        }}
                                                    />
                                                    <span>{db.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Table Filter Panel */}
                                {showTableFilter && selectedDatabase && explorerTree && (
                                    <div className="filter-panel">
                                        <div className="filter-panel__header">
                                            <span>筛选数据表</span>
                                            <button
                                                type="button"
                                                className="filter-panel__clear"
                                                onClick={() => setTableFilter([])}
                                            >
                                                清空
                                            </button>
                                        </div>
                                        <div className="filter-panel__list">
                                            {explorerTree.databases
                                                .find((db) => db.name === selectedDatabase)
                                                ?.tables.map((table) => (
                                                    <label key={table.name} className="filter-panel__item">
                                                        <input
                                                            type="checkbox"
                                                            checked={tableFilter.includes(table.name)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setTableFilter((prev) => [...prev, table.name]);
                                                                } else {
                                                                    setTableFilter((prev) => prev.filter((n) => n !== table.name));
                                                                }
                                                            }}
                                                        />
                                                        <span>{table.name}</span>
                                                    </label>
                                                ))}
                                        </div>
                                    </div>
                                )}

                                <div className="sidebar-search">
                                    <input
                                        value={tableSearch}
                                        onChange={(event) => setTableSearch(event.target.value)}
                                        disabled={!selectedDatabase}
                                        placeholder={selectedDatabase ? "搜索当前数据库中的表" : "先选择数据库再搜索表"}
                                    />
                                </div>
                                <div className="navigator-shell">
                                    <SidebarTree
                                        explorerTree={explorerTree}
                                        databaseFilter={databaseFilter}
                                        selectedDatabase={selectedDatabase}
                                        expandedDatabases={expandedDatabases}
                                        setExpandedDatabases={setExpandedDatabases}
                                        tableSearch={tableSearch}
                                        tableFilter={tableFilter}
                                        tablePageByDatabase={tablePageByDatabase}
                                        setTablePageByDatabase={setTablePageByDatabase}
                                        workMode={workMode}
                                        selectedTable={selectedTable}
                                        handleSelectDatabase={handleSelectDatabase}
                                        handlePreviewTable={handlePreviewTable}
                                        tableContextMenu={tableContextMenu}
                                        setTableContextMenu={setTableContextMenu}
                                        openTableDesigner={openTableDesigner}
                                        pushToast={pushToast}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="sidebar-section sidebar-section--fill">
                                <div className="page-button-list page-button-list--scrollable page-button-list--workbench">
                                    {pages.map((page) => (
                                        <button
                                            key={page.id}
                                            type="button"
                                            className={`page-button${activePage === page.id ? " page-button--active" : ""}`}
                                            onClick={() => {
                                                // 从工作台选择页面时，自动退出 Chat 模式
                                                if (workMode === "chat") {
                                                    setWorkMode("normal");
                                                }
                                                setActivePage(page.id);
                                            }}
                                        >
                                            <strong>{page.label}</strong>
                                            <span>{page.summary}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : null}
            </aside>

            <main className="workbench">
                <div className="workbench-body">
                    <NoticeBanner notice={workspaceNotice} />
                    {renderCurrentPage()}
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
                cellEditor={cellEditor}
                setCellEditor={setCellEditor}
                isSavingCell={isSavingCell}
                handleConfirmCellEdit={handleConfirmCellEdit}
                pushToast={pushToast}
            />

            <DeleteDialogModal
                deleteDialog={deleteDialog}
                setDeleteDialog={setDeleteDialog}
                isExecutingQuery={isExecutingQuery}
                handleConfirmDeleteSelectedRows={handleConfirmDeleteSelectedRows}
            />


            </div>
        </>
    );
}

export default App;
