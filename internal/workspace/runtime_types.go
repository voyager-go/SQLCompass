package workspace

type ExplorerRequest struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
}

type ExplorerTree struct {
	ConnectionID    string         `json:"connectionId"`
	ConnectionName  string         `json:"connectionName"`
	Engine          string         `json:"engine"`
	Databases       []DatabaseNode `json:"databases"`
	ActiveDatabase  string         `json:"activeDatabase"`
	ActiveTable     string         `json:"activeTable"`
	CanDesignTables bool           `json:"canDesignTables"`
}

type DatabaseNode struct {
	Name       string      `json:"name"`
	IsSystem   bool        `json:"isSystem"`
	TableCount int         `json:"tableCount"`
	Schemas    []SchemaNode `json:"schemas,omitempty"`
	Tables     []TableNode `json:"tables"`
	NextCursor uint64      `json:"nextCursor,omitempty"`
	HasMore    bool        `json:"hasMore,omitempty"`
}

type SchemaNode struct {
	Name       string      `json:"name"`
	TableCount int         `json:"tableCount"`
	Tables     []TableNode `json:"tables"`
}

type TableNode struct {
	Name     string `json:"name"`
	Rows     int64  `json:"rows"`
	Engine   string `json:"engine"`
	Comment  string `json:"comment"`
	KeyType  string `json:"keyType,omitempty"`
	Loading  bool   `json:"loading"` // 行数是否正在加载中
}

type TableRowCountRequest struct {
	ConnectionID string   `json:"connectionId"`
	Database     string   `json:"database"`
	Tables       []string `json:"tables"`
}

type TableRowCountResult struct {
	ConnectionID string            `json:"connectionId"`
	Database     string            `json:"database"`
	Counts       map[string]int64  `json:"counts"` // table_name -> row_count
}

type RedisKeyBrowseRequest struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	Cursor       uint64 `json:"cursor"`
	Count        int    `json:"count"`
}

type RedisKeyBrowseResult struct {
	ConnectionID string      `json:"connectionId"`
	Database     string      `json:"database"`
	Cursor       uint64      `json:"cursor"`
	NextCursor   uint64      `json:"nextCursor"`
	HasMore      bool        `json:"hasMore"`
	Keys         []TableNode `json:"keys"`
}

type TableDetailRequest struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	Table        string `json:"table"`
}

type TableDetail struct {
	ConnectionID     string            `json:"connectionId"`
	Database         string            `json:"database"`
	Table            string            `json:"table"`
	DDL              string            `json:"ddl"`
	Fields           []TableField      `json:"fields"`
	Indexes          []TableIndex      `json:"indexes"`
	IndexDiagnostics []IndexDiagnostic `json:"indexDiagnostics"`
}

type TablePreviewRequest struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	Table        string `json:"table"`
	Page         int    `json:"page"`
	PageSize     int    `json:"pageSize"`
}

type TableField struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	Nullable      bool   `json:"nullable"`
	DefaultValue  string `json:"defaultValue"`
	Comment       string `json:"comment"`
	Primary       bool   `json:"primary"`
	AutoIncrement bool   `json:"autoIncrement"`
}

type TableIndex struct {
	Name        string   `json:"name"`
	Columns     []string `json:"columns"`
	Unique      bool     `json:"unique"`
	IndexType   string   `json:"indexType"`
	Cardinality int64    `json:"cardinality"`
}

type IndexDiagnostic struct {
	Level  string `json:"level"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
}

type QueryRequest struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	SQL          string `json:"sql"`
	Page         int    `json:"page"`
	PageSize     int    `json:"pageSize"`
}

type SQLAnalysis struct {
	StatementType   string   `json:"statementType"`
	RiskLevel       string   `json:"riskLevel"`
	Summary         []string `json:"summary"`
	Warnings        []string `json:"warnings"`
	RequiresConfirm bool     `json:"requiresConfirm"`
}

type QueryResult struct {
	Columns       []string            `json:"columns"`
	Rows          []map[string]string `json:"rows"`
	Meta          map[string]string   `json:"meta,omitempty"`
	AffectedRows  int64               `json:"affectedRows"`
	DurationMS    int64               `json:"durationMs"`
	EffectiveSQL  string              `json:"effectiveSql"`
	StatementType string              `json:"statementType"`
	Message       string              `json:"message"`
	Page          int                 `json:"page"`
	PageSize      int                 `json:"pageSize"`
	AutoLimited   bool                `json:"autoLimited"`
	HasNextPage   bool                `json:"hasNextPage"`
	Analysis      SQLAnalysis         `json:"analysis"`
}

type HistoryItem struct {
	ID            string `json:"id"`
	ConnectionID  string `json:"connectionId"`
	Engine        string `json:"engine"`
	Database      string `json:"database"`
	Statement     string `json:"statement"`
	StatementType string `json:"statementType"`
	RiskLevel     string `json:"riskLevel"`
	Success       bool   `json:"success"`
	DurationMS    int64  `json:"durationMs"`
	RowCount      int64  `json:"rowCount"`
	CreatedAt     string `json:"createdAt"`
}

type RenameTableInput struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	OldName      string `json:"oldName"`
	NewName      string `json:"newName"`
}

type RenameTableResult struct {
	Database string `json:"database"`
	OldName  string `json:"oldName"`
	NewName  string `json:"newName"`
	Message  string `json:"message"`
}

type FieldDictionaryRequest struct {
	Engine    string `json:"engine"`
	FieldName string `json:"fieldName"`
}

type FieldDictionarySuggestion struct {
	FieldName      string `json:"fieldName"`
	Matched        bool   `json:"matched"`
	Type           string `json:"type"`
	Comment        string `json:"comment"`
	NeedsAIComment bool   `json:"needsAiComment"`
}

type AIFieldCommentRequest struct {
	FieldName string `json:"fieldName"`
}

type AIFieldCommentResult struct {
	FieldName string `json:"fieldName"`
	Comment   string `json:"comment"`
}

type SQLOptimizeRequest struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	SQL          string `json:"sql"`
	Prompt       string `json:"prompt"`
	Table        string `json:"table"`
}

type SQLOptimizeResult struct {
	SQL        string      `json:"sql"`
	Analysis   SQLAnalysis `json:"analysis"`
	Source     string      `json:"source"`
	Reasoning  string      `json:"reasoning"`
	PromptUsed string      `json:"promptUsed"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatDatabaseRequest struct {
	ConnectionID  string        `json:"connectionId"`
	Database      string        `json:"database"`
	SelectedTable string        `json:"selectedTable"`
	Message       string        `json:"message"`
	History       []ChatMessage `json:"history"`
	DisplayMode   string        `json:"displayMode"`
}

type ChatRepairRequest struct {
	ConnectionID   string        `json:"connectionId"`
	Database       string        `json:"database"`
	SelectedTable  string        `json:"selectedTable"`
	Message        string        `json:"message"`
	AttemptedSQL   string        `json:"attemptedSql"`
	ErrorMessage   string        `json:"errorMessage"`
	PreviousReason string        `json:"previousReason"`
	History        []ChatMessage `json:"history"`
	DisplayMode    string        `json:"displayMode"`
}

type ChatDatabaseResponse struct {
	Mode            string      `json:"mode"`
	Reply           string      `json:"reply"`
	SQL             string      `json:"sql"`
	Analysis        SQLAnalysis `json:"analysis"`
	DisplayMode     string      `json:"displayMode"`
	RequiresConfirm bool        `json:"requiresConfirm"`
	Reasoning       string      `json:"reasoning"`
}

type ChatResultSummaryRequest struct {
	ConnectionID  string              `json:"connectionId"`
	Database      string              `json:"database"`
	UserMessage   string              `json:"userMessage"`
	SQL           string              `json:"sql"`
	Reasoning     string              `json:"reasoning"`
	Result        QueryResult         `json:"result"`
	History       []ChatMessage       `json:"history"`
}

type ChatResultSummary struct {
	Summary string `json:"summary"`
}

type ExportFileRequest struct {
	SuggestedName string `json:"suggestedName"`
	Content       string `json:"content"`
	Kind          string `json:"kind"`
	Title         string `json:"title"`
}

type ExportFileResult struct {
	Path  string `json:"path"`
	Saved bool   `json:"saved"`
}

type CreateDatabaseRequest struct {
	ConnectionID string `json:"connectionId"`
	DatabaseName string `json:"databaseName"`
	Charset      string `json:"charset"`
	Collation    string `json:"collation"`
}

type CreateDatabaseResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type FillTableRequest struct {
	ConnectionID  string            `json:"connectionId"`
	Database      string            `json:"database"`
	Table         string            `json:"table"`
	Count         int               `json:"count"`
	FieldMappings map[string]string `json:"fieldMappings"` // fieldName -> fakeType
}

type FillTableResult struct {
	Success      bool   `json:"success"`
	Message      string `json:"message"`
	InsertedRows int    `json:"insertedRows"`
}

type SmartFillTableRequest struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	Table        string `json:"table"`
	Count        int    `json:"count"`
}

type SmartFillTableResult struct {
	Success      bool   `json:"success"`
	Message      string `json:"message"`
	InsertedRows int    `json:"insertedRows"`
	SQLs         []string `json:"sqls"`
}

type PreviewSmartFillSQLRequest struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	Table        string `json:"table"`
	Count        int    `json:"count"`
}

type PreviewSmartFillSQLResult struct {
	Success   bool     `json:"success"`
	Message   string   `json:"message"`
	Reasoning string   `json:"reasoning"`
	SQLs      []string `json:"sqls"`
}

type CreateTableRequest struct {
	ConnectionID string            `json:"connectionId"`
	Database     string            `json:"database"`
	Schema       string            `json:"schema"`
	TableName    string            `json:"tableName"`
	PartitionBy  string            `json:"partitionBy"`
	PrimaryKey   string            `json:"primaryKey"`
	OrderBy      string            `json:"orderBy"`
	SampleBy     string            `json:"sampleBy"`
	Fields       []SchemaFieldInput `json:"fields"`
	Indexes      []SchemaIndexInput `json:"indexes"`
}

type SchemaFieldInput struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	Nullable      bool   `json:"nullable"`
	DefaultValue  string `json:"defaultValue"`
	Comment       string `json:"comment"`
	Primary       bool   `json:"primary"`
	AutoIncrement bool   `json:"autoIncrement"`
}

type SchemaIndexInput struct {
	Name      string   `json:"name"`
	Columns   []string `json:"columns"`
	Unique    bool     `json:"unique"`
	IndexType string   `json:"indexType"`
}

type CreateTableResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type GenerateIndexNameRequest struct {
	TableName string   `json:"tableName"`
	Columns   []string `json:"columns"`
	Unique    bool     `json:"unique"`
}

type GenerateIndexNameResult struct {
	Name string `json:"name"`
}

type PartitionInfo struct {
	Name        string `json:"name"`
	Method      string `json:"method"`
	Expression  string `json:"expression"`
	Description string `json:"description"`
	RowCount    int64  `json:"rowCount"`
	DataSize    int64  `json:"dataSize"`
	IndexSize   int64  `json:"indexSize"`
}

type TablePartitionRequest struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	Table        string `json:"table"`
}

type TablePartitionResult struct {
	ConnectionID string          `json:"connectionId"`
	Database     string          `json:"database"`
	Table        string          `json:"table"`
	PartitionKey string          `json:"partitionKey"`
	Partitions   []PartitionInfo `json:"partitions"`
	Supported    bool            `json:"supported"`
	Message      string          `json:"message"`
}
