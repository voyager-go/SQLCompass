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
}

const tablePageSize = 12;

function renderTableItem(
    databaseName: string,
    table: TableNode,
    selectedTable: string,
    workMode: "normal" | "chat",
    handlePreviewTable: (db: string, table: string, page?: number) => Promise<void>,
    setTableContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; database: string; table: string } | null>>,
    pushToast: (tone: "success" | "error" | "info", title: string, message: string) => void,
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

    const filteredDatabases = databaseFilter.length > 0
        ? explorerTree.databases.filter((db) => databaseFilter.includes(db.name))
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
                if (tableFilter.length > 0 && database.name === selectedDatabase) {
                    filteredTables = filteredTables.filter((table) => tableFilter.includes(table.name));
                }
                const page = tablePageByDatabase[database.name] ?? 1;
                const pageCount = Math.max(1, Math.ceil(filteredTables.length / tablePageSize));
                const normalizedPage = Math.min(page, pageCount);
                const start = (normalizedPage - 1) * tablePageSize;
                const visibleTables: TableNode[] = filteredTables.slice(start, start + tablePageSize);
                const hasSchemas = Boolean(database.schemas && database.schemas.length > 0);
                const isRedisDatabase = explorerTree.engine === "redis";
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
                                                  const filterMatched = tableFilter.length === 0 || tableFilter.includes(table.name);
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
                                                          renderTableItem(database.name, table, selectedTable, workMode, handlePreviewTable, setTableContextMenu, pushToast)
                                                      )}
                                                  </div>
                                              </div>
                                          ))
                                    : visibleTables.map((table) =>
                                          renderTableItem(database.name, table, selectedTable, workMode, handlePreviewTable, setTableContextMenu, pushToast)
                                      )}

                                {(hasSchemas ? filteredTables.length === 0 : visibleTables.length === 0) ? <div className="navigator-empty">没有匹配的表</div> : null}

                                {!hasSchemas && isRedisDatabase ? (
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

            {tableContextMenu && explorerTree?.canDesignTables ? (
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

            {dbContextMenu && explorerTree?.canDesignTables ? (
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
                        onClick={() => openCreateTablePage(dbContextMenu.database)}
                    >
                        新建表
                    </button>
                </div>
            ) : null}
        </>
    );
}
