import type { WorkspaceState, ConnectionInput, ConnectionProfile, AISettingsInput } from "../types/workspace";
import type { QueryResult, TableDetail, TableField, SchemaDraftField } from "../types/runtime";
import { engineLabels, defaultPortForEngine } from "./engine";

export function formatDateTime(value: string): string {
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

export async function copyText(value: string): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
        document.execCommand("copy");
    } finally {
        document.body.removeChild(textarea);
    }
}

export function isTextLikeType(type: string): boolean {
    return /(text|blob|json|longtext|mediumtext|tinytext)/i.test(type);
}

export function formatCellPreview(value: string, type: string): string {
    if (!isTextLikeType(type)) {
        return value;
    }

    const normalized = (value || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= 48) {
        return normalized;
    }
    return `${normalized.slice(0, 48)}...`;
}

export function editorInputType(type: string): "text" | "date" | "time" | "datetime-local" {
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

export function toEditorValue(value: string, type: string): string {
    const normalized = value ?? "";
    if (editorInputType(type) === "datetime-local") {
        return normalized.replace(" ", "T").slice(0, 16);
    }
    return normalized;
}

export function fromEditorValue(value: string, type: string): string {
    if (editorInputType(type) === "datetime-local") {
        return value ? value.replace("T", " ") : "";
    }
    return value;
}

export function escapeHTML(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export const browserStorageKey = "sql-compass-browser-workspace";

export const emptyWorkspaceState: WorkspaceState = {
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

export function hasWailsBridge(): boolean {
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

export function loadBrowserWorkspaceState(): WorkspaceState {
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

export function saveBrowserWorkspaceState(state: WorkspaceState) {
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

export function browserGeneratedID(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }

    return `browser-${Date.now()}`;
}

export function createConnectionDraft(engine = "mysql"): ConnectionInput {
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

export function createAIForm(state: WorkspaceState): AISettingsInput {
    return {
        baseUrl: state.ai.baseUrl,
        modelName: state.ai.modelName,
        apiKey: "",
    };
}

export function upsertBrowserConnection(state: WorkspaceState, input: ConnectionInput): WorkspaceState {
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

export function removeBrowserConnection(state: WorkspaceState, id: string): WorkspaceState {
    return {
        ...state,
        connections: state.connections.filter((item) => item.id !== id),
    };
}

export function updateBrowserAIState(state: WorkspaceState, form: AISettingsInput): WorkspaceState {
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

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function stripSlashCommand(input: string, slashStart: number): string {
    return input.substring(0, slashStart).replace(/\s+$/, "");
}

export function summarizeChatResult(result: QueryResult): string {
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

export function appendUnique(items: string[], value: string): string[] {
    return items.includes(value) ? items : [...items, value];
}

const fieldTypeOptionsByEngine: Record<string, string[]> = {
    mysql: [
        "tinyint", "smallint", "mediumint", "int", "bigint",
        "float", "double", "decimal(10,2)",
        "date", "datetime", "timestamp", "time", "year",
        "char(32)", "varchar(64)", "varchar(128)", "varchar(255)",
        "tinytext", "text", "mediumtext", "longtext",
        "binary(16)", "varbinary(255)", "tinyblob", "blob", "mediumblob", "longblob",
        "enum('Y','N')", "set('A','B')", "json",
    ],
    mariadb: [
        "tinyint", "smallint", "mediumint", "int", "bigint",
        "float", "double", "decimal(10,2)",
        "date", "datetime", "timestamp", "time", "year",
        "char(32)", "varchar(64)", "varchar(128)", "varchar(255)",
        "tinytext", "text", "mediumtext", "longtext",
        "binary(16)", "varbinary(255)", "tinyblob", "blob", "mediumblob", "longblob",
        "enum('Y','N')", "set('A','B')", "json",
    ],
    postgresql: [
        "smallint", "integer", "bigint", "numeric(10,2)", "real", "double precision",
        "serial", "bigserial", "boolean",
        "date", "time", "timestamp", "timestamptz",
        "char(32)", "varchar(64)", "varchar(255)", "text",
        "bytea", "json", "jsonb", "uuid",
    ],
    sqlite: [
        "INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC",
        "INTEGER PRIMARY KEY", "VARCHAR(255)", "DATETIME", "DATE", "BOOLEAN", "JSON",
    ],
    clickhouse: [
        "Int8", "Int16", "Int32", "Int64",
        "UInt8", "UInt16", "UInt32", "UInt64",
        "Float32", "Float64", "Decimal(10,2)",
        "String", "FixedString(16)",
        "Date", "Date32", "DateTime", "DateTime64(3)",
        "UUID", "Bool", "JSON", "Nullable(String)",
    ],
    redis: ["string", "hash", "list", "set", "zset", "stream"],
};

export function getFieldTypeOptions(engine: string, dynamicTypes: string[] = []): string[] {
    const normalizedEngine = engine.toLowerCase();
    const baseOptions = fieldTypeOptionsByEngine[normalizedEngine] ?? fieldTypeOptionsByEngine.mysql;
    return [...new Set([...baseOptions, ...dynamicTypes.filter(Boolean)])];
}

const indexTypeOptionsByEngine: Record<string, string[]> = {
    mysql: ["BTREE", "HASH", "FULLTEXT", "SPATIAL"],
    mariadb: ["BTREE", "HASH", "FULLTEXT", "SPATIAL"],
    postgresql: ["btree", "hash", "gist", "spgist", "gin", "brin"],
};

export function getIndexTypeOptions(engine: string): string[] {
    const normalizedEngine = engine.toLowerCase();
    return indexTypeOptionsByEngine[normalizedEngine] ?? [];
}

function getIndexTypeClause(engine: string, indexType: string): string {
    const normalizedEngine = engine.toLowerCase();
    const type = (indexType || "").trim();
    if (!type) return "";
    if (normalizedEngine === "postgresql") {
        return ` USING ${type}`;
    }
    if (normalizedEngine === "mysql" || normalizedEngine === "mariadb") {
        return ` USING ${type}`;
    }
    return "";
}

export function stringifySQLValue(value: string): string {
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

export function stringifyResultSQLValue(value: string): string {
    const normalized = value ?? "";
    if (/^-?\d+(\.\d+)?$/.test(normalized)) {
        return normalized;
    }

    return `'${normalized.replace(/'/g, "''")}'`;
}

export function buildInsertStatement(tableName: string, columns: string[], rows: Record<string, string>[]): string {
    const escapedColumns = columns.map((column) => `\`${column}\``).join(", ");
    const values = rows
        .map((row) => `(${columns.map((column) => stringifyResultSQLValue(row[column] ?? "")).join(", ")})`)
        .join(",\n");

    return `INSERT INTO \`${tableName}\` (${escapedColumns})\nVALUES\n${values};`;
}

export function buildRowSelectionKey(page: number, columns: string[], row: Record<string, string>, rowIndex: number): string {
    const signature = columns.map((column) => `${column}:${row[column] ?? ""}`).join("\u241f");
    return `${page}:${rowIndex}:${signature}`;
}

function quoteIdentifierByEngine(engine: string, value: string): string {
    const normalized = engine.toLowerCase();
    const trimmed = value.trim();
    if (normalized === "postgresql" || normalized === "sqlite") {
        return `"${trimmed.replace(/"/g, '""')}"`;
    }
    return `\`${trimmed.replace(/`/g, "``")}\``;
}

function buildFieldDefinition(engine: string, field: SchemaDraftField): string {
    const identifier = quoteIdentifierByEngine(engine, field.name || "new_column");
    const parts = [`\`${field.name || "new_column"}\``, field.type || "varchar(255)"];
    parts[0] = identifier;
    parts.push(field.nullable ? "NULL" : "NOT NULL");

    if (field.defaultValue.trim()) {
        parts.push(`DEFAULT ${stringifySQLValue(field.defaultValue.trim())}`);
    }

    if (field.autoIncrement) {
        if (engine === "postgresql") {
            // PostgreSQL usually uses serial/identity types instead of a suffix.
        } else if (engine !== "sqlite" && engine !== "clickhouse") {
            parts.push("AUTO_INCREMENT");
        }
    }

    if (field.comment.trim() && engine !== "postgresql" && engine !== "sqlite" && engine !== "clickhouse") {
        parts.push(`COMMENT '${field.comment.replace(/'/g, "''")}'`);
    }

    return parts.join(" ");
}

export function fieldSignature(field: SchemaDraftField | TableField): string {
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

export type SchemaDraftIndex = {
    id: string;
    originName: string;
    name: string;
    columns: string[];
    unique: boolean;
    indexType: string;
};

export function buildAlterSQL(
    engine: string,
    tableDetail: TableDetail | null,
    tableName: string,
    draftFields: SchemaDraftField[],
    draftIndexes?: SchemaDraftIndex[],
    scope?: "fields" | "indexes"
): string {
    if (!tableDetail) {
        return "-- 请选择一张真实表";
    }

    const normalizedEngine = engine.toLowerCase();
    const statements: string[] = [];
    const postStatements: string[] = [];
    const tableIdentifier = normalizedEngine === "postgresql"
        ? tableName.split(".").map((part) => quoteIdentifierByEngine(normalizedEngine, part)).join(".")
        : quoteIdentifierByEngine(normalizedEngine, tableName);

    if (!scope || scope === "fields") {
        const originals = new Map(tableDetail.fields.map((field) => [field.name, field]));
        const draftNames = new Set(draftFields.map((field) => field.originName || field.name));

        tableDetail.fields.forEach((field) => {
            if (!draftNames.has(field.name)) {
                if (normalizedEngine === "sqlite") {
                    statements.push(`-- SQLite 删除列通常需要重建整张表: ${field.name}`);
                } else {
                    statements.push(`DROP COLUMN ${quoteIdentifierByEngine(normalizedEngine, field.name)}`);
                }
            }
        });

        draftFields.forEach((field) => {
            if (!field.originName) {
                statements.push(`ADD COLUMN ${buildFieldDefinition(normalizedEngine, field)}`);
                if (normalizedEngine === "postgresql" && field.comment.trim()) {
                    postStatements.push(`COMMENT ON COLUMN ${tableIdentifier}.${quoteIdentifierByEngine(normalizedEngine, field.name)} IS '${field.comment.replace(/'/g, "''")}';`);
                }
                return;
            }

            const original = originals.get(field.originName);
            if (!original) {
                statements.push(`ADD COLUMN ${buildFieldDefinition(normalizedEngine, field)}`);
                return;
            }

            if (original.name !== field.name) {
                if (normalizedEngine === "mysql" || normalizedEngine === "mariadb") {
                    statements.push(`CHANGE COLUMN ${quoteIdentifierByEngine(normalizedEngine, original.name)} ${buildFieldDefinition(normalizedEngine, field)}`);
                } else {
                    statements.push(`RENAME COLUMN ${quoteIdentifierByEngine(normalizedEngine, original.name)} TO ${quoteIdentifierByEngine(normalizedEngine, field.name)}`);
                    if (fieldSignature(original) !== fieldSignature(field)) {
                        if (normalizedEngine === "postgresql") {
                            statements.push(`ALTER COLUMN ${quoteIdentifierByEngine(normalizedEngine, field.name)} TYPE ${field.type}`);
                        } else if (normalizedEngine === "clickhouse") {
                            statements.push(`MODIFY COLUMN ${buildFieldDefinition(normalizedEngine, field)}`);
                        } else if (normalizedEngine === "sqlite") {
                            statements.push(`-- SQLite 修改列定义通常需要重建整张表: ${field.name}`);
                        }
                    }
                }
                return;
            }

            if (fieldSignature(original) !== fieldSignature(field)) {
                if (normalizedEngine === "postgresql") {
                    if (original.type !== field.type) {
                        statements.push(`ALTER COLUMN ${quoteIdentifierByEngine(normalizedEngine, field.name)} TYPE ${field.type}`);
                    }
                    if (original.nullable !== field.nullable) {
                        statements.push(`ALTER COLUMN ${quoteIdentifierByEngine(normalizedEngine, field.name)} ${field.nullable ? "DROP NOT NULL" : "SET NOT NULL"}`);
                    }
                    if (original.defaultValue.trim() !== field.defaultValue.trim()) {
                        statements.push(`ALTER COLUMN ${quoteIdentifierByEngine(normalizedEngine, field.name)} ${field.defaultValue.trim() ? `SET DEFAULT ${stringifySQLValue(field.defaultValue.trim())}` : "DROP DEFAULT"}`);
                    }
                    if (original.comment.trim() !== field.comment.trim()) {
                        postStatements.push(`COMMENT ON COLUMN ${tableIdentifier}.${quoteIdentifierByEngine(normalizedEngine, field.name)} IS ${field.comment.trim() ? `'${field.comment.replace(/'/g, "''")}'` : "NULL"};`);
                    }
                } else if (normalizedEngine === "sqlite") {
                    statements.push(`-- SQLite 修改列定义通常需要重建整张表: ${field.name}`);
                } else {
                    statements.push(`MODIFY COLUMN ${buildFieldDefinition(normalizedEngine, field)}`);
                }
            }
        });
    }

    if ((!scope || scope === "indexes") && draftIndexes) {
        const originalIndexNames = new Set(tableDetail.indexes.map((idx) => idx.name));
        const draftIndexNames = new Set(draftIndexes.map((idx) => idx.originName || idx.name));

        tableDetail.indexes.forEach((idx) => {
            if (!draftIndexNames.has(idx.name)) {
                if (normalizedEngine === "sqlite") {
                    statements.push(`-- SQLite 删除索引/主键通常需要重建表或单独 DROP INDEX: ${idx.name}`);
                } else if (idx.name === "PRIMARY" || idx.name === "PRIMARY_KEY") {
                    statements.push(`DROP PRIMARY KEY`);
                } else {
                    statements.push(normalizedEngine === "postgresql"
                        ? `DROP INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)};`
                        : `DROP INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)}`);
                }
            }
        });

        draftIndexes.forEach((idx) => {
            const indexTypeClause = getIndexTypeClause(normalizedEngine, idx.indexType);
            if (!idx.originName) {
                const unique = idx.unique ? "UNIQUE " : "";
                if (normalizedEngine === "postgresql") {
                    postStatements.push(`CREATE ${unique}INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)} ON ${tableIdentifier}${indexTypeClause} (${idx.columns.map((c) => quoteIdentifierByEngine(normalizedEngine, c)).join(", ")});`);
                } else if (normalizedEngine === "sqlite") {
                    postStatements.push(`CREATE ${unique}INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)} ON ${tableIdentifier} (${idx.columns.map((c) => quoteIdentifierByEngine(normalizedEngine, c)).join(", ")});`);
                } else {
                    statements.push(`ADD ${unique}INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)}${indexTypeClause} (${idx.columns.map((c) => quoteIdentifierByEngine(normalizedEngine, c)).join(", ")})`);
                }
                return;
            }

            const original = tableDetail.indexes.find((i) => i.name === idx.originName);
            if (!original) {
                const unique = idx.unique ? "UNIQUE " : "";
                if (normalizedEngine === "postgresql") {
                    postStatements.push(`CREATE ${unique}INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)} ON ${tableIdentifier}${indexTypeClause} (${idx.columns.map((c) => quoteIdentifierByEngine(normalizedEngine, c)).join(", ")});`);
                } else if (normalizedEngine === "sqlite") {
                    postStatements.push(`CREATE ${unique}INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)} ON ${tableIdentifier} (${idx.columns.map((c) => quoteIdentifierByEngine(normalizedEngine, c)).join(", ")});`);
                } else {
                    statements.push(`ADD ${unique}INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)}${indexTypeClause} (${idx.columns.map((c) => quoteIdentifierByEngine(normalizedEngine, c)).join(", ")})`);
                }
                return;
            }

            const nameChanged = original.name !== idx.name;
            const colsChanged = original.columns.join(",") !== idx.columns.join(",");
            const uniqueChanged = original.unique !== idx.unique;
            const typeChanged = original.indexType !== idx.indexType;

            if (nameChanged || colsChanged || uniqueChanged || typeChanged) {
                if (normalizedEngine === "sqlite") {
                    statements.push(`-- SQLite 调整索引通常需要 DROP/CREATE 或重建表: ${idx.name}`);
                } else if (original.name === "PRIMARY" || original.name === "PRIMARY_KEY") {
                    statements.push(`DROP PRIMARY KEY`);
                    statements.push(`ADD PRIMARY KEY (${idx.columns.map((c) => quoteIdentifierByEngine(normalizedEngine, c)).join(", ")})`);
                } else {
                    statements.push(normalizedEngine === "postgresql"
                        ? `DROP INDEX ${quoteIdentifierByEngine(normalizedEngine, original.name)};`
                        : `DROP INDEX ${quoteIdentifierByEngine(normalizedEngine, original.name)}`);
                    const unique = idx.unique ? "UNIQUE " : "";
                    if (normalizedEngine === "postgresql") {
                        postStatements.push(`CREATE ${unique}INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)} ON ${tableIdentifier}${indexTypeClause} (${idx.columns.map((c) => quoteIdentifierByEngine(normalizedEngine, c)).join(", ")});`);
                    } else if (normalizedEngine === "sqlite") {
                        postStatements.push(`CREATE ${unique}INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)} ON ${tableIdentifier} (${idx.columns.map((c) => quoteIdentifierByEngine(normalizedEngine, c)).join(", ")});`);
                    } else {
                        statements.push(`ADD ${unique}INDEX ${quoteIdentifierByEngine(normalizedEngine, idx.name)}${indexTypeClause} (${idx.columns.map((c) => quoteIdentifierByEngine(normalizedEngine, c)).join(", ")})`);
                    }
                }
            }
        });
    }

    if (statements.length === 0 && postStatements.length === 0) {
        return "-- 当前没有结构变更";
    }

    if (normalizedEngine === "postgresql") {
        const alterStatements = statements.map((statement) => `ALTER TABLE ${tableIdentifier}\n  ${statement};`);
        return [...alterStatements, ...postStatements].join("\n\n");
    }

    if (normalizedEngine === "sqlite") {
        return [...statements, ...postStatements].join("\n");
    }

    return [`ALTER TABLE ${tableIdentifier}\n  ${statements.join(",\n  ")};`, ...postStatements].join("\n\n");
}

export function csvFromRows(columns: string[], rows: Record<string, string>[]): string {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [columns.map(escape).join(",")];
    rows.forEach((row) => {
        lines.push(columns.map((column) => escape(row[column] ?? "")).join(","));
    });
    return lines.join("\n");
}

export function downloadText(filename: string, content: string, mimeType: string) {
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

export function excelFromRows(sheetName: string, columns: string[], rows: Record<string, string>[]): string {
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

export function getErrorMessage(error: unknown): string {
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
        // ignore
    }

    return "未知错误";
}
