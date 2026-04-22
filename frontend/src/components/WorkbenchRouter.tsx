import { ChatPage } from "../pages/ChatPage";
import { ConnectionsPage } from "../pages/ConnectionsPage";
import { QueryPage } from "../pages/QueryPage";
import { HistoryPage } from "../pages/HistoryPage";
import { SchemaPage } from "../pages/SchemaPage";
import { CreateTablePage } from "../pages/CreateTablePage";
import { AIPage } from "../pages/AIPage";
import { ThemePage } from "../pages/ThemePage";
import { SettingsPage } from "../pages/SettingsPage";
import type { WorkbenchPage, WorkMode } from "../lib/constants";
import type {
    ChatDisplayMode,
    ChatEntry,
    ChatPendingAction,
    ChatDropPayload,
    QueryResult,
    SQLAnalysis,
    ExplorerTree,
    HistoryItem,
    TableDetail,
    FieldDictionarySuggestion,
    AIFieldCommentResult,
    StorageInfoView,
    SchemaDraftField,
} from "../types/runtime";
import type {
    ConnectionProfile,
    ConnectionInput,
    ConnectionTestResult,
    WorkspaceState,
    AISettingsInput,
} from "../types/workspace";
import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";

type NoticeTone = "success" | "error" | "info";
type Notice = { tone: NoticeTone; message: string };
type SelectedSnippet = { text: string; start: number; end: number; anchorTop: number; anchorLeft: number };

type SlashMenuItem = { key: string; label: string; desc: string; tone: "command" | "database" | "table" };

type UpdateConnectionField = <K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) => void;

export interface WorkbenchRouterProps {
    workMode: WorkMode;
    activePage: WorkbenchPage;

    // Chat
    selectedConnection: ConnectionProfile | null;
    chatDisplayMode: ChatDisplayMode;
    setChatDisplayMode: (v: ChatDisplayMode) => void;
    chatStreamRef: React.RefObject<HTMLDivElement | null>;
    chatMessages: ChatEntry[];
    isRunningChat: boolean;
    handleCopyUserMessage: (item: ChatEntry) => void;
    handleEditUserMessage: (item: ChatEntry) => void;
    handleCopyText: (text: string, label?: string) => void;
    handleCopyChatResult: (item: ChatEntry) => Promise<void>;
    handleCopyChatMessage: (item: ChatEntry) => Promise<void>;
    chatPendingAction: ChatPendingAction | null;
    setChatPendingAction: (v: ChatPendingAction | null) => void;
    executeChatSQL: (
        statement: string,
        displayMode: ChatDisplayMode,
        replyPrefix?: string,
        userMessage?: string,
        previousReason?: string,
        repairAttempt?: number,
    ) => Promise<void>;
    isExecutingQuery: boolean;
    chatDropActive: boolean;
    setChatDropActive: (v: boolean) => void;
    chatContextDatabase: string;
    setChatContextDatabase: (v: string) => void;
    chatContextTables: string[];
    setChatContextTables: (v: string[] | ((prev: string[]) => string[])) => void;
    chatInput: string;
    setChatInput: (v: string | ((prev: string) => string)) => void;
    handleSendChatMessage: (rawMessage?: string) => Promise<void>;
    handleChatInputChange: (value: string, cursorPos?: number) => void;
    handleSlashSelect: (item: string) => void;
    handleChatDrop: (payload: ChatDropPayload) => void;
    slashMenuOpen: boolean;
    slashMenuItems: SlashMenuItem[];
    slashMenuTotalPages: number;
    slashMenuPageSafe: number;
    pagedSlashMenuItems: SlashMenuItem[];
    slashMenuActiveIndex: number;
    setSlashMenuPage: (v: number | ((prev: number) => number)) => void;
    setSlashMenuActiveIndex: (v: number | ((prev: number) => number)) => void;
    setSlashMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
    slashMenuType: "command" | "database" | "table";

    // Connections
    connectionNotice: Notice | null;
    workspaceState: WorkspaceState;
    selectedConnectionId: string;
    connectionDraft: ConnectionInput;
    setConnectionDraft: React.Dispatch<React.SetStateAction<ConnectionInput>>;
    showPassword: boolean;
    setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
    connectionTest: ConnectionTestResult | null;
    isTestingConnection: boolean;
    isSavingConnection: boolean;
    handleSelectConnection: (profile: ConnectionProfile) => void;
    fillConnectionDraft: (profile: ConnectionProfile) => void;
    handleDeleteConnection: (profile: ConnectionProfile) => Promise<void>;
    handleTestConnection: () => Promise<void>;
    handleSaveConnection: () => Promise<void>;
    resetConnectionForm: (engine?: string) => void;
    updateConnectionField: UpdateConnectionField;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;

    // Query
    isOptimizingSQL: boolean;
    sqlText: string;
    queryNotice: Notice | null;
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
    handleExecuteQuery: (page: number) => void;
    selectedDatabase: string;
    handleFillTableData: () => Promise<void>;
    isFillingTable: boolean;
    handleSmartFillTableData: () => Promise<void>;
    isSmartFillingTable: boolean;

    // History
    historyItems: HistoryItem[];
    setHistoryItems: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
    historyPage: number;
    setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
    setPreviewContext: (v: { connectionId: string; database: string; table: string } | null) => void;
    setExpandedDatabases: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    setSelectedTable: (v: string) => void;
    setActivePage: (v: WorkbenchPage) => void;
    setSidebarView: (v: "database" | "workbench") => void;
    setQueryNotice: (v: Notice | null) => void;

    // Schema
    selectedTable: string;
    schemaNotice: Notice | null;
    schemaDraftFields: SchemaDraftField[];
    mysqlTypeOptions: string[];
    updateDraftField: <K extends keyof SchemaDraftField>(index: number, key: K, value: SchemaDraftField[K]) => void;
    applyFieldSuggestion: (index: number, fieldName: string) => Promise<void>;
    handleGenerateFieldComment: (index: number) => Promise<void>;
    handleDeleteDraftField: (index: number) => void;
    handleAddField: () => void;
    setRenameModalOpen: (v: boolean) => void;
    handleExportDDL: () => Promise<void>;
    handleCopyDDL: () => void;
    currentAlterSQL: string;
    renameModalOpen: boolean;
    renameTableName: string;
    setRenameTableName: (v: string) => void;
    handleRenameTable: () => Promise<void>;
    isRenamingTable: boolean;
    schemaDraftIndexes: { id: string; originName: string; name: string; columns: string[]; unique: boolean; indexType: string }[];
    handleAddIndex: () => void;
    handleDeleteDraftIndex: (index: number) => void;
    updateDraftIndex: <K extends keyof { id: string; originName: string; name: string; columns: string[]; unique: boolean; indexType: string }>(index: number, key: K, value: { id: string; originName: string; name: string; columns: string[]; unique: boolean; indexType: string }[K]) => void;
    handleGenerateIndexName: (index: number, tableName: string) => Promise<void>;
    aiConfigured: boolean;
    handleSaveFields: () => Promise<void>;
    isSavingFields: boolean;
    handleSaveIndexes: () => Promise<void>;
    isSavingIndexes: boolean;

    // AI
    aiNotice: Notice | null;
    aiForm: AISettingsInput;
    setAIForm: (updater: (current: AISettingsInput) => AISettingsInput) => void;
    isSavingAI: boolean;
    handleSaveAISettings: () => Promise<void>;
    handleClearAPIKey: () => Promise<void>;
    workspaceStateAI: WorkspaceState["ai"];
    selectedConnectionName: string;

    // Theme
    themeMode: "light" | "dark" | "custom";
    setThemeMode: (mode: "light" | "dark" | "custom") => void;
    customTheme: {
        navFontSize: number;
        resultFontSize: number;
        fontColor: string;
        accentColor: string;
        backgroundColor: string;
        backgroundImage: string | null;
    };
    setCustomTheme: (updater: (current: {
        navFontSize: number;
        resultFontSize: number;
        fontColor: string;
        accentColor: string;
        backgroundColor: string;
        backgroundImage: string | null;
    }) => {
        navFontSize: number;
        resultFontSize: number;
        fontColor: string;
        accentColor: string;
        backgroundColor: string;
        backgroundImage: string | null;
    }) => void;

    // Settings
    browserPreview: boolean;
    newStoragePath: string;
    setNewStoragePath: (v: string) => void;
    storageInfo: StorageInfoView | null;
    setStorageInfo: (v: StorageInfoView | null) => void;
    showPermissionModal: boolean;
    setShowPermissionModal: (v: boolean) => void;
    showClearModal: string | null;
    setShowClearModal: (v: string | null) => void;
    refreshWorkspaceState: () => Promise<void>;
    handleSelectDatabase: (databaseName: string) => void;
    loadExplorer: (connectionId: string, preferredDatabase?: string) => Promise<void>;
}

export function WorkbenchRouter(props: WorkbenchRouterProps) {
    const {
        workMode,
        activePage,
        // Chat
        selectedConnection,
        chatDisplayMode,
        setChatDisplayMode,
        chatStreamRef,
        chatMessages,
        isRunningChat,
        handleCopyUserMessage,
        handleEditUserMessage,
        handleCopyText,
        handleCopyChatResult,
        handleCopyChatMessage,
        chatPendingAction,
        setChatPendingAction,
        executeChatSQL,
        isExecutingQuery,
        chatDropActive,
        setChatDropActive,
        chatContextDatabase,
        setChatContextDatabase,
        chatContextTables,
        setChatContextTables,
        chatInput,
        setChatInput,
        handleSendChatMessage,
        handleChatInputChange,
        handleSlashSelect,
        handleChatDrop,
        slashMenuOpen,
        slashMenuItems,
        slashMenuTotalPages,
        slashMenuPageSafe,
        pagedSlashMenuItems,
        slashMenuActiveIndex,
        setSlashMenuPage,
        setSlashMenuActiveIndex,
        setSlashMenuOpen,
        slashMenuType,
        // Connections
        connectionNotice,
        workspaceState,
        selectedConnectionId,
        connectionDraft,
        setConnectionDraft,
        showPassword,
        setShowPassword,
        connectionTest,
        isTestingConnection,
        isSavingConnection,
        handleSelectConnection,
        fillConnectionDraft,
        handleDeleteConnection,
        handleTestConnection,
        handleSaveConnection,
        resetConnectionForm,
        updateConnectionField,
        pushToast,
        // Query
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
        handleExecuteQuery,
        selectedDatabase,
        handleFillTableData,
        isFillingTable,
        handleSmartFillTableData,
        isSmartFillingTable,
        // History
        historyItems,
        setHistoryItems,
        historyPage,
        setHistoryPage,
        setPreviewContext,
        setExpandedDatabases,
        setSelectedTable,
        setActivePage,
        setSidebarView,
        setQueryNotice,
        // Schema
        selectedTable,
        schemaNotice,
        schemaDraftFields,
        mysqlTypeOptions,
        updateDraftField,
        applyFieldSuggestion,
        handleGenerateFieldComment,
        handleDeleteDraftField,
        handleAddField,
        setRenameModalOpen,
        handleExportDDL,
        handleCopyDDL,
        currentAlterSQL,
        renameModalOpen,
        renameTableName,
        setRenameTableName,
        handleRenameTable,
        isRenamingTable,
        schemaDraftIndexes,
        handleAddIndex,
        handleDeleteDraftIndex,
        updateDraftIndex,
        handleGenerateIndexName,
        aiConfigured,
        handleSaveFields,
        isSavingFields,
        handleSaveIndexes,
        isSavingIndexes,
        // AI
        aiNotice,
        aiForm,
        setAIForm,
        isSavingAI,
        handleSaveAISettings,
        handleClearAPIKey,
        workspaceStateAI,
        selectedConnectionName,
        // Theme
        themeMode,
        setThemeMode,
        customTheme,
        setCustomTheme,
        // Settings
        browserPreview,
        newStoragePath,
        setNewStoragePath,
        storageInfo,
        setStorageInfo,
        showPermissionModal,
        setShowPermissionModal,
        showClearModal,
        setShowClearModal,
        refreshWorkspaceState,
        loadExplorer,
    } = props;

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
                    resetConnectionForm={resetConnectionForm}
                    updateConnectionField={updateConnectionField}
                    pushToast={pushToast}
                />
            );
        case "query":
            return (
                <QueryPage
                    isExecutingQuery={isExecutingQuery}
                    handleExecuteQuery={handleExecuteQuery}
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
                    openCellEditor={openCellEditor}
                    handleCopySQL={handleCopySQL}
                    handleExportQuerySQL={handleExportQuerySQL}
                    handleExportQueryCSV={handleExportQueryCSV}
                    handleExportQueryExcel={handleExportQueryExcel}
                    handleExportSelectedRows={handleExportSelectedRows}
                    isExporting={isExporting}
                    canDeleteSelectedRows={canDeleteSelectedRows}
                    handleRequestDeleteSelectedRows={handleRequestDeleteSelectedRows}
                    queryPageSizeOptions={queryPageSizeOptions}
                    selectedConnection={selectedConnection}
                    selectedDatabase={selectedDatabase}
                    selectedTable={selectedTable}
                    handleFillTableData={handleFillTableData}
                    isFillingTable={isFillingTable}
                    handleSmartFillTableData={handleSmartFillTableData}
                    isSmartFillingTable={isSmartFillingTable}
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
                    handleSelectDatabase={props.handleSelectDatabase}
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
                    activeEngine={selectedConnection?.engine ?? "mysql"}
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
                    schemaDraftIndexes={schemaDraftIndexes}
                    handleAddIndex={handleAddIndex}
                    handleDeleteDraftIndex={handleDeleteDraftIndex}
                    updateDraftIndex={updateDraftIndex}
                    handleGenerateIndexName={handleGenerateIndexName}
                    aiConfigured={aiConfigured}
                    handleSaveFields={handleSaveFields}
                    isSavingFields={isSavingFields}
                    handleSaveIndexes={handleSaveIndexes}
                    isSavingIndexes={isSavingIndexes}
                />
            );
        case "ai":
            return (
                <AIPage
                    aiNotice={aiNotice}
                    aiForm={aiForm}
                    setAIForm={setAIForm}
                    isSavingAI={isSavingAI}
                    onSave={handleSaveAISettings}
                    onClear={handleClearAPIKey}
                    aiState={workspaceStateAI}
                    selectedConnectionName={selectedConnectionName}
                />
            );
        case "theme":
            return (
                <ThemePage
                    themeMode={themeMode}
                    setThemeMode={setThemeMode}
                    customTheme={customTheme}
                    setCustomTheme={setCustomTheme}
                    pushToast={pushToast}
                />
            );
        case "create-table":
            return (
                <CreateTablePage
                    selectedConnection={selectedConnection}
                    selectedDatabase={selectedDatabase}
                    pushToast={pushToast}
                    loadExplorer={loadExplorer}
                    setActivePage={setActivePage}
                />
            );
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
