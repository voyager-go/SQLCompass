import splashLogo from "../assets/images/start.png";
import { SidebarTree } from "../pages/SidebarTree";
import type { ConnectionProfile } from "../types/workspace";
import type { ExplorerTree } from "../types/runtime";
import { WORKBENCH_PAGES, type WorkbenchPage, type WorkMode } from "../lib/constants";

interface SidebarProps {
    sidebarCollapsed: boolean;
    setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    sidebarView: "database" | "workbench";
    setSidebarView: (v: "database" | "workbench") => void;
    selectedConnection: ConnectionProfile | null;
    workMode: WorkMode;
    setWorkMode: (v: WorkMode) => void;
    showDatabaseFilter: boolean;
    setShowDatabaseFilter: React.Dispatch<React.SetStateAction<boolean>>;
    showTableFilter: boolean;
    setShowTableFilter: React.Dispatch<React.SetStateAction<boolean>>;
    selectedDatabase: string;
    explorerTree: ExplorerTree | null;
    databaseFilter: string[];
    setDatabaseFilter: React.Dispatch<React.SetStateAction<string[]>>;
    tableFilter: string[];
    setTableFilter: React.Dispatch<React.SetStateAction<string[]>>;
    tableSearch: string;
    setTableSearch: React.Dispatch<React.SetStateAction<string>>;
    tablePageByDatabase: Record<string, number>;
    setTablePageByDatabase: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    expandedDatabases: Record<string, boolean>;
    setExpandedDatabases: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    selectedTable: string;
    handleSelectDatabase: (db: string) => void;
    handlePreviewTable: (db: string, table: string, page?: number) => Promise<void>;
    tableContextMenu: { x: number; y: number; database: string; table: string } | null;
    setTableContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; database: string; table: string } | null>>;
    openTableDesigner: (db: string, table: string) => void;
    pushToast: (tone: "success" | "error" | "info", title: string, message: string) => void;
    activePage: WorkbenchPage;
    setActivePage: (v: WorkbenchPage) => void;
    saveFilterSettings: () => void;
    setShowCreateDBModal: React.Dispatch<React.SetStateAction<boolean>>;
    dbContextMenu: { x: number; y: number; database: string } | null;
    setDbContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; database: string } | null>>;
    openCreateTablePage: (database: string) => void;
    redisCursorHistoryByDatabase: Record<string, number[]>;
    handleBrowseRedisKeys: (database: string, direction: "next" | "prev") => Promise<void>;
}

export function Sidebar({
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarView,
    setSidebarView,
    selectedConnection,
    workMode,
    setWorkMode,
    showDatabaseFilter,
    setShowDatabaseFilter,
    showTableFilter,
    setShowTableFilter,
    selectedDatabase,
    explorerTree,
    databaseFilter,
    setDatabaseFilter,
    tableFilter,
    setTableFilter,
    tableSearch,
    setTableSearch,
    tablePageByDatabase,
    setTablePageByDatabase,
    expandedDatabases,
    setExpandedDatabases,
    selectedTable,
    handleSelectDatabase,
    handlePreviewTable,
    tableContextMenu,
    setTableContextMenu,
    openTableDesigner,
    pushToast,
    activePage,
    setActivePage,
    saveFilterSettings,
    setShowCreateDBModal,
    dbContextMenu,
    setDbContextMenu,
    openCreateTablePage,
    redisCursorHistoryByDatabase,
    handleBrowseRedisKeys,
}: SidebarProps) {
    return (
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
                                    {selectedConnection && (
                                        <button
                                            type="button"
                                            className="sidebar-icon-btn"
                                            onClick={() => setShowCreateDBModal(true)}
                                            title="新建数据库"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                            </svg>
                                        </button>
                                    )}
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
                                    dbContextMenu={dbContextMenu}
                                    setDbContextMenu={setDbContextMenu}
                                    openCreateTablePage={openCreateTablePage}
                                    redisCursorHistoryByDatabase={redisCursorHistoryByDatabase}
                                    handleBrowseRedisKeys={handleBrowseRedisKeys}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="sidebar-section sidebar-section--fill">
                            <div className="page-button-list page-button-list--scrollable page-button-list--workbench">
                                {WORKBENCH_PAGES.map((page) => (
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
    );
}
