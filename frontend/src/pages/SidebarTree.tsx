import { CopyableText } from "../components/CopyableText";
import { escapeHTML } from "../lib/utils";
import type { ExplorerTree, TableNode } from "../types/runtime";

function redisTypeLabel(type?: string) {
    switch ((type || "").toLowerCase()) {
        case "string": return "redis-key-tag redis-key-tag--string";
        case "hash": return "redis-key-tag redis-key-tag--hash";
        case "list": return "redis-key-tag redis-key-tag--list";
        case "set": return "redis-key-tag redis-key-tag--set";
        case "zset": return "redis-key-tag redis-key-tag--zset";
        case "stream": return "redis-key-tag redis-key-tag--stream";
        default: return "redis-key-tag";
    }
}

interface SidebarTreeProps {
    explorerTree: ExplorerTree | null;
    databaseFilter: string[];
    selectedDatabase: string;
    expandedDatabases: Record<string, boolean>;
    setExpandedDatabases: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    tableSearch: string;
    tableFilter: string[];
    tablePageByDatabase: Record<string, number>;
    setTablePageByDatabase: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    workMode: "normal" | "chat";
    selectedTable: string;
    handleSelectDatabase: (db: string) => void;
    handlePreviewTable: (db: string, table: string, page?: number) => Promise<void>;
    tableContextMenu: { x: number; y: number; database: string; table: string } | null;
    setTableContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; database: string; table: string } | null>>;
    openTableDesigner: (db: string, table: string) => void;
    pushToast: (tone: "success" | "error" | "info", title: string, message: string) => void;
    dbContextMenu: { x: number; y: number; database: string } | null;
    setDbContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; database: string } | null>>;
    openCreateTablePage: (database: string) => void;
    redisCursorHistoryByDatabase: Record<string, number[]>;
    handleBrowseRedisKeys: (database: string, direction: "next" | "prev") => Promise<void>;
    onExportDatabaseStructure: (database: string) => void;
    onExportDatabaseStructureAndData: (database: string) => void;
    onImportSQLToDatabase: (database: string) => void;
    onImportCSVToDatabase: (database: string) => void;
    onTruncateTable: (database: string, table: string) => void;
    onDropTable: (database: string, table: string) => void;
}

const tablePageSize = 12;

function renderTableItem(
    databaseName: string,
    table: TableNode,
    selectedTable: string,
    workMode: "normal" | "chat",
    handlePreviewTable: (db: string, table: string, page?: number) => Promise<void>,
    setTableContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; database: string; table: string } | null>>,
    setDbContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; database: string } | null>>,
    pushToast: (tone: "success" | "error" | "info", title: string, message: string) => void,
    onTruncateTable: (database: string, table: string) => void,
    onDropTable: (database: string, table: string) => void,
) {
    const isRedisKey = table.engine === "redis";
    return (
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
                event.dataTransfer.setData(
                    "application/x-sql-compass-chat-item",
                    JSON.stringify({ kind: "table", database: databaseName, table: table.name })
                );
                setDragPreview(event, table.name, "数据表");
            }}
            onClick={() => handlePreviewTable(databaseName, table.name)}
            onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDbContextMenu(null);
                setTableContextMenu({
                    x: Math.min(event.clientX, window.innerWidth - 148),
                    y: Math.min(event.clientY, window.innerHeight - 72),
                    database: databaseName,
                    table: table.name,
                });
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handlePreviewTable(databaseName, table.name).catch(() => undefined);
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
            {isRedisKey ? <span className={redisTypeLabel((table as TableNode & { keyType?: string }).keyType)}>{(table as TableNode & { keyType?: string }).keyType || "key"}</span> : null}
            <span className="navigator-meta">
                {isRedisKey ? (table.comment || "Key") : table.rows === -1 ? "加载中..." : table.rows >= 0 ? table.rows.toLocaleString() : "-"}
            </span>
        </div>
    );
}

function setDragPreview(event: React.DragEvent<HTMLElement>, title: string, typeLabel: string) {
    const preview = document.createElement("div");
    preview.className = "drag-preview";
    preview.textContent = `${typeLabel} · ${title}`;
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 0, 0);
    setTimeout(() => document.body.removeChild(preview), 0);
}

export function SidebarTree({
    explorerTree,
    databaseFilter,
    selectedDatabase,
    expandedDatabases,
    setExpandedDatabases,
    tableSearch,
    tableFilter,
    tablePageByDatabase,
    setTablePageByDatabase,
    workMode,
    selectedTable,
    handleSelectDatabase,
    handlePreviewTable,
    tableContextMenu,
    setTableContextMenu,
    openTableDesigner,
    pushToast,
    dbContextMenu,
    setDbContextMenu,
    openCreateTablePage,
    redisCursorHistoryByDatabase,
    handleBrowseRedisKeys,
    onExportDatabaseStructure,
    onExportDatabaseStructureAndData,
    onImportSQLToDatabase,
    onImportCSVToDatabase,
    onTruncateTable,
    onDropTable,
}: SidebarTreeProps) {
    function toggleDatabaseExpanded(databaseName: string) {
        setExpandedDatabases((current) => ({
            ...current,
            [databaseName]: !current[databaseName],
        }));
    }

    if (!explorerTree || explorerTree.databases.length === 0) {
        return <div className="sidebar-empty">先选择一个连接，或者先在连接管理里新建连接。</div>;
    }

    const isRedisExplorer = explorerTree.engine === "redis";

    // 只保留实际存在于当前 explorerTree 中的数据库筛选值，避免旧连接残留导致空白
    const validDatabaseFilter = databaseFilter.filter((name) =>
        explorerTree.databases.some((db) => db.name === name)
    );
    const filteredDatabases = validDatabaseFilter.length > 0
        ? explorerTree.databases.filter((db) => validDatabaseFilter.includes(db.name))
        : explorerTree.databases;

    return (
        <>
            {filteredDatabases.map((database) => {
                const isActive = database.name === selectedDatabase;
                const isExpanded = expandedDatabases[database.name] ?? isActive;
                const shouldFilterTables = Boolean(tableSearch.trim()) && database.name === selectedDatabase;
                let filteredTables = shouldFilterTables
                    ? database.tables.filter((table) => table.name.toLowerCase().includes(tableSearch.trim().toLowerCase()))
                    : database.tables;

                // 只保留实际存在于当前 database 中的有效筛选值，避免旧连接/旧库残留导致空白
                const validTableFilter = isRedisExplorer
                    ? tableFilter.filter((type) =>
                          database.tables.some((t) => (t as TableNode & { keyType?: string }).keyType === type)
                      )
                    : tableFilter.filter((name) => database.tables.some((t) => t.name === name));

                if (validTableFilter.length > 0 && database.name === selectedDatabase) {
                    filteredTables = filteredTables.filter((table) =>
                        isRedisExplorer
                            ? validTableFilter.includes((table as TableNode & { keyType?: string }).keyType || "")
                            : validTableFilter.includes(table.name)
                    );
                }
                const page = tablePageByDatabase[database.name] ?? 1;
                const pageCount = Math.max(1, Math.ceil(filteredTables.length / tablePageSize));
                const normalizedPage = Math.min(page, pageCount);
                const start = (normalizedPage - 1) * tablePageSize;
                const visibleTables: TableNode[] = filteredTables.slice(start, start + tablePageSize);
                const hasSchemas = Boolean(database.schemas && database.schemas.length > 0);
                const redisHistory = redisCursorHistoryByDatabase[database.name] ?? [0];

                return (
                    <div key={database.name} className={`navigator-db${isActive ? " navigator-db--active" : ""}`}>
                        <div className="navigator-db__row">
                            <div
                                className="navigator-db__button"
                                role="button"
                                tabIndex={0}
                                draggable={workMode === "chat"}
                                onDragStart={(event) => {
                                    if (workMode !== "chat") {
                                        event.preventDefault();
                                        return;
                                    }
                                    event.dataTransfer.effectAllowed = "copy";
                                    event.dataTransfer.setData("application/x-sql-compass-chat-item", JSON.stringify({ kind: "database", database: database.name }));
                                    setDragPreview(event, database.name, "数据库");
                                }}
                                onClick={() => handleSelectDatabase(database.name)}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setTableContextMenu(null);
                                    setDbContextMenu({
                                        x: Math.min(event.clientX, window.innerWidth - 148),
                                        y: Math.min(event.clientY, window.innerHeight - 72),
                                        database: database.name,
                                    });
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        handleSelectDatabase(database.name);
                                    }
                                }}
                            >
                                <button
                                    type="button"
                                    className="navigator-toggle"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        toggleDatabaseExpanded(database.name);
                                    }}
                                >
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
                                {hasSchemas
                                    ? database.schemas!
                                          .map((schema) => ({
                                              ...schema,
                                              tables: schema.tables.filter((table) => {
                                                  const searchMatched = !tableSearch.trim() || table.name.toLowerCase().includes(tableSearch.trim().toLowerCase());
                                                  const filterMatched = validTableFilter.length === 0 || validTableFilter.includes(table.name);
                                                  return searchMatched && filterMatched;
                                              }),
                                          }))
                                          .filter((schema) => schema.tables.length > 0)
                                          .map((schema) => (
                                              <div key={`${database.name}-${schema.name}`} className="navigator-schema-group">
                                                  <div className="navigator-schema-label">
                                                      <span>{schema.name}</span>
                                                      <span>{schema.tableCount}</span>
                                                  </div>
                                                  <div className="navigator-schema-tables">
                                                      {schema.tables.map((table) =>
                                                          renderTableItem(database.name, table, selectedTable, workMode, handlePreviewTable, setTableContextMenu, setDbContextMenu, pushToast, onTruncateTable, onDropTable)
                                                      )}
                                                  </div>
                                              </div>
                                          ))
                                    : visibleTables.map((table) =>
                                          renderTableItem(database.name, table, selectedTable, workMode, handlePreviewTable, setTableContextMenu, setDbContextMenu, pushToast, onTruncateTable, onDropTable)
                                      )}

                                {(hasSchemas ? filteredTables.length === 0 : visibleTables.length === 0) ? <div className="navigator-empty">没有匹配的表</div> : null}

                                {!hasSchemas && isRedisExplorer ? (
                                    <div className="navigator-pager">
                                        <button
                                            type="button"
                                            className="mini-ghost-button"
                                            onClick={() => handleBrowseRedisKeys(database.name, "prev")}
                                            disabled={redisHistory.length <= 1}
                                        >
                                            上一批
                                        </button>
                                        <span>{redisHistory.length}</span>
                                        <button
                                            type="button"
                                            className="mini-ghost-button"
                                            onClick={() => handleBrowseRedisKeys(database.name, "next")}
                                            disabled={!database.hasMore}
                                        >
                                            下一批
                                        </button>
                                    </div>
                                ) : !hasSchemas && pageCount > 1 && visibleTables.length > 0 ? (
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
            })}

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
                        onClick={() => {
                            navigator.clipboard.writeText(tableContextMenu.table).catch(() => undefined);
                            pushToast("success", "已复制", `表名 ${tableContextMenu.table} 已复制到剪贴板`);
                            setTableContextMenu(null);
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        复制表名
                    </button>
                    {explorerTree?.canDesignTables ? (
                        <button
                            type="button"
                            className="context-menu__item"
                            onClick={() => {
                                setTableContextMenu(null);
                                openTableDesigner(tableContextMenu.database, tableContextMenu.table);
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                            设计
                        </button>
                    ) : null}
                    <div className="context-menu__divider" />
                    <button
                        type="button"
                        className="context-menu__item context-menu__item--danger"
                        onClick={() => {
                            setTableContextMenu(null);
                            onTruncateTable(tableContextMenu.database, tableContextMenu.table);
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        截断表
                    </button>
                    <button
                        type="button"
                        className="context-menu__item context-menu__item--danger"
                        onClick={() => {
                            setTableContextMenu(null);
                            onDropTable(tableContextMenu.database, tableContextMenu.table);
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        删除表
                    </button>
                </div>
            ) : null}

            {dbContextMenu ? (
                <div
                    className="context-menu"
                    style={{
                        top: dbContextMenu.y,
                        left: dbContextMenu.x,
                    }}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <button
                        type="button"
                        className="context-menu__item"
                        onClick={() => {
                            navigator.clipboard.writeText(dbContextMenu.database).catch(() => undefined);
                            pushToast("success", "已复制", `数据库名 ${dbContextMenu.database} 已复制到剪贴板`);
                            setDbContextMenu(null);
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        复制名称
                    </button>
                    {explorerTree?.canDesignTables ? (
                        <button
                            type="button"
                            className="context-menu__item"
                            onClick={() => {
                                setDbContextMenu(null);
                                openCreateTablePage(dbContextMenu.database);
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            新建表
                        </button>
                    ) : null}
                    <div className="context-menu__divider" />
                    <button
                        type="button"
                        className="context-menu__item"
                        onClick={() => {
                            setDbContextMenu(null);
                            onExportDatabaseStructure(dbContextMenu.database);
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        导出结构
                    </button>
                    <button
                        type="button"
                        className="context-menu__item"
                        onClick={() => {
                            setDbContextMenu(null);
                            onExportDatabaseStructureAndData(dbContextMenu.database);
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        导出结构及数据
                    </button>
                    <button
                        type="button"
                        className="context-menu__item"
                        onClick={() => {
                            setDbContextMenu(null);
                            onImportSQLToDatabase(dbContextMenu.database);
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        导入 SQL
                    </button>
                    <button
                        type="button"
                        className="context-menu__item"
                        onClick={() => {
                            setDbContextMenu(null);
                            onImportCSVToDatabase(dbContextMenu.database);
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        导入 CSV
                    </button>
                </div>
            ) : null}
        </>
    );
}
