import Editor, { type Monaco } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { IDisposable, editor as MonacoEditorNS } from "monaco-editor";
import {
    AnalyzeSQL,
    BeautifySQL,
    ChatWithDatabase,
    ClearAIAPIKey,
    ClearStorageData,
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
    GrantStoragePermission,
    OptimizeSQL,
    PreviewTableData,
    RepairChatSQL,
    RenameTable,
    SaveAISettings,
    SaveConnection,
    SelectStorageDirectory,
    SetStoragePath,
    TestConnection,
} from "../wailsjs/go/main/App";
import "./App.css";
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
    SetStoragePathResult,
    SQLAnalysis,
    SQLOptimizeResult,
    StorageInfoView,
    TableDetail,
    TableField,
    TableNode,
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
const tablePageSize = 12;
const previewPageSize = 30;
const queryPageSize = 50;
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

const engineLabels: Record<string, string> = {
    mysql: "MySQL",
    mariadb: "MariaDB",
    postgresql: "PostgreSQL",
    sqlite: "SQLite",
    clickhouse: "ClickHouse",
    mongodb: "MongoDB",
    redis: "Redis",
};

// 引擎图标组件 —— 使用简洁可识别的矢量图标
// 引擎图标组件 —— 使用官方/标准 SVG logo
function EngineIcon({ engine, size = 18 }: { engine: string; size?: number }) {
    const s = size;
    const icons: Record<string, JSX.Element> = {
        // MySQL 官方海豚 logo - 简化版
        mysql: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#00758F"/>
                <path d="M7 8c.5 0 1 .2 1.4.6.4.4.6.9.6 1.4 0 .5-.2 1-.6 1.4-.4.4-.9.6-1.4.6s-1-.2-1.4-.6c-.4-.4-.6-.9-.6-1.4 0-.5.2-1 .6-1.4.4-.4.9-.6 1.4-.6z" fill="#fff"/>
                <path d="M12 6c.8 0 1.5.3 2.1.9.6.6.9 1.3.9 2.1 0 .8-.3 1.5-.9 2.1-.6.6-1.3.9-2.1.9-.8 0-1.5-.3-2.1-.9-.6-.6-.9-1.3-.9-2.1 0-.8.3-1.5.9-2.1.6-.6 1.3-.9 2.1-.9z" fill="#F29111"/>
                <path d="M17 9c.5 0 1 .2 1.4.6.4.4.6.9.6 1.4 0 .5-.2 1-.6 1.4-.4.4-.9.6-1.4.6s-1-.2-1.4-.6c-.4-.4-.6-.9-.6-1.4 0-.5.2-1 .6-1.4.4-.4.9-.6 1.4-.6z" fill="#fff"/>
                <path d="M8 14c.4 0 .8.2 1.1.5.3.3.5.7.5 1.1 0 .4-.2.8-.5 1.1-.3.3-.7.5-1.1.5-.4 0-.8-.2-1.1-.5-.3-.3-.5-.7-.5-1.1 0-.4.2-.8.5-1.1.3-.3.7-.5 1.1-.5z" fill="#fff"/>
                <path d="M16 14c.4 0 .8.2 1.1.5.3.3.5.7.5 1.1 0 .4-.2.8-.5 1.1-.3.3-.7.5-1.1.5-.4 0-.8-.2-1.1-.5-.3-.3-.5-.7-.5-1.1 0-.4.2-.8.5-1.1.3-.3.7-.5 1.1-.5z" fill="#F29111"/>
                <path d="M12 16c.3 0 .6.1.8.3.2.2.3.5.3.8 0 .3-.1.6-.3.8-.2.2-.5.3-.8.3-.3 0-.6-.1-.8-.3-.2-.2-.3-.5-.3-.8 0-.3.1-.6.3-.8.2-.2.5-.3.8-.3z" fill="#fff"/>
            </svg>
        ),
        // MariaDB logo
        mariadb: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#003545"/>
                <circle cx="12" cy="12" r="8" fill="#1F6FB6"/>
                <path d="M12 5c-2 3-3 6-3 9s1 5.5 3 8c2-2.5 3-5 3-8s-1-6-3-9z" fill="#C49A6C"/>
                <path d="M9 8c.5 1.5 1 3.5 1 6s-.5 4.5-1 6" stroke="#003545" strokeWidth="0.8" fill="none"/>
                <path d="M15 8c-.5 1.5-1 3.5-1 6s.5 4.5 1 6" stroke="#003545" strokeWidth="0.8" fill="none"/>
            </svg>
        ),
        // PostgreSQL 大象 logo
        postgresql: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#336791"/>
                <path d="M12 4c-4.4 0-8 3.6-8 8s3.6 8 8 8c1.7 0 3.2-.5 4.5-1.4-1-1.5-1.8-3.2-2.3-4.8-.5-1.6-.7-3.2-.7-4.8 0-1.6.2-3.2.7-4.8.5-1.6 1.3-3.3 2.3-4.8C15.2 4.5 13.7 4 12 4z" fill="#fff"/>
                <path d="M16.5 4.6c-1 1.5-1.8 3.2-2.3 4.8-.5 1.6-.7 3.2-.7 4.8 0 1.6.2 3.2.7 4.8.5 1.6 1.3 3.3 2.3 4.8 2.3-1.6 3.8-4.2 3.8-7.2s-1.5-5.6-3.8-7.2z" fill="#336791"/>
                <circle cx="14" cy="10" r="1.5" fill="#336791"/>
                <path d="M7 6l-2-2M17 6l2-2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
        ),
        // SQLite logo
        sqlite: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" fill="#003B57"/>
                <path d="M7 7h10" stroke="#44A8B3" strokeWidth="2" strokeLinecap="round"/>
                <path d="M7 11h7" stroke="#44A8B3" strokeWidth="2" strokeLinecap="round"/>
                <path d="M7 15h4" stroke="#44A8B3" strokeWidth="2" strokeLinecap="round"/>
                <path d="M15 13l4-4v10l-4-4" fill="#0F80CC"/>
            </svg>
        ),
        // ClickHouse logo
        clickhouse: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="2" fill="#FFCC00"/>
                <rect x="5" y="5" width="4" height="14" rx="1" fill="#000"/>
                <rect x="11" y="9" width="4" height="10" rx="1" fill="#000"/>
                <rect x="17" y="13" width="3" height="6" rx="1" fill="#000"/>
            </svg>
        ),
        // MongoDB 叶子 logo
        mongodb: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M12 2c-1.5 4-2 7.5-2 10.5s.8 6.5 2 9c1.2-2.5 2-5.5 2-9S13.5 6 12 2z" fill="#4FA94D"/>
                <path d="M12 2v19.5" stroke="#3E7B3D" strokeWidth="1"/>
                <path d="M9.5 5c.5 1.5.8 3.3.8 5.3 0 2-.3 4-.8 5.8" stroke="#70BF6E" strokeWidth="1" fill="none" strokeLinecap="round"/>
                <path d="M14.5 5c-.5 1.5-.8 3.3-.8 5.3 0 2 .3 4 .8 5.8" stroke="#70BF6E" strokeWidth="1" fill="none" strokeLinecap="round"/>
            </svg>
        ),
        // Redis logo
        redis: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <ellipse cx="12" cy="6" rx="8" ry="3" fill="#DC382D"/>
                <path d="M4 6v4c0 1.7 3.6 3 8 3s8-1.3 8-3V6" fill="#A82A26"/>
                <path d="M4 10v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4" fill="#DC382D"/>
                <path d="M4 14v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4" fill="#A82A26"/>
                <path d="M8 5c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5zM16 5c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5z" fill="#fff"/>
                <path d="M10 9c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5zM14 9c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5z" fill="#fff"/>
                <path d="M9 13c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5zM15 13c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5z" fill="#fff"/>
            </svg>
        ),
    };
    return icons[engine] || (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8" stroke="#9CA3AF" strokeWidth="1.5" fill="none"/>
            <circle cx="12" cy="12" r="3" fill="#9CA3AF"/>
        </svg>
    );
}

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

function defaultPortForEngine(engine: string): number {
    switch (engine) {
        case "mysql":
        case "mariadb":
            return 3306;
        case "postgresql":
            return 5432;
        case "clickhouse":
            return 8123;
        case "mongodb":
            return 27017;
        case "redis":
            return 6379;
        default:
            return 0;
    }
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

function connectionTargetLabel(profile: ConnectionProfile): string {
    if (profile.engine === "sqlite") {
        return profile.filePath || "未选择文件";
    }

    if (profile.url) {
        return profile.url;
    }

    return `${profile.host}:${profile.port}`;
}

function formatDateTime(value: string): string {
    try {
        return new Intl.DateTimeFormat("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value));
    } catch {
        return value;
    }
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

function setDragPreview(event: React.DragEvent<HTMLElement>, title: string, typeLabel: string) {
    const preview = document.createElement("div");
    preview.className = "drag-preview";
    preview.innerHTML = `<span class="drag-preview__type">${escapeHTML(typeLabel)}</span><strong class="drag-preview__title">${escapeHTML(title)}</strong>`;
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 18, 18);
    window.setTimeout(() => {
        document.body.removeChild(preview);
    }, 0);
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

function isTextLikeType(type: string): boolean {
    return /(text|blob|json|longtext|mediumtext|tinytext)/i.test(type);
}

function isDateLikeType(type: string): boolean {
    return /(date|time|timestamp|datetime|year)/i.test(type);
}

function editorInputType(type: string): "text" | "date" | "time" | "datetime-local" {
    if (/^date$/i.test(type)) {
        return "date";
    }
    if (/^time/i.test(type)) {
        return "time";
    }
    if (/(datetime|timestamp)/i.test(type)) {
        return "datetime-local";
    }
    return "text";
}

function formatCellPreview(value: string, type: string): string {
    if (!isTextLikeType(type)) {
        return value;
    }

    const normalized = (value || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= 48) {
        return normalized;
    }
    return `${normalized.slice(0, 48)}...`;
}

function toEditorValue(value: string, type: string): string {
    const normalized = value ?? "";
    if (editorInputType(type) === "datetime-local") {
        return normalized.replace(" ", "T").slice(0, 16);
    }
    return normalized;
}

function fromEditorValue(value: string, type: string): string {
    if (editorInputType(type) === "datetime-local") {
        return value ? value.replace("T", " ") : "";
    }
    return value;
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

function escapeHTML(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

async function copyText(value: string): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
}

function NoticeBanner({ notice }: { notice: Notice | null }) {
    if (!notice) {
        return null;
    }

    const iconMap: Record<NoticeTone, string> = {
        success: "✓",
        error: "!",
        info: "ℹ",
    };

    return (
        <div className={`notice-banner notice-banner--${notice.tone}`}>
            <span className="notice-banner__icon">{iconMap[notice.tone]}</span>
            <span className="notice-banner__text">{notice.message}</span>
        </div>
    );
}

function FloatingToast({ toast }: { toast: Toast | null }) {
    if (!toast) {
        return null;
    }

    return (
        <div className="floating-toast">
            <div className={`toast toast--${toast.tone}`}>
                <strong>{toast.title}</strong>
                <span>{toast.message}</span>
            </div>
        </div>
    );
}

function CopyableText({
    value,
    helperText = "点击复制完整名称",
    onCopied,
}: {
    value: string;
    helperText?: string;
    onCopied: (value: string) => void;
}) {
    const closeTimerRef = useRef<number | null>(null);
    const openTimerRef = useRef<number | null>(null);
    const labelRef = useRef<HTMLSpanElement | null>(null);
    const [open, setOpen] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

    function clearCloseTimer() {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }

    function clearOpenTimer() {
        if (openTimerRef.current !== null) {
            window.clearTimeout(openTimerRef.current);
            openTimerRef.current = null;
        }
    }

    function openTooltip() {
        clearCloseTimer();
        setOpen(true);
    }

    function closeTooltip() {
        clearOpenTimer();
        clearCloseTimer();
        closeTimerRef.current = window.setTimeout(() => setOpen(false), 140);
    }

    function updateTooltipPosition(clientX: number, clientY: number) {
        const tooltipWidth = 320;
        const padding = 18;
        const maxX = Math.max(padding, window.innerWidth - tooltipWidth - padding);
        setTooltipPosition({
            x: Math.min(clientX + 14, maxX),
            y: Math.max(18, clientY + 18),
        });
    }

    function shouldShowTooltip() {
        const element = labelRef.current;
        if (!element) {
            return false;
        }

        return element.scrollWidth > element.clientWidth || helperText.trim().length > 0;
    }

    return (
        <div
            className="copyable-text"
            onMouseEnter={(event) => {
                updateTooltipPosition(event.clientX, event.clientY);
                clearOpenTimer();
                openTimerRef.current = window.setTimeout(() => {
                    if (shouldShowTooltip()) {
                        openTooltip();
                    }
                }, 220);
            }}
            onMouseLeave={closeTooltip}
            onMouseMove={(event) => updateTooltipPosition(event.clientX, event.clientY)}
            onContextMenu={() => {
                clearOpenTimer();
                clearCloseTimer();
                setOpen(false);
            }}
        >
            <span ref={labelRef} className="copyable-text__label">{value}</span>
            <div
                className={`copyable-text__tooltip${open ? " copyable-text__tooltip--open" : ""}`}
                style={{
                    left: tooltipPosition.x,
                    top: tooltipPosition.y,
                }}
                onMouseEnter={clearCloseTimer}
                onMouseLeave={closeTooltip}
            >
                <strong>{value}</strong>
                <span>{helperText}</span>
            </div>
        </div>
    );
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

    function toggleDatabaseExpanded(databaseName: string) {
        setExpandedDatabases((current) => ({
            ...current,
            [databaseName]: !(current[databaseName] ?? databaseName === selectedDatabase),
        }));
    }

    async function handlePreviewTable(databaseName: string, tableName: string, nextPage = 1) {
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
                pageSize: previewPageSize,
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

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            const currentSelection = editor.getSelection();
            if (currentSelection && !currentSelection.isEmpty()) {
                handleExecuteSelectedSQL().catch(() => undefined);
                return;
            }

            handleExecuteQuery(1).catch(() => undefined);
        });

        // 强制开启自动建议（Wails 环境下可能需要）
        editor.updateOptions({ quickSuggestionsDelay: 100 });

        editor.onDidChangeCursorSelection(() => syncSelectedSnippet());
        editor.onDidScrollChange(() => syncSelectedSnippet());

        // 监听按键，在输入字母时主动触发补全
        editor.onKeyDown((e) => {
            const key = e.browserEvent.key;
            if (key.length === 1 && /[a-zA-Z]/.test(key)) {
                window.setTimeout(() => {
                    if (editor && editor.hasTextFocus()) {
                        editor.trigger("keyboard", "editor.action.triggerSuggest", {});
                    }
                }, 80);
            }
        });

        // 内容变化时也触发
        editor.onDidChangeModelContent(() => {
            if (editor.hasTextFocus()) {
                setTimeout(() => {
                    editor.trigger("keyboard", "editor.action.triggerSuggest", {});
                }, 60);
            }
        });
    }

    async function runSQL(statement: string, nextPage = 1) {
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
                pageSize: queryPageSize,
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

    function renderSidebarTree() {
        if (!explorerTree || explorerTree.databases.length === 0) {
            return <div className="sidebar-empty">先选择一个连接，或者先在连接管理里新建连接。</div>;
        }

        // Apply database filter if set
        const filteredDatabases = databaseFilter.length > 0
            ? explorerTree.databases.filter((db) => databaseFilter.includes(db.name))
            : explorerTree.databases;

        return filteredDatabases.map((database) => {
            const isActive = database.name === selectedDatabase;
            const isExpanded = expandedDatabases[database.name] ?? isActive;
            const shouldFilterTables = Boolean(tableSearch.trim()) && database.name === selectedDatabase;
            let filteredTables = shouldFilterTables
                ? database.tables.filter((table) => table.name.toLowerCase().includes(tableSearch.trim().toLowerCase()))
                : database.tables;
            // Apply table filter if set and this is the selected database
            if (tableFilter.length > 0 && database.name === selectedDatabase) {
                filteredTables = filteredTables.filter((table) => tableFilter.includes(table.name));
            }
            const page = tablePageByDatabase[database.name] ?? 1;
            const pageCount = Math.max(1, Math.ceil(filteredTables.length / tablePageSize));
            const normalizedPage = Math.min(page, pageCount);
            const start = (normalizedPage - 1) * tablePageSize;
            const visibleTables: TableNode[] = filteredTables.slice(start, start + tablePageSize);

            return (
                    <div key={database.name} className={`navigator-db${isActive ? " navigator-db--active" : ""}`}>
                        <div className="navigator-db__row">
                            <div className="navigator-db__button" role="button" tabIndex={0} draggable={workMode === "chat"} onDragStart={(event) => {
                                if (workMode !== "chat") {
                                    event.preventDefault();
                                    return;
                                }

                                event.dataTransfer.effectAllowed = "copy";
                                event.dataTransfer.setData("application/x-sql-compass-chat-item", JSON.stringify({ kind: "database", database: database.name }));
                                setDragPreview(event, database.name, "数据库");
                            }} onClick={() => handleSelectDatabase(database.name)} onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    handleSelectDatabase(database.name);
                                }
                            }}>
                            <button type="button" className="navigator-toggle" onClick={(event) => {
                                event.stopPropagation();
                                toggleDatabaseExpanded(database.name);
                            }}>
                                {isExpanded ? "▾" : "▸"}
                            </button>
                            <div className="navigator-db__main">
                                <CopyableText
                                    value={database.name}
                                    onCopied={(value) => pushToast(value ? "success" : "error", value ? "已复制数据库名" : "复制失败", value || "请重试")}
                                />
                            </div>
                            <span className="navigator-count">{database.tableCount}</span>
                        </div>
                    </div>

                    {isExpanded ? (
                        <div className="navigator-table-list">
                            {visibleTables.map((table) => (
                                <div
                                    key={table.name}
                                    className={`navigator-table${table.name === selectedTable ? " navigator-table--active" : ""}`}
                                    role="button"
                                    tabIndex={0}
                                    draggable={workMode === "chat"}
                                    onDragStart={(event) => {
                                        if (workMode !== "chat") {
                                            event.preventDefault();
                                            return;
                                        }

                                        event.dataTransfer.effectAllowed = "copy";
                                        event.dataTransfer.setData("application/x-sql-compass-chat-item", JSON.stringify({ kind: "table", database: database.name, table: table.name }));
                                        setDragPreview(event, table.name, "数据表");
                                    }}
                                    onClick={() => handlePreviewTable(database.name, table.name)}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setTableContextMenu({
                                            x: Math.min(event.clientX, window.innerWidth - 148),
                                            y: Math.min(event.clientY, window.innerHeight - 72),
                                            database: database.name,
                                            table: table.name,
                                        });
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            handlePreviewTable(database.name, table.name).catch(() => undefined);
                                        }
                                    }}
                                >
                                    <div className="navigator-table__main">
                                        <CopyableText
                                            value={table.name}
                                            helperText={table.comment || "暂无表注释"}
                                            onCopied={(value) => pushToast(value ? "success" : "error", value ? "已复制表名" : "复制失败", value || "请重试")}
                                        />
                                    </div>
                                    <span className="navigator-meta">
                                        {table.rows === -1 ? "加载中..." : table.rows >= 0 ? table.rows.toLocaleString() : "-"}
                                    </span>
                                </div>
                            ))}

                            {visibleTables.length === 0 ? <div className="navigator-empty">没有匹配的表</div> : null}

                            {pageCount > 1 && visibleTables.length > 0 ? (
                                <div className="navigator-pager">
                                    <button
                                        type="button"
                                        className="mini-ghost-button"
                                        onClick={() =>
                                            setTablePageByDatabase((current) => ({
                                                ...current,
                                                [database.name]: Math.max(1, normalizedPage - 1),
                                            }))
                                        }
                                        disabled={normalizedPage <= 1}
                                    >
                                        上一页
                                    </button>
                                    <span>
                                        {normalizedPage} / {pageCount}
                                    </span>
                                    <button
                                        type="button"
                                        className="mini-ghost-button"
                                        onClick={() =>
                                            setTablePageByDatabase((current) => ({
                                                ...current,
                                                [database.name]: Math.min(pageCount, normalizedPage + 1),
                                            }))
                                        }
                                        disabled={normalizedPage >= pageCount}
                                    >
                                        下一页
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            );
        });
    }

    function renderConnectionsPage() {
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
                                                <div className="connection-card__main" role="button" tabIndex={0} onClick={() => handleSelectConnection(profile)} onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        handleSelectConnection(profile);
                                                    }
                                                }}>
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

    function renderQueryPage() {
        return (
            <section className="page-panel page-panel--wide page-panel--scrollable">
                <div className="page-headline">
                    <div className="toolbar-actions toolbar-actions--end">
                        <button type="button" className="primary-button" onClick={() => handleExecuteQuery(1)} disabled={isExecutingQuery}>
                            {isExecutingQuery ? "执行中..." : "执行"}
                        </button>
                        <button type="button" className="ghost-button" onClick={handleBeautifySQL} disabled={isOptimizingSQL || !sqlText.trim()}>
                            {isOptimizingSQL ? "处理中..." : "美化"}
                        </button>
                        <button type="button" className="ghost-button" onClick={handleOptimizeSQL} disabled={isOptimizingSQL || !sqlText.trim()}>
                            {isOptimizingSQL ? "处理中..." : "优化"}
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
                                    // 补全相关 — 全部开启
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
                                <button
                                    type="button"
                                    className="ghost-button ghost-button--sm"
                                    onClick={() => {
                                        const nextPage = Math.max(1, queryPage - 1);
                                        if (previewContext) {
                                            handlePreviewTable(previewContext.database, previewContext.table, nextPage).catch(() => undefined);
                                            return;
                                        }
                                        runSQL(lastExecutedSQL || sqlText, nextPage).catch(() => undefined);
                                    }}
                                    disabled={queryPage <= 1 || isExecutingQuery}
                                >
                                    上一页
                                </button>
                                <span className="result-board__page-info">{queryPage}</span>
                                <button
                                    type="button"
                                    className="ghost-button ghost-button--sm"
                                    onClick={() => {
                                        const nextPage = queryPage + 1;
                                        if (previewContext) {
                                            handlePreviewTable(previewContext.database, previewContext.table, nextPage).catch(() => undefined);
                                            return;
                                        }
                                        runSQL(lastExecutedSQL || sqlText, nextPage).catch(() => undefined);
                                    }}
                                    disabled={isExecutingQuery || !hasNextQueryPage}
                                >
                                    下一页
                                </button>
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

    function renderSlashMenu() {
        if (!slashMenuOpen) return null;
        if (pagedSlashMenuItems.length === 0) return null;

        return (
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
        );
    }

    function renderChatPage() {
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
                    <div ref={chatStreamRef} className="chat-stream">
                        {chatMessages.length === 0 ? <div className="empty-block">直接用自然语言描述你想查询或操作当前数据库的内容，我会先理解意图，再自动生成 SQL。</div> : null}
                        {chatMessages.map((item) => (
                            <div key={item.id} className={`chat-message chat-message--${item.role}`}>
                                <div className="chat-message__body">
                                    <div className="chat-message__meta">
                                        <div className="chat-message__label">{item.role === "assistant" ? "AI 助手" : "你"}</div>
                                        {item.role === "assistant" ? (
                                            <button type="button" className="chat-bubble-actions__btn" style={{ opacity: 0.55 }} onClick={() => handleCopyChatMessage(item)} title="复制整轮对话">
                                                复制全部
                                            </button>
                                        ) : null}
                                    </div>
                                    <div className={`chat-bubble chat-bubble--${item.role}`}>
                                        <p>{item.content}</p>
                                    </div>
                                    {/* User bubble actions: copy / edit */}
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

                    <div className={`chat-composer-wrap${chatDropActive ? " chat-composer-wrap--drop-active" : ""}`} onDragOver={(event) => {
                        if (!selectedConnection) {
                            return;
                        }

                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                        setChatDropActive(true);
                    }} onDragEnter={(event) => {
                        if (!selectedConnection) {
                            return;
                        }

                        event.preventDefault();
                        setChatDropActive(true);
                    }} onDragLeave={(event) => {
                        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            return;
                        }
                        setChatDropActive(false);
                    }} onDrop={(event) => {
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
                    }}>
                        {renderSlashMenu()}
                        <div className="chat-composer">
                            <div className="chat-context-tags">
                                {chatContextDatabase ? <button type="button" className="chat-context-tag chat-context-tag--database" onClick={() => {
                                    setChatContextDatabase("");
                                    setChatContextTables([]);
                                }}>数据库 · {chatContextDatabase}<span aria-hidden="true">×</span></button> : null}
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

                                        // Enter 发送，Shift+Enter 换行
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

    function renderHistoryPage() {
        const handleClearHistory = () => {
            if (!selectedConnection) return;
            setHistoryItems([]);
            setHistoryPage(1);
            pushToast("success", "历史已清空", "查询历史记录已清空");
        };

        // 分页计算
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
                                            // 解析 SQL 语句中的表名（简单正则匹配）
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
                                                // 展开该数据库
                                                setExpandedDatabases((prev) => ({
                                                    ...prev,
                                                    [item.database]: true,
                                                }));
                                                // 如果解析到了表名，选中它并切换到表设计页
                                                if (tableName) {
                                                    setTimeout(() => setSelectedTable(tableName), 100);
                                                }
                                            }
                                            setActivePage("query");
                                            setSidebarView("database"); // 切换回数据库视图
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

                {/* 分页控件 */}
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

    function renderSchemaPage() {
        return (
            <section className="page-panel page-panel--wide">
                <div className="page-headline">
                    <div>
                        <h2>表设计</h2>
                        <p>{selectedTable ? `当前表：${selectedTable}` : "请先从左侧点击某张表，再进入这里查看结构。"}</p>
                    </div>
                    <div className="toolbar-actions">
                        <button type="button" className="ghost-button" onClick={handleAddField} disabled={!tableDetail}>
                            新增字段
                        </button>
                        <button type="button" className="ghost-button" onClick={() => setRenameModalOpen(true)} disabled={!tableDetail}>
                            重命名表
                        </button>
                        <button type="button" className="ghost-button" onClick={handleExportDDL} disabled={!tableDetail || isExporting}>
                            {isExporting ? "导出中..." : "导出 DDL"}
                        </button>
                    </div>
                </div>

                <NoticeBanner notice={schemaNotice} />

                {!tableDetail ? (
                    <div className="empty-block">左侧点开数据库后，单击某张表先查看前 30 行数据；需要改结构时再切到这里。</div>
                ) : (
                    <div className="schema-layout">
                        <div className="detail-card schema-form-card">
                            <div className="section-title">
                                <div>
                                    <h3>字段结构</h3>
                                </div>
                            </div>
                            <div className="schema-table-shell">
                                <table className="schema-table">
                                    <thead>
                                        <tr>
                                            <th>字段名</th>
                                            <th>类型</th>
                                            <th>可空</th>
                                            <th>默认值</th>
                                            <th>主键</th>
                                            <th>自增</th>
                                            <th>注释</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {schemaDraftFields.map((field, index) => (
                                            <tr key={field.id}>
                                                <td>
                                                    <input
                                                        value={field.name}
                                                        onChange={(event) => updateDraftField(index, "name", event.target.value)}
                                                        onBlur={(event) => applyFieldSuggestion(index, event.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <select value={field.type} onChange={(event) => updateDraftField(index, "type", event.target.value)}>
                                                        {mysqlTypeOptions.map((type) => (
                                                            <option key={type} value={type}>
                                                                {type}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <label className="checkbox-cell">
                                                        <input type="checkbox" checked={field.nullable} onChange={(event) => updateDraftField(index, "nullable", event.target.checked)} />
                                                    </label>
                                                </td>
                                                <td>
                                                    <input value={field.defaultValue} onChange={(event) => updateDraftField(index, "defaultValue", event.target.value)} />
                                                </td>
                                                <td>
                                                    <label className="checkbox-cell">
                                                        <input type="checkbox" checked={field.primary} onChange={(event) => updateDraftField(index, "primary", event.target.checked)} />
                                                    </label>
                                                </td>
                                                <td>
                                                    <label className="checkbox-cell">
                                                        <input type="checkbox" checked={field.autoIncrement} onChange={(event) => updateDraftField(index, "autoIncrement", event.target.checked)} />
                                                    </label>
                                                </td>
                                                <td>
                                                    <div className="comment-editor">
                                                        <input value={field.comment} onChange={(event) => updateDraftField(index, "comment", event.target.value)} />
                                                        {field.needsAiComment ? (
                                                            <button type="button" className="mini-ai-button" onClick={() => handleGenerateFieldComment(index)} disabled={field.aiLoading}>
                                                                {field.aiLoading ? "生成中" : "AI"}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td>
                                                    <button type="button" className="text-button text-button--danger" onClick={() => handleDeleteDraftField(index)}>
                                                        删除
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="detail-card schema-ddl-card">
                            <div className="section-title">
                                <div>
                                    <h3>DDL 语句</h3>
                                </div>
                                <div className="toolbar-actions">
                                    <button type="button" className="ghost-button" onClick={handleCopyDDL}>
                                        复制 DDL
                                    </button>
                                    <button type="button" className="ghost-button" onClick={handleExportDDL} disabled={isExporting}>
                                        {isExporting ? "导出中..." : "导出 SQL"}
                                    </button>
                                </div>
                            </div>
                            <div className="code-block code-block--wide code-block--tall">
                                <pre>{tableDetail.ddl}</pre>
                            </div>
                        </div>

                        <div className="schema-detail-grid">
                            <div className="detail-card schema-detail-card">
                                <div className="section-title">
                                    <div>
                                        <h3>索引诊断</h3>
                                    </div>
                                </div>
                                <ul className="diagnostic-list">
                                    {tableDetail.indexDiagnostics.map((item) => (
                                        <li key={`${item.title}-${item.detail}`}>
                                            <strong>{item.title}</strong>
                                            <span>{item.detail}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="detail-card schema-detail-card">
                                <div className="section-title">
                                    <div>
                                        <h3>结构变更预览 SQL</h3>
                                    </div>
                                </div>
                                <div className="code-block code-block--wide schema-alter-block">
                                    <pre>{currentAlterSQL}</pre>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {renameModalOpen ? (
                    <div className="modal-backdrop" onClick={() => setRenameModalOpen(false)}>
                        <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                            <div className="section-title">
                                <div>
                                    <h3>重命名表</h3>
                                    <p>这个操作不常用，所以收进右上角按钮里。</p>
                                </div>
                            </div>
                            <label className="field">
                                <span>新表名</span>
                                <input value={renameTableName} onChange={(event) => setRenameTableName(event.target.value)} />
                            </label>
                            <div className="toolbar-actions toolbar-actions--end">
                                <button type="button" className="ghost-button" onClick={() => setRenameModalOpen(false)}>
                                    取消
                                </button>
                                <button type="button" className="primary-button" onClick={handleRenameTable} disabled={isRenamingTable}>
                                    {isRenamingTable ? "处理中..." : "确认重命名"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

            </section>
        );
    }

    function renderAIPage() {
        return (
            <section className="page-panel">
                <div className="page-headline">
                    <div className="toolbar-actions">
                        <button type="button" className="ghost-button" onClick={handleClearAPIKey} disabled={isSavingAI}>
                            清空 Key
                        </button>
                        <button type="button" className="primary-button" onClick={handleSaveAISettings} disabled={isSavingAI}>
                            {isSavingAI ? "保存中..." : "保存设置"}
                        </button>
                    </div>
                </div>

                <NoticeBanner notice={aiNotice} />

                <div className="ai-layout">
                    <div className="panel-card">
                        <div className="form-grid">
                            <label className="field field--full">
                                <span>Base URL</span>
                                <input value={aiForm.baseUrl} onChange={(event) => setAIForm((current) => ({ ...current, baseUrl: event.target.value }))} />
                            </label>
                            <label className="field field--full">
                                <span>Model Name</span>
                                <input value={aiForm.modelName} onChange={(event) => setAIForm((current) => ({ ...current, modelName: event.target.value }))} />
                            </label>
                            <label className="field field--full">
                                <span>API Key</span>
                                <input
                                    type="password"
                                    value={aiForm.apiKey}
                                    onChange={(event) => setAIForm((current) => ({ ...current, apiKey: event.target.value }))}
                                    placeholder="输入新 Key 后保存"
                                />
                            </label>
                        </div>
                    </div>

                    <div className="panel-card">
                        <div className="section-title">
                            <div>
                                <h3>当前状态</h3>
                                <p>这里展示的是本地已保存配置，而不是仓库里的明文信息。</p>
                            </div>
                        </div>
                        <div className="summary-list">
                            <div className="summary-item">
                                <span>API 来源</span>
                                <strong>{workspaceState.ai.apiKeySource}</strong>
                            </div>
                            <div className="summary-item">
                                <span>模型</span>
                                <strong>{workspaceState.ai.modelName}</strong>
                            </div>
                            <div className="summary-item">
                                <span>存储方式</span>
                                <strong>{workspaceState.ai.storageMode}</strong>
                            </div>
                            <div className="summary-item">
                                <span>当前连接</span>
                                <strong>{selectedConnection?.name || "未选择"}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    function renderThemePage() {
        const handleSaveTheme = () => {
            window.localStorage.setItem("sql-compass-custom-theme", JSON.stringify(customTheme));
            pushToast("success", "主题已保存", "自定义主题设置已保存到本地");
        };

        const handleResetTheme = () => {
            const defaultTheme = { navFontSize: 14, resultFontSize: 14, fontColor: "#1f2937", accentColor: "#3b82f6", backgroundColor: "#f8fcfb", backgroundImage: null };
            setCustomTheme(defaultTheme);
            window.localStorage.setItem("sql-compass-custom-theme", JSON.stringify(defaultTheme));
            pushToast("success", "主题已重置", "已恢复默认设置");
        };

        const backgroundPresets = [
            { name: "淡青", value: "#e8f4f8" },
            { name: "暖灰", value: "#f5f5f0" },
            { name: "淡紫", value: "#f3f0f7" },
            { name: "薄荷", value: "#f0f7f4" },
            { name: "浅蓝", value: "#f0f4f8" },
            { name: "米白", value: "#faf8f5" },
            { name: "淡粉", value: "#f8f0f5" },
        ];

        const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                setCustomTheme((current) => ({ ...current, backgroundImage: e.target?.result as string }));
            };
            reader.readAsDataURL(file);
        };

        const handleClearBackground = () => {
            setCustomTheme((current) => ({ ...current, backgroundImage: null }));
        };

        /* Live preview styles derived from current state */
        const livePreviewStyle: React.CSSProperties = {
            fontSize: `${customTheme.resultFontSize}px`,
            color: customTheme.fontColor,
            backgroundColor: customTheme.backgroundColor,
            ...(themeMode === "custom" && customTheme.backgroundImage
                ? { backgroundImage: `url(${customTheme.backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" }
                : {}),
        };

        return (
            <section className="page-panel page-panel--full">
                <div className="theme-toolbar">
                    <div className="toolbar-actions">
                        <button type="button" className="ghost-button" onClick={handleResetTheme}>重置</button>
                        <button type="button" className="primary-button" onClick={handleSaveTheme}>保存</button>
                    </div>
                </div>

                <div className="theme-workspace">
                    {/* ===== Left column: Controls ===== */}
                    <div className="theme-controls">

                        {/* Mode selector */}
                        <div className="theme-section">
                            <div className="theme-section-title">
                                <h4>主题模式</h4>
                            </div>
                            <div className="theme-mode-grid">
                                <button type="button" className={`theme-mode-card${themeMode === "light" ? " theme-mode-card--active" : ""}`} onClick={() => setThemeMode("light")}>
                                    <div className="theme-mode-preview theme-mode-preview--light"></div>
                                    <span>浅色模式</span>
                                </button>
                                <button type="button" className={`theme-mode-card${themeMode === "dark" ? " theme-mode-card--active" : ""}`} onClick={() => setThemeMode("dark")}>
                                    <div className="theme-mode-preview theme-mode-preview--dark"></div>
                                    <span>暗黑模式</span>
                                </button>
                                <button type="button" className={`theme-mode-card${themeMode === "custom" ? " theme-mode-card--active" : ""}`} onClick={() => setThemeMode("custom")}>
                                    <div className="theme-mode-preview theme-mode-preview--custom"></div>
                                    <span>自定义</span>
                                </button>
                            </div>
                        </div>

                        {/* Custom controls — shown only when mode is custom */}
                        {themeMode === "custom" && (
                            <>
                                <div className="theme-section">
                                    <div className="theme-section-title">
                                        <h4>字体 & 颜色</h4>
                                        <p>拖动滑块或选择颜色即可实时预览效果</p>
                                    </div>
                                    <div className="theme-control-list">
                                        <label className="theme-slider-item">
                                            <div className="theme-label-row">
                                                <span className="theme-label-text">导航字体</span>
                                                <span className="theme-value-badge">{customTheme.navFontSize}px</span>
                                            </div>
                                            <input type="range" min="12" max="20" step="1" value={customTheme.navFontSize} onChange={(e) => setCustomTheme((c) => ({ ...c, navFontSize: Number(e.target.value) }))} />
                                        </label>
                                        <label className="theme-slider-item">
                                            <div className="theme-label-row">
                                                <span className="theme-label-text">结果字体</span>
                                                <span className="theme-value-badge">{customTheme.resultFontSize}px</span>
                                            </div>
                                            <input type="range" min="12" max="20" step="1" value={customTheme.resultFontSize} onChange={(e) => setCustomTheme((c) => ({ ...c, resultFontSize: Number(e.target.value) }))} />
                                        </label>
                                        <div className="theme-color-pair">
                                            <label className="theme-color-item">
                                                <span className="theme-label-text">字体颜色</span>
                                                <div className="color-swatch-row">
                                                    <input type="color" value={customTheme.fontColor} onChange={(e) => setCustomTheme((c) => ({ ...c, fontColor: e.target.value }))} className="color-swatch-input" />
                                                    <code className="color-hex-code">{customTheme.fontColor}</code>
                                                </div>
                                            </label>
                                            <label className="theme-color-item">
                                                <span className="theme-label-text">强调色</span>
                                                <div className="color-swatch-row">
                                                    <input type="color" value={customTheme.accentColor} onChange={(e) => setCustomTheme((c) => ({ ...c, accentColor: e.target.value }))} className="color-swatch-input" />
                                                    <code className="color-hex-code">{customTheme.accentColor}</code>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="theme-section">
                                    <div className="theme-section-title">
                                        <h4>背景颜色</h4>
                                        <p>选择预设或自定义背景色</p>
                                    </div>
                                    <div className="bg-color-presets">
                                        {backgroundPresets.map((preset) => (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                className={`bg-color-preset${customTheme.backgroundColor === preset.value ? " bg-color-preset--active" : ""}`}
                                                style={{ backgroundColor: preset.value }}
                                                onClick={() => setCustomTheme((c) => ({ ...c, backgroundColor: preset.value }))}
                                                title={preset.name}
                                            >
                                                <span className="bg-color-preset__name">{preset.name}</span>
                                            </button>
                                        ))}
                                        <div className="bg-color-custom">
                                            <input
                                                type="color"
                                                value={customTheme.backgroundColor}
                                                onChange={(e) => setCustomTheme((c) => ({ ...c, backgroundColor: e.target.value }))}
                                                className="bg-color-input"
                                                title="自定义背景色"
                                            />
                                            <code className="bg-color-hex">{customTheme.backgroundColor}</code>
                                        </div>
                                    </div>
                                </div>

                                <div className="theme-section">
                                    <div className="theme-section-title">
                                        <h4>背景图片</h4>
                                    </div>
                                    <div className="background-upload-compact">
                                        {customTheme.backgroundImage ? (
                                            <div className="bg-thumb-wrap">
                                                <img src={customTheme.backgroundImage} alt="BG" className="bg-thumb-img" />
                                                <button type="button" className="text-button text-button--danger text-button--sm" onClick={handleClearBackground}>移除</button>
                                            </div>
                                        ) : (
                                            <label className="bg-upload-btn">
                                                <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                                                上传背景图
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                    </div>

                    {/* ===== Right column: Live Preview ===== */}
                    <div className="theme-preview-panel" style={livePreviewStyle}>
                        <div className="theme-preview-inner">
                            <div className="preview-mock-sidebar">
                                <div className="preview-brand">
                                    <strong style={{ fontSize: `${Math.max(12, customTheme.navFontSize - 2)}px` }}>SQLCompass</strong>
                                    <span style={{ fontSize: `${Math.max(10, customTheme.navFontSize - 4)}px`, opacity: 0.6 }}>数据库客户端</span>
                                </div>
                                {["连接管理", "SQL 查询", "历史记录", "表设计", "AI 设置"].map((item) => (
                                    <div key={item} className="preview-nav-item" style={{
                                        backgroundColor: item === "连接管理"
                                            ? `color-mix(in srgb, ${customTheme.accentColor} 10%)`
                                            : "transparent",
                                        borderLeftColor: item === "连接管理" ? customTheme.accentColor : "transparent",
                                        color: item === "连接管理" ? customTheme.accentColor : undefined,
                                        fontSize: `${customTheme.navFontSize - 1}px`,
                                    }}>
                                        {item}
                                    </div>
                                ))}
                            </div>
                            <div className="preview-mock-content">
                                <div className="preview-mock-header">
                                    <strong style={{ fontSize: `${customTheme.resultFontSize + 2}px` }}>连接列表</strong>
                                </div>
                                <div className="preview-mock-cards">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="preview-mock-card" style={{ borderColor: `color-mix(in srgb, ${customTheme.fontColor} 15%)`, borderRadius: 14, padding: "16px 18px" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <strong style={{ fontSize: `${customTheme.resultFontSize}px`, color: customTheme.fontColor }}>MySQL-Docker-{i}</strong>
                                                <span className="preview-badge" style={{ backgroundColor: `color-mix(in srgb, ${customTheme.accentColor} 12%)`, color: customTheme.accentColor, fontSize: `${Math.max(11, customTheme.resultFontSize - 3)}px` }}>运行中</span>
                                            </div>
                                            <div style={{ marginTop: 6, fontSize: `${Math.max(11, customTheme.resultFontSize - 2)}px`, opacity: 0.55 }}>127.0.0.1:3306 / docker_db_{i}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="preview-mock-editor" style={{ borderColor: `color-mix(in srgb, ${customTheme.fontColor} 12%)` }}>
                                    <div style={{ fontFamily: "monospace", fontSize: `${Math.max(11, customTheme.resultFontSize - 2)}px`, lineHeight: 1.7 }}>
                                        <span style={{ color: `color-mix(in srgb, ${customTheme.accentColor} 70%)` }}>SELECT</span>{" "}
                                        <span>{customTheme.fontColor !== "#ffffff" ? "*" : "id, name, email"}</span>{" "}
                                        <span style={{ color: `color-mix(in srgb, ${customTheme.accentColor} 70%)` }}>FROM</span>{" "}
                                        <span>users</span>{" "}
                                        <span style={{ color: `color-mix(in srgb, ${customTheme.accentColor} 70%)` }}>WHERE</span>{" "}
                                        <span>status</span> = <span style={{ color: "#059669" }}>'active'</span>{" "}
                                        <span style={{ color: `color-mix(in srgb, ${customTheme.accentColor} 70%)` }}>LIMIT</span>{" "}
                                        <span>50</span>;
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div></section>
        );
    }

    function renderSettingsPage() {
        const handleSetStoragePath = async () => {
            if (browserPreview) return;
            const result = (await SetStoragePath(newStoragePath)) as SetStoragePathResult;
            if (result.success) {
                pushToast("success", "路径已更新", result.message);
                const info = (await GetStorageInfo()) as StorageInfoView;
                setStorageInfo(info);
                await refreshWorkspaceState();
            } else {
                pushToast("error", "更新失败", result.message);
            }
        };

        const handleGrantPermission = async () => {
            if (browserPreview) return;
            const result = (await GrantStoragePermission()) as SetStoragePathResult;
            if (result.success) {
                pushToast("success", "权限已授予", result.message);
                const info = (await GetStorageInfo()) as StorageInfoView;
                setStorageInfo(info);
            } else {
                pushToast("error", "权限设置失败", result.message);
            }
            setShowPermissionModal(false);
        };

        const handleClearData = async (category: string) => {
            if (browserPreview) return;
            const result = (await ClearStorageData(category)) as SetStoragePathResult;
            if (result.success) {
                pushToast("success", "清理完成", result.message);
                const info = (await GetStorageInfo()) as StorageInfoView;
                setStorageInfo(info);
            } else {
                pushToast("error", "清理失败", result.message);
            }
            setShowClearModal(null);
        };

        const handleSelectDirectory = async () => {
            if (browserPreview) return;
            const dir = await SelectStorageDirectory();
            if (dir) {
                setNewStoragePath(dir);
            }
        };

        return (
            <section className="page-panel">
                <div className="page-headline">
                    <div>
                        <h2>系统设置</h2>
                        <p>管理应用存储路径、查看存储占用与清理数据</p>
                    </div>
                </div>

                {/* Storage Path */}
                <div className="settings-section panel-card" style={{ marginBottom: 20 }}>
                    <div className="section-title">
                        <div>
                            <h3>存储路径</h3>
                            <p>自定义应用数据的存储位置，修改后已有数据将自动迁移</p>
                        </div>
                    </div>
                    <div className="settings-path-row">
                        <input
                            type="text"
                            className="settings-path-input"
                            value={newStoragePath}
                            onChange={(e) => setNewStoragePath(e.target.value)}
                            placeholder="输入新的存储路径..."
                        />
                        <button type="button" className="ghost-button" onClick={handleSelectDirectory} disabled={browserPreview} title="选择文件夹">
                            选择路径
                        </button>
                        <button type="button" className="primary-button" onClick={handleSetStoragePath} disabled={browserPreview || newStoragePath === (storageInfo?.dataDir ?? "")}>
                            应用配置
                        </button>
                    </div>
                    {storageInfo && (
                        <div className="settings-path-hint">
                            当前路径：<code>{storageInfo.dataDir}</code>
                        </div>
                    )}
                </div>

                {/* Storage Overview */}
                {storageInfo && (
                    <div className="settings-section panel-card" style={{ marginBottom: 20 }}>
                        <div className="section-title">
                            <div>
                                <h3>存储概况</h3>
                                <p>应用数据文件占用情况</p>
                            </div>
                            <div className="settings-total-badge">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                </svg>
                                <span>{storageInfo.totalHR}</span>
                            </div>
                        </div>

                        {!storageInfo.writable && (
                            <div className="notice-banner notice-banner--error" style={{ marginBottom: 14 }}>
                                <span className="notice-banner__icon">!</span>
                                <span className="notice-banner__text">
                                    当前存储目录没有写入权限，部分功能可能无法正常使用。
                                    <button type="button" className="text-button" onClick={() => setShowPermissionModal(true)} style={{ marginLeft: 8 }}>
                                        授权写入
                                    </button>
                                </span>
                            </div>
                        )}

                        {storageInfo.writable && (
                            <div className="notice-banner notice-banner--success" style={{ marginBottom: 14 }}>
                                <span className="notice-banner__icon">✓</span>
                                <span className="notice-banner__text">存储目录读写权限正常</span>
                            </div>
                        )}

                        <div className="settings-file-list">
                            {storageInfo.files.length === 0 ? (
                                <div className="settings-file-empty">暂无存储文件</div>
                            ) : (
                                storageInfo.files.map((file, idx) => (
                                    <div key={idx} className="settings-file-item">
                                        <div className="settings-file-icon">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                {file.name.endsWith("/") ? (
                                                    <>
                                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                                    </>
                                                ) : (
                                                    <>
                                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                        <polyline points="14 2 14 8 20 8"></polyline>
                                                    </>
                                                )}
                                            </svg>
                                        </div>
                                        <div className="settings-file-info">
                                            <span className="settings-file-name">{file.name}</span>
                                            <span className="settings-file-path">{file.path}</span>
                                        </div>
                                        <div className="settings-file-size">{file.sizeHR}</div>
                                        {file.name === "app-state.json" && (
                                            <button
                                                type="button"
                                                className="mini-ghost-button ghost-button--danger"
                                                onClick={() => setShowClearModal("history")}
                                                title="清除历史查询记录以减小文件大小"
                                            >
                                                清理
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Permission Modal */}
                {showPermissionModal && (
                    <div className="modal-backdrop" onClick={() => setShowPermissionModal(false)}>
                        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                            <div className="section-title">
                                <div>
                                    <h3>写入权限请求</h3>
                                    <p>应用需要写入配置文件以保存您的设置</p>
                                </div>
                            </div>
                            <div className="notice-banner notice-banner--info">
                                <span className="notice-banner__icon">i</span>
                                <span className="notice-banner__text">
                                    当前存储目录 <code>{storageInfo?.dataDir}</code> 没有写入权限。是否授权该目录读写权限？
                                </span>
                            </div>
                            <div className="toolbar-actions toolbar-actions--end">
                                <button type="button" className="ghost-button" onClick={() => setShowPermissionModal(false)}>
                                    拒绝
                                </button>
                                <button type="button" className="primary-button" onClick={handleGrantPermission}>
                                    授权写入
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Clear Confirm Modal */}
                {showClearModal && (
                    <div className="modal-backdrop" onClick={() => setShowClearModal(null)}>
                        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                            <div className="section-title">
                                <div>
                                    <h3>确认清理</h3>
                                    <p>此操作不可撤销，请确认</p>
                                </div>
                            </div>
                            <div className="notice-banner notice-banner--error">
                                <span className="notice-banner__icon">!</span>
                                <span className="notice-banner__text">
                                    确定要清除{showClearModal === "history" ? "所有历史查询记录" : "所选数据"}吗？此操作不可撤销。
                                </span>
                            </div>
                            <div className="toolbar-actions toolbar-actions--end">
                                <button type="button" className="ghost-button" onClick={() => setShowClearModal(null)}>
                                    取消
                                </button>
                                <button type="button" className="primary-button" style={{ background: "rgba(239, 68, 68, 0.9)", borderColor: "rgba(239, 68, 68, 0.6)" }} onClick={() => handleClearData(showClearModal)}>
                                    确认清理
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        );
    }

    function renderCurrentPage() {
        if (workMode === "chat") {
            return renderChatPage();
        }

        switch (activePage) {
            case "connections":
                return renderConnectionsPage();
            case "query":
                return renderQueryPage();
            case "history":
                return renderHistoryPage();
            case "schema":
                return renderSchemaPage();
            case "ai":
                return renderAIPage();
            case "theme":
                return renderThemePage();
            case "settings":
                return renderSettingsPage();
            default:
                return null;
        }
    }

    return (
        <div className={`studio-shell${sidebarCollapsed ? " studio-shell--collapsed" : ""}`}>
            <FloatingToast toast={toast} />
            <input ref={sqlFileInputRef} type="file" accept=".sql,.txt" hidden onChange={handleImportSQLFile} />

            <aside className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
                <div className="sidebar-brand">
                    {!sidebarCollapsed ? (
                        <div className="sidebar-brand__title">
                            <div>
                                <strong>SQLCompass</strong>
                                <span>更懂开发的数据库客户端</span>
                            </div>
                            <button type="button" className="sidebar-collapse" onClick={() => setSidebarCollapsed((current) => !current)} title="收起侧边栏">
                                ‹
                            </button>
                        </div>
                    ) : (
                        <button type="button" className="sidebar-collapse sidebar-collapse--collapsed" onClick={() => setSidebarCollapsed((current) => !current)} title="展开侧边栏">
                            ›
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
                                <div className="navigator-shell">{renderSidebarTree()}</div>
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

            {optimizeReview ? (
                <div className="modal-backdrop" onClick={() => setOptimizeReview(null)}>
                    <div className="modal-card modal-card--wide" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>AI 优化建议</h3>
                                <p>AI 会先解释为什么这么优化，你确认后才会回填到编辑器。</p>
                            </div>
                        </div>
                        <div className="form-grid">
                            <label className="field field--full">
                                <span>优化提示词</span>
                                <textarea
                                    value={optimizeReview.prompt}
                                    onChange={(event) => setOptimizeReview((current) => (current ? { ...current, prompt: event.target.value } : current))}
                                    rows={3}
                                    placeholder="可补充约束，例如：尽量减少子查询、保持索引友好、不要改动 where 条件"
                                />
                            </label>
                        </div>
                        <div className="notice notice--info">{optimizeReview.reasoning}</div>
                        <div className="code-block code-block--light">
                            <pre>{optimizeReview.sql}</pre>
                        </div>
                        <div className="toolbar-actions toolbar-actions--end">
                            <button type="button" className="ghost-button" onClick={() => setOptimizeReview(null)}>
                                取消
                            </button>
                            <button type="button" className="ghost-button" onClick={() => handleRetryOptimizeReview()} disabled={isOptimizingSQL}>
                                {isOptimizingSQL ? "优化中..." : "再次优化"}
                            </button>
                            <button type="button" className="primary-button" onClick={handleApplyOptimizeReview}>
                                确认回填
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {cellEditor ? (
                <div className="modal-backdrop" onClick={() => setCellEditor(null)}>
                    <div className="modal-card modal-card--wide" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>编辑字段</h3>
                                <p>{cellEditor.column} · {cellEditor.fieldType}</p>
                            </div>
                        </div>
                        <label className="field field--full">
                            <span>字段值</span>
                            {isTextLikeType(cellEditor.fieldType) ? (
                                <textarea
                                    value={cellEditor.nextValue}
                                    onChange={(event) => setCellEditor((current) => (current ? { ...current, nextValue: event.target.value } : current))}
                                    rows={8}
                                />
                            ) : (
                                <input
                                    type={editorInputType(cellEditor.fieldType)}
                                    value={cellEditor.nextValue}
                                    onChange={(event) => setCellEditor((current) => (current ? { ...current, nextValue: event.target.value } : current))}
                                />
                            )}
                        </label>
                        <div className="cell-editor-toolbar">
                            <button type="button" className="ghost-button" onClick={() => {
                                copyText(fromEditorValue(cellEditor.nextValue, cellEditor.fieldType));
                                pushToast("success", "复制成功", "字段值已复制到剪贴板");
                            }}>
                                复制
                            </button>
                            <button type="button" className="ghost-button" onClick={() => setCellEditor(null)}>
                                取消
                            </button>
                            <button type="button" className="primary-button" onClick={() => handleConfirmCellEdit()} disabled={isSavingCell}>
                                {isSavingCell ? "保存中..." : "确认"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {deleteDialog ? (
                <div className="modal-backdrop" onClick={() => setDeleteDialog(null)}>
                    <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>确认删除选中项</h3>
                                <p>将从当前表中删除 {deleteDialog.count} 条已勾选数据，这个操作不可撤销。</p>
                            </div>
                        </div>
                        <div className="code-block code-block--light">
                            <pre>{deleteDialog.statement}</pre>
                        </div>
                        <div className="toolbar-actions toolbar-actions--end">
                            <button type="button" className="ghost-button" onClick={() => setDeleteDialog(null)}>
                                取消
                            </button>
                            <button type="button" className="primary-button" onClick={() => handleConfirmDeleteSelectedRows()} disabled={isExecutingQuery}>
                                {isExecutingQuery ? "删除中..." : "确认删除"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {tableContextMenu ? (
                <div
                    className="context-menu"
                    style={{
                        top: tableContextMenu.y,
                        left: tableContextMenu.x,
                    }}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <button
                        type="button"
                        className="context-menu__item"
                        onClick={() => openTableDesigner(tableContextMenu.database, tableContextMenu.table)}
                    >
                        设计
                    </button>
                </div>
            ) : null}
        </div>
    );
}

export default App;
