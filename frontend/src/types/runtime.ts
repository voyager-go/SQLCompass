export type ExplorerRequest = {
    connectionId: string;
    database: string;
};

export type TableNode = {
    name: string;
    rows: number;
    engine: string;
    comment: string;
    loading?: boolean;
};

export type TableRowCountRequest = {
    connectionId: string;
    database: string;
    tables: string[];
};

export type TableRowCountResult = {
    connectionId: string;
    database: string;
    counts: Record<string, number>;
};

export type DatabaseNode = {
    name: string;
    isSystem: boolean;
    tableCount: number;
    tables: TableNode[];
};

export type ExplorerTree = {
    connectionId: string;
    connectionName: string;
    engine: string;
    databases: DatabaseNode[];
    activeDatabase: string;
    activeTable: string;
    canDesignTables: boolean;
};

export type TableDetailRequest = {
    connectionId: string;
    database: string;
    table: string;
};

export type TableField = {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string;
    comment: string;
    primary: boolean;
    autoIncrement: boolean;
};

export type TableIndex = {
    name: string;
    columns: string[];
    unique: boolean;
    indexType: string;
    cardinality: number;
};

export type IndexDiagnostic = {
    level: string;
    title: string;
    detail: string;
};

export type TableDetail = {
    connectionId: string;
    database: string;
    table: string;
    ddl: string;
    fields: TableField[];
    indexes: TableIndex[];
    indexDiagnostics: IndexDiagnostic[];
};

export type TablePreviewRequest = {
    connectionId: string;
    database: string;
    table: string;
    page: number;
    pageSize: number;
};

export type QueryRequest = {
    connectionId: string;
    database: string;
    sql: string;
    page: number;
    pageSize: number;
};

export type SQLAnalysis = {
    statementType: string;
    riskLevel: string;
    summary: string[];
    warnings: string[];
    requiresConfirm: boolean;
};

export type QueryResult = {
    columns: string[];
    rows: Record<string, string>[];
    affectedRows: number;
    durationMs: number;
    effectiveSql: string;
    statementType: string;
    message: string;
    page: number;
    pageSize: number;
    autoLimited: boolean;
    hasNextPage: boolean;
    analysis: SQLAnalysis;
};

export type HistoryItem = {
    id: string;
    connectionId: string;
    engine: string;
    database: string;
    statement: string;
    statementType: string;
    riskLevel: string;
    success: boolean;
    durationMs: number;
    rowCount: number;
    createdAt: string;
};

export type RenameTableInput = {
    connectionId: string;
    database: string;
    oldName: string;
    newName: string;
};

export type RenameTableResult = {
    database: string;
    oldName: string;
    newName: string;
    message: string;
};

export type FieldDictionaryRequest = {
    engine: string;
    fieldName: string;
};

export type FieldDictionarySuggestion = {
    fieldName: string;
    matched: boolean;
    type: string;
    comment: string;
    needsAiComment: boolean;
};

export type AIFieldCommentRequest = {
    fieldName: string;
};

export type AIFieldCommentResult = {
    fieldName: string;
    comment: string;
};

export type SQLOptimizeRequest = {
    connectionId: string;
    database: string;
    sql: string;
    prompt: string;
};

export type SQLOptimizeResult = {
    sql: string;
    analysis: SQLAnalysis;
    source: string;
    reasoning: string;
    promptUsed: string;
};

export type ChatMessage = {
    role: string;
    content: string;
};

export type ChatDatabaseRequest = {
    connectionId: string;
    database: string;
    selectedTable: string;
    message: string;
    history: ChatMessage[];
    displayMode: string;
};

export type ChatRepairRequest = {
    connectionId: string;
    database: string;
    selectedTable: string;
    message: string;
    attemptedSql: string;
    errorMessage: string;
    previousReason: string;
    history: ChatMessage[];
    displayMode: string;
};

export type ChatDatabaseResponse = {
    mode: string;
    reply: string;
    sql: string;
    analysis: SQLAnalysis;
    displayMode: string;
    requiresConfirm: boolean;
    reasoning: string;
};

export type ExportFileRequest = {
    suggestedName: string;
    content: string;
    kind: string;
    title: string;
};

export type ExportFileResult = {
    path: string;
    saved: boolean;
};

export type StorageFileEntry = {
    name: string;
    path: string;
    size: number;
    sizeHR: string;
};

export type StorageInfoView = {
    dataDir: string;
    files: StorageFileEntry[];
    total: number;
    totalHR: string;
    writable: boolean;
};

export type SetStoragePathResult = {
    success: boolean;
    newPath: string;
    message: string;
};
