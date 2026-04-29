export namespace ai {
	
	export class Workflow {
	    id: string;
	    title: string;
	    summary: string;
	    requiresPreview: boolean;
	    riskNotes: string[];
	
	    static createFrom(source: any = {}) {
	        return new Workflow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.summary = source["summary"];
	        this.requiresPreview = source["requiresPreview"];
	        this.riskNotes = source["riskNotes"];
	    }
	}
	export class Overview {
	    settings: config.AISettings;
	    features: Workflow[];
	    safeguards: string[];
	
	    static createFrom(source: any = {}) {
	        return new Overview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.settings = this.convertValues(source["settings"], config.AISettings);
	        this.features = this.convertValues(source["features"], Workflow);
	        this.safeguards = source["safeguards"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace appmeta {
	
	export class DeliveryPhase {
	    name: string;
	    outcome: string;
	    highlights: string[];
	
	    static createFrom(source: any = {}) {
	        return new DeliveryPhase(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.outcome = source["outcome"];
	        this.highlights = source["highlights"];
	    }
	}
	export class NavigationItem {
	    id: string;
	    title: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new NavigationItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.description = source["description"];
	    }
	}
	export class ProductOverview {
	    appName: string;
	    tagline: string;
	    summary: string;
	    desktopTarget: string;
	    navigation: NavigationItem[];
	    engines: database.EngineDescriptor[];
	    ai: ai.Overview;
	    history: history.Overview;
	    importExport: impexp.Overview;
	    safeguards: schema.RiskGuard[];
	    roadmap: DeliveryPhase[];
	    constraints: string[];
	
	    static createFrom(source: any = {}) {
	        return new ProductOverview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.appName = source["appName"];
	        this.tagline = source["tagline"];
	        this.summary = source["summary"];
	        this.desktopTarget = source["desktopTarget"];
	        this.navigation = this.convertValues(source["navigation"], NavigationItem);
	        this.engines = this.convertValues(source["engines"], database.EngineDescriptor);
	        this.ai = this.convertValues(source["ai"], ai.Overview);
	        this.history = this.convertValues(source["history"], history.Overview);
	        this.importExport = this.convertValues(source["importExport"], impexp.Overview);
	        this.safeguards = this.convertValues(source["safeguards"], schema.RiskGuard);
	        this.roadmap = this.convertValues(source["roadmap"], DeliveryPhase);
	        this.constraints = source["constraints"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace config {
	
	export class AISettings {
	    baseUrl: string;
	    modelName: string;
	    apiKeyConfigured: boolean;
	    apiKeySource: string;
	    storageMode: string;
	
	    static createFrom(source: any = {}) {
	        return new AISettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseUrl = source["baseUrl"];
	        this.modelName = source["modelName"];
	        this.apiKeyConfigured = source["apiKeyConfigured"];
	        this.apiKeySource = source["apiKeySource"];
	        this.storageMode = source["storageMode"];
	    }
	}

}

export namespace database {
	
	export class Capability {
	    queryEditor: boolean;
	    schemaBrowser: boolean;
	    tableDesigner: boolean;
	    ddlPreview: boolean;
	    aiAssist: boolean;
	    intentPreview: boolean;
	    csvImport: boolean;
	    excelImport: boolean;
	    dataExport: boolean;
	    structureExport: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Capability(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.queryEditor = source["queryEditor"];
	        this.schemaBrowser = source["schemaBrowser"];
	        this.tableDesigner = source["tableDesigner"];
	        this.ddlPreview = source["ddlPreview"];
	        this.aiAssist = source["aiAssist"];
	        this.intentPreview = source["intentPreview"];
	        this.csvImport = source["csvImport"];
	        this.excelImport = source["excelImport"];
	        this.dataExport = source["dataExport"];
	        this.structureExport = source["structureExport"];
	    }
	}
	export class EngineDescriptor {
	    id: string;
	    name: string;
	    category: string;
	    queryLanguage: string;
	    summary: string;
	    capability: Capability;
	
	    static createFrom(source: any = {}) {
	        return new EngineDescriptor(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.category = source["category"];
	        this.queryLanguage = source["queryLanguage"];
	        this.summary = source["summary"];
	        this.capability = this.convertValues(source["capability"], Capability);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace history {
	
	export class Overview {
	    features: string[];
	    retention: string;
	    smartActions: string[];
	
	    static createFrom(source: any = {}) {
	        return new Overview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.features = source["features"];
	        this.retention = source["retention"];
	        this.smartActions = source["smartActions"];
	    }
	}

}

export namespace impexp {
	
	export class Overview {
	    importFormats: string[];
	    exportFormats: string[];
	    scenarios: string[];
	    safeguards: string[];
	
	    static createFrom(source: any = {}) {
	        return new Overview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.importFormats = source["importFormats"];
	        this.exportFormats = source["exportFormats"];
	        this.scenarios = source["scenarios"];
	        this.safeguards = source["safeguards"];
	    }
	}

}

export namespace schema {
	
	export class RiskGuard {
	    action: string;
	    level: string;
	    rule: string;
	
	    static createFrom(source: any = {}) {
	        return new RiskGuard(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.action = source["action"];
	        this.level = source["level"];
	        this.rule = source["rule"];
	    }
	}

}

export namespace store {
	
	export class CrashLogEntry {
	    id: string;
	    message: string;
	    stack: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new CrashLogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.message = source["message"];
	        this.stack = source["stack"];
	        this.createdAt = source["createdAt"];
	    }
	}

}

export namespace workspace {
	
	export class AIFieldCommentRequest {
	    fieldName: string;
	
	    static createFrom(source: any = {}) {
	        return new AIFieldCommentRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fieldName = source["fieldName"];
	    }
	}
	export class AIFieldCommentResult {
	    fieldName: string;
	    comment: string;
	
	    static createFrom(source: any = {}) {
	        return new AIFieldCommentResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fieldName = source["fieldName"];
	        this.comment = source["comment"];
	    }
	}
	export class AISettingsInput {
	    baseUrl: string;
	    modelName: string;
	    apiKey: string;
	    chatMaxRepairAttempts: number;
	
	    static createFrom(source: any = {}) {
	        return new AISettingsInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseUrl = source["baseUrl"];
	        this.modelName = source["modelName"];
	        this.apiKey = source["apiKey"];
	        this.chatMaxRepairAttempts = source["chatMaxRepairAttempts"];
	    }
	}
	export class AISettingsView {
	    baseUrl: string;
	    modelName: string;
	    apiKeyConfigured: boolean;
	    apiKeySource: string;
	    apiKeyPreview: string;
	    storageMode: string;
	    chatMaxRepairAttempts: number;
	
	    static createFrom(source: any = {}) {
	        return new AISettingsView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseUrl = source["baseUrl"];
	        this.modelName = source["modelName"];
	        this.apiKeyConfigured = source["apiKeyConfigured"];
	        this.apiKeySource = source["apiKeySource"];
	        this.apiKeyPreview = source["apiKeyPreview"];
	        this.storageMode = source["storageMode"];
	        this.chatMaxRepairAttempts = source["chatMaxRepairAttempts"];
	    }
	}
	export class BatchExecuteRequest {
	    connectionId: string;
	    database: string;
	    sqls: string[];
	    stopOnError: boolean;
	
	    static createFrom(source: any = {}) {
	        return new BatchExecuteRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.sqls = source["sqls"];
	        this.stopOnError = source["stopOnError"];
	    }
	}
	export class BatchExecuteResult {
	    success: number;
	    failed: number;
	    total: number;
	    errors: string[];
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new BatchExecuteResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.failed = source["failed"];
	        this.total = source["total"];
	        this.errors = source["errors"];
	        this.message = source["message"];
	    }
	}
	export class SchemaIndexInput {
	    name: string;
	    columns: string[];
	    unique: boolean;
	    indexType: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaIndexInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.columns = source["columns"];
	        this.unique = source["unique"];
	        this.indexType = source["indexType"];
	    }
	}
	export class SchemaFieldInput {
	    name: string;
	    type: string;
	    nullable: boolean;
	    defaultValue: string;
	    comment: string;
	    primary: boolean;
	    autoIncrement: boolean;
	    unsigned: boolean;
	    onUpdate: string;
	    charset: string;
	    collation: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaFieldInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.nullable = source["nullable"];
	        this.defaultValue = source["defaultValue"];
	        this.comment = source["comment"];
	        this.primary = source["primary"];
	        this.autoIncrement = source["autoIncrement"];
	        this.unsigned = source["unsigned"];
	        this.onUpdate = source["onUpdate"];
	        this.charset = source["charset"];
	        this.collation = source["collation"];
	    }
	}
	export class BuildAlterSQLRequest {
	    connectionId: string;
	    database: string;
	    table: string;
	    fields: SchemaFieldInput[];
	    indexes: SchemaIndexInput[];
	    scope: string;
	
	    static createFrom(source: any = {}) {
	        return new BuildAlterSQLRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.fields = this.convertValues(source["fields"], SchemaFieldInput);
	        this.indexes = this.convertValues(source["indexes"], SchemaIndexInput);
	        this.scope = source["scope"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BuildAlterSQLResult {
	    sql: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new BuildAlterSQLResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sql = source["sql"];
	        this.message = source["message"];
	    }
	}
	export class BuildCreateTableSQLRequest {
	    connectionId: string;
	    database: string;
	    schema: string;
	    tableName: string;
	    partitionBy: string;
	    primaryKey: string;
	    orderBy: string;
	    sampleBy: string;
	    fields: SchemaFieldInput[];
	    indexes: SchemaIndexInput[];
	
	    static createFrom(source: any = {}) {
	        return new BuildCreateTableSQLRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.schema = source["schema"];
	        this.tableName = source["tableName"];
	        this.partitionBy = source["partitionBy"];
	        this.primaryKey = source["primaryKey"];
	        this.orderBy = source["orderBy"];
	        this.sampleBy = source["sampleBy"];
	        this.fields = this.convertValues(source["fields"], SchemaFieldInput);
	        this.indexes = this.convertValues(source["indexes"], SchemaIndexInput);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BuildCreateTableSQLResult {
	    sql: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new BuildCreateTableSQLResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sql = source["sql"];
	        this.message = source["message"];
	    }
	}
	export class BuildPartitionDDLRequest {
	    connectionId: string;
	    database: string;
	    table: string;
	    action: string;
	    partitionClause: string;
	    partitionNames: string;
	
	    static createFrom(source: any = {}) {
	        return new BuildPartitionDDLRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.action = source["action"];
	        this.partitionClause = source["partitionClause"];
	        this.partitionNames = source["partitionNames"];
	    }
	}
	export class BuildPartitionDDLResult {
	    sql: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new BuildPartitionDDLResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sql = source["sql"];
	        this.message = source["message"];
	    }
	}
	export class ChatMessage {
	    role: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = source["content"];
	    }
	}
	export class ChatDatabaseRequest {
	    connectionId: string;
	    database: string;
	    selectedTable: string;
	    message: string;
	    history: ChatMessage[];
	    displayMode: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatDatabaseRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.selectedTable = source["selectedTable"];
	        this.message = source["message"];
	        this.history = this.convertValues(source["history"], ChatMessage);
	        this.displayMode = source["displayMode"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SQLAnalysis {
	    statementType: string;
	    riskLevel: string;
	    summary: string[];
	    warnings: string[];
	    requiresConfirm: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SQLAnalysis(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementType = source["statementType"];
	        this.riskLevel = source["riskLevel"];
	        this.summary = source["summary"];
	        this.warnings = source["warnings"];
	        this.requiresConfirm = source["requiresConfirm"];
	    }
	}
	export class ChatDatabaseResponse {
	    mode: string;
	    reply: string;
	    sql: string;
	    analysis: SQLAnalysis;
	    displayMode: string;
	    requiresConfirm: boolean;
	    reasoning: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatDatabaseResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.reply = source["reply"];
	        this.sql = source["sql"];
	        this.analysis = this.convertValues(source["analysis"], SQLAnalysis);
	        this.displayMode = source["displayMode"];
	        this.requiresConfirm = source["requiresConfirm"];
	        this.reasoning = source["reasoning"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ChatRepairRequest {
	    connectionId: string;
	    database: string;
	    selectedTable: string;
	    message: string;
	    attemptedSql: string;
	    errorMessage: string;
	    previousReason: string;
	    history: ChatMessage[];
	    displayMode: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatRepairRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.selectedTable = source["selectedTable"];
	        this.message = source["message"];
	        this.attemptedSql = source["attemptedSql"];
	        this.errorMessage = source["errorMessage"];
	        this.previousReason = source["previousReason"];
	        this.history = this.convertValues(source["history"], ChatMessage);
	        this.displayMode = source["displayMode"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ChatResultSummary {
	    summary: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatResultSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.summary = source["summary"];
	    }
	}
	export class QueryResult {
	    columns: string[];
	    rows: any[];
	    meta?: Record<string, string>;
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
	
	    static createFrom(source: any = {}) {
	        return new QueryResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = source["columns"];
	        this.rows = source["rows"];
	        this.meta = source["meta"];
	        this.affectedRows = source["affectedRows"];
	        this.durationMs = source["durationMs"];
	        this.effectiveSql = source["effectiveSql"];
	        this.statementType = source["statementType"];
	        this.message = source["message"];
	        this.page = source["page"];
	        this.pageSize = source["pageSize"];
	        this.autoLimited = source["autoLimited"];
	        this.hasNextPage = source["hasNextPage"];
	        this.analysis = this.convertValues(source["analysis"], SQLAnalysis);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ChatResultSummaryRequest {
	    connectionId: string;
	    database: string;
	    userMessage: string;
	    sql: string;
	    reasoning: string;
	    result: QueryResult;
	    history: ChatMessage[];
	
	    static createFrom(source: any = {}) {
	        return new ChatResultSummaryRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.userMessage = source["userMessage"];
	        this.sql = source["sql"];
	        this.reasoning = source["reasoning"];
	        this.result = this.convertValues(source["result"], QueryResult);
	        this.history = this.convertValues(source["history"], ChatMessage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConnectionInput {
	    id: string;
	    name: string;
	    engine: string;
	    host: string;
	    port: number;
	    username: string;
	    password: string;
	    database: string;
	    filePath: string;
	    url: string;
	    notes: string;
	    group: string;
	    groupColor: string;
	    sslMode: string;
	    sslCaCert: string;
	    sslClientCert: string;
	    sslClientKey: string;
	    sshHost: string;
	    sshPort: number;
	    sshUser: string;
	    sshPassword: string;
	    sshKeyFile: string;
	    useSSH: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.engine = source["engine"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.database = source["database"];
	        this.filePath = source["filePath"];
	        this.url = source["url"];
	        this.notes = source["notes"];
	        this.group = source["group"];
	        this.groupColor = source["groupColor"];
	        this.sslMode = source["sslMode"];
	        this.sslCaCert = source["sslCaCert"];
	        this.sslClientCert = source["sslClientCert"];
	        this.sslClientKey = source["sslClientKey"];
	        this.sshHost = source["sshHost"];
	        this.sshPort = source["sshPort"];
	        this.sshUser = source["sshUser"];
	        this.sshPassword = source["sshPassword"];
	        this.sshKeyFile = source["sshKeyFile"];
	        this.useSSH = source["useSSH"];
	    }
	}
	export class PoolEntryInfo {
	    key: string;
	    lastUsed: string;
	    openedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new PoolEntryInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.lastUsed = source["lastUsed"];
	        this.openedAt = source["openedAt"];
	    }
	}
	export class ConnectionPoolStatus {
	    entries: PoolEntryInfo[];
	    total: number;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionPoolStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.entries = this.convertValues(source["entries"], PoolEntryInfo);
	        this.total = source["total"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConnectionProfile {
	    id: string;
	    name: string;
	    engine: string;
	    host: string;
	    port: number;
	    username: string;
	    database: string;
	    filePath: string;
	    url: string;
	    notes: string;
	    group: string;
	    groupColor: string;
	    passwordSet: boolean;
	    sslMode: string;
	    sslCaCert: string;
	    sslClientCert: string;
	    sslClientKey: string;
	    sshHost: string;
	    sshPort: number;
	    sshUser: string;
	    sshPassword: string;
	    sshKeyFile: string;
	    useSSH: boolean;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.engine = source["engine"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.database = source["database"];
	        this.filePath = source["filePath"];
	        this.url = source["url"];
	        this.notes = source["notes"];
	        this.group = source["group"];
	        this.groupColor = source["groupColor"];
	        this.passwordSet = source["passwordSet"];
	        this.sslMode = source["sslMode"];
	        this.sslCaCert = source["sslCaCert"];
	        this.sslClientCert = source["sslClientCert"];
	        this.sslClientKey = source["sslClientKey"];
	        this.sshHost = source["sshHost"];
	        this.sshPort = source["sshPort"];
	        this.sshUser = source["sshUser"];
	        this.sshPassword = source["sshPassword"];
	        this.sshKeyFile = source["sshKeyFile"];
	        this.useSSH = source["useSSH"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class ConnectionTestResult {
	    success: boolean;
	    message: string;
	    detail: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionTestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.detail = source["detail"];
	    }
	}
	export class CreateDatabaseRequest {
	    connectionId: string;
	    databaseName: string;
	    charset: string;
	    collation: string;
	
	    static createFrom(source: any = {}) {
	        return new CreateDatabaseRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.databaseName = source["databaseName"];
	        this.charset = source["charset"];
	        this.collation = source["collation"];
	    }
	}
	export class CreateDatabaseResult {
	    success: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new CreateDatabaseResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	    }
	}
	export class CreateTableRequest {
	    connectionId: string;
	    database: string;
	    schema: string;
	    tableName: string;
	    partitionBy: string;
	    primaryKey: string;
	    orderBy: string;
	    sampleBy: string;
	    fields: SchemaFieldInput[];
	    indexes: SchemaIndexInput[];
	
	    static createFrom(source: any = {}) {
	        return new CreateTableRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.schema = source["schema"];
	        this.tableName = source["tableName"];
	        this.partitionBy = source["partitionBy"];
	        this.primaryKey = source["primaryKey"];
	        this.orderBy = source["orderBy"];
	        this.sampleBy = source["sampleBy"];
	        this.fields = this.convertValues(source["fields"], SchemaFieldInput);
	        this.indexes = this.convertValues(source["indexes"], SchemaIndexInput);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CreateTableResult {
	    success: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new CreateTableResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	    }
	}
	export class TableNode {
	    name: string;
	    rows: number;
	    engine: string;
	    comment: string;
	    keyType?: string;
	    loading: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TableNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.rows = source["rows"];
	        this.engine = source["engine"];
	        this.comment = source["comment"];
	        this.keyType = source["keyType"];
	        this.loading = source["loading"];
	    }
	}
	export class SchemaNode {
	    name: string;
	    tableCount: number;
	    tables: TableNode[];
	
	    static createFrom(source: any = {}) {
	        return new SchemaNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.tableCount = source["tableCount"];
	        this.tables = this.convertValues(source["tables"], TableNode);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DatabaseNode {
	    name: string;
	    isSystem: boolean;
	    tableCount: number;
	    schemas?: SchemaNode[];
	    tables: TableNode[];
	    nextCursor?: number;
	    hasMore?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DatabaseNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.isSystem = source["isSystem"];
	        this.tableCount = source["tableCount"];
	        this.schemas = this.convertValues(source["schemas"], SchemaNode);
	        this.tables = this.convertValues(source["tables"], TableNode);
	        this.nextCursor = source["nextCursor"];
	        this.hasMore = source["hasMore"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DatabaseUser {
	    name: string;
	    host: string;
	    grants: string;
	
	    static createFrom(source: any = {}) {
	        return new DatabaseUser(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.host = source["host"];
	        this.grants = source["grants"];
	    }
	}
	export class DatabaseUsersRequest {
	    connectionId: string;
	    database: string;
	
	    static createFrom(source: any = {}) {
	        return new DatabaseUsersRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	    }
	}
	export class DatabaseUsersResult {
	    users: DatabaseUser[];
	    supported: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new DatabaseUsersResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.users = this.convertValues(source["users"], DatabaseUser);
	        this.supported = source["supported"];
	        this.message = source["message"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ExplorerRequest {
	    connectionId: string;
	    database: string;
	
	    static createFrom(source: any = {}) {
	        return new ExplorerRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	    }
	}
	export class ExplorerTree {
	    connectionId: string;
	    connectionName: string;
	    engine: string;
	    databases: DatabaseNode[];
	    activeDatabase: string;
	    activeTable: string;
	    canDesignTables: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExplorerTree(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.connectionName = source["connectionName"];
	        this.engine = source["engine"];
	        this.databases = this.convertValues(source["databases"], DatabaseNode);
	        this.activeDatabase = source["activeDatabase"];
	        this.activeTable = source["activeTable"];
	        this.canDesignTables = source["canDesignTables"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ExportFileRequest {
	    suggestedName: string;
	    content: string;
	    kind: string;
	    title: string;
	
	    static createFrom(source: any = {}) {
	        return new ExportFileRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.suggestedName = source["suggestedName"];
	        this.content = source["content"];
	        this.kind = source["kind"];
	        this.title = source["title"];
	    }
	}
	export class ExportFileResult {
	    path: string;
	    saved: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExportFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.saved = source["saved"];
	    }
	}
	export class FieldDictionaryRequest {
	    engine: string;
	    fieldName: string;
	
	    static createFrom(source: any = {}) {
	        return new FieldDictionaryRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.engine = source["engine"];
	        this.fieldName = source["fieldName"];
	    }
	}
	export class FieldDictionarySuggestion {
	    fieldName: string;
	    matched: boolean;
	    type: string;
	    comment: string;
	    needsAiComment: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FieldDictionarySuggestion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fieldName = source["fieldName"];
	        this.matched = source["matched"];
	        this.type = source["type"];
	        this.comment = source["comment"];
	        this.needsAiComment = source["needsAiComment"];
	    }
	}
	export class FillTableRequest {
	    connectionId: string;
	    database: string;
	    table: string;
	    count: number;
	    fieldMappings: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new FillTableRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.count = source["count"];
	        this.fieldMappings = source["fieldMappings"];
	    }
	}
	export class FillTableResult {
	    success: boolean;
	    message: string;
	    insertedRows: number;
	
	    static createFrom(source: any = {}) {
	        return new FillTableResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.insertedRows = source["insertedRows"];
	    }
	}
	export class GenerateIndexNameRequest {
	    tableName: string;
	    columns: string[];
	    unique: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GenerateIndexNameRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tableName = source["tableName"];
	        this.columns = source["columns"];
	        this.unique = source["unique"];
	    }
	}
	export class GenerateIndexNameResult {
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new GenerateIndexNameResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	    }
	}
	export class HistoryItem {
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
	
	    static createFrom(source: any = {}) {
	        return new HistoryItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.connectionId = source["connectionId"];
	        this.engine = source["engine"];
	        this.database = source["database"];
	        this.statement = source["statement"];
	        this.statementType = source["statementType"];
	        this.riskLevel = source["riskLevel"];
	        this.success = source["success"];
	        this.durationMs = source["durationMs"];
	        this.rowCount = source["rowCount"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class ImportFileRequest {
	    connectionId: string;
	    database: string;
	    table: string;
	    filePath: string;
	    format: string;
	    delimiter: string;
	    hasHeader: boolean;
	    encoding: string;
	    mode: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportFileRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.filePath = source["filePath"];
	        this.format = source["format"];
	        this.delimiter = source["delimiter"];
	        this.hasHeader = source["hasHeader"];
	        this.encoding = source["encoding"];
	        this.mode = source["mode"];
	    }
	}
	export class ImportPreviewRequest {
	    filePath: string;
	    format: string;
	    delimiter: string;
	    hasHeader: boolean;
	    encoding: string;
	    limit: number;
	
	    static createFrom(source: any = {}) {
	        return new ImportPreviewRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filePath = source["filePath"];
	        this.format = source["format"];
	        this.delimiter = source["delimiter"];
	        this.hasHeader = source["hasHeader"];
	        this.encoding = source["encoding"];
	        this.limit = source["limit"];
	    }
	}
	export class ImportPreviewResult {
	    columns: string[];
	    rows: any[];
	    total: number;
	    format: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportPreviewResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = source["columns"];
	        this.rows = source["rows"];
	        this.total = source["total"];
	        this.format = source["format"];
	        this.message = source["message"];
	    }
	}
	export class ImportResult {
	    success: boolean;
	    message: string;
	    insertedRows: number;
	    skippedRows: number;
	    sql: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.insertedRows = source["insertedRows"];
	        this.skippedRows = source["skippedRows"];
	        this.sql = source["sql"];
	    }
	}
	export class IndexDiagnostic {
	    level: string;
	    title: string;
	    detail: string;
	
	    static createFrom(source: any = {}) {
	        return new IndexDiagnostic(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.level = source["level"];
	        this.title = source["title"];
	        this.detail = source["detail"];
	    }
	}
	export class PartitionActionRequest {
	    connectionId: string;
	    database: string;
	    table: string;
	    action: string;
	    partitionClause: string;
	    partitionNames: string;
	
	    static createFrom(source: any = {}) {
	        return new PartitionActionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.action = source["action"];
	        this.partitionClause = source["partitionClause"];
	        this.partitionNames = source["partitionNames"];
	    }
	}
	export class PartitionActionResult {
	    success: boolean;
	    message: string;
	    sql: string;
	
	    static createFrom(source: any = {}) {
	        return new PartitionActionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.sql = source["sql"];
	    }
	}
	export class PartitionInfo {
	    name: string;
	    method: string;
	    expression: string;
	    description: string;
	    rowCount: number;
	    dataSize: number;
	    indexSize: number;
	
	    static createFrom(source: any = {}) {
	        return new PartitionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.method = source["method"];
	        this.expression = source["expression"];
	        this.description = source["description"];
	        this.rowCount = source["rowCount"];
	        this.dataSize = source["dataSize"];
	        this.indexSize = source["indexSize"];
	    }
	}
	export class PerformanceRequest {
	    connectionId: string;
	    database: string;
	    metricType: string;
	
	    static createFrom(source: any = {}) {
	        return new PerformanceRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.metricType = source["metricType"];
	    }
	}
	export class PerformanceResult {
	    metricType: string;
	    columns: string[];
	    rows: any[];
	    supported: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new PerformanceResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.metricType = source["metricType"];
	        this.columns = source["columns"];
	        this.rows = source["rows"];
	        this.supported = source["supported"];
	        this.message = source["message"];
	    }
	}
	
	export class PreviewSmartFillSQLRequest {
	    connectionId: string;
	    database: string;
	    table: string;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new PreviewSmartFillSQLRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.count = source["count"];
	    }
	}
	export class PreviewSmartFillSQLResult {
	    success: boolean;
	    message: string;
	    reasoning: string;
	    sqls: string[];
	
	    static createFrom(source: any = {}) {
	        return new PreviewSmartFillSQLResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.reasoning = source["reasoning"];
	        this.sqls = source["sqls"];
	    }
	}
	export class QueryRequest {
	    connectionId: string;
	    database: string;
	    sql: string;
	    page: number;
	    pageSize: number;
	
	    static createFrom(source: any = {}) {
	        return new QueryRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.sql = source["sql"];
	        this.page = source["page"];
	        this.pageSize = source["pageSize"];
	    }
	}
	
	export class RedisKeyBrowseRequest {
	    connectionId: string;
	    database: string;
	    cursor: number;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new RedisKeyBrowseRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.cursor = source["cursor"];
	        this.count = source["count"];
	    }
	}
	export class RedisKeyBrowseResult {
	    connectionId: string;
	    database: string;
	    cursor: number;
	    nextCursor: number;
	    hasMore: boolean;
	    keys: TableNode[];
	
	    static createFrom(source: any = {}) {
	        return new RedisKeyBrowseResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.cursor = source["cursor"];
	        this.nextCursor = source["nextCursor"];
	        this.hasMore = source["hasMore"];
	        this.keys = this.convertValues(source["keys"], TableNode);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RenameTableInput {
	    connectionId: string;
	    database: string;
	    oldName: string;
	    newName: string;
	
	    static createFrom(source: any = {}) {
	        return new RenameTableInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.oldName = source["oldName"];
	        this.newName = source["newName"];
	    }
	}
	export class RenameTableResult {
	    database: string;
	    oldName: string;
	    newName: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new RenameTableResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.database = source["database"];
	        this.oldName = source["oldName"];
	        this.newName = source["newName"];
	        this.message = source["message"];
	    }
	}
	
	export class SQLOptimizeRequest {
	    connectionId: string;
	    database: string;
	    sql: string;
	    prompt: string;
	    table: string;
	
	    static createFrom(source: any = {}) {
	        return new SQLOptimizeRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.sql = source["sql"];
	        this.prompt = source["prompt"];
	        this.table = source["table"];
	    }
	}
	export class SQLOptimizeResult {
	    sql: string;
	    analysis: SQLAnalysis;
	    source: string;
	    reasoning: string;
	    promptUsed: string;
	
	    static createFrom(source: any = {}) {
	        return new SQLOptimizeResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sql = source["sql"];
	        this.analysis = this.convertValues(source["analysis"], SQLAnalysis);
	        this.source = source["source"];
	        this.reasoning = source["reasoning"];
	        this.promptUsed = source["promptUsed"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class SetStoragePathResult {
	    success: boolean;
	    newPath: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new SetStoragePathResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.newPath = source["newPath"];
	        this.message = source["message"];
	    }
	}
	export class SmartFillTableRequest {
	    connectionId: string;
	    database: string;
	    table: string;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new SmartFillTableRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.count = source["count"];
	    }
	}
	export class SmartFillTableResult {
	    success: boolean;
	    message: string;
	    insertedRows: number;
	    sqls: string[];
	
	    static createFrom(source: any = {}) {
	        return new SmartFillTableResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.insertedRows = source["insertedRows"];
	        this.sqls = source["sqls"];
	    }
	}
	export class StorageFileEntry {
	    name: string;
	    path: string;
	    size: number;
	    sizeHR: string;
	
	    static createFrom(source: any = {}) {
	        return new StorageFileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.size = source["size"];
	        this.sizeHR = source["sizeHR"];
	    }
	}
	export class StorageInfoView {
	    dataDir: string;
	    files: StorageFileEntry[];
	    total: number;
	    totalHR: string;
	    writable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new StorageInfoView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dataDir = source["dataDir"];
	        this.files = this.convertValues(source["files"], StorageFileEntry);
	        this.total = source["total"];
	        this.totalHR = source["totalHR"];
	        this.writable = source["writable"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SuggestPartitionRequest {
	    engine: string;
	    tableName: string;
	    fields: SchemaFieldInput[];
	    indexes: SchemaIndexInput[];
	
	    static createFrom(source: any = {}) {
	        return new SuggestPartitionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.engine = source["engine"];
	        this.tableName = source["tableName"];
	        this.fields = this.convertValues(source["fields"], SchemaFieldInput);
	        this.indexes = this.convertValues(source["indexes"], SchemaIndexInput);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SuggestPartitionResult {
	    partitionddl: string;
	    suggestion: string;
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new SuggestPartitionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.partitionddl = source["partitionddl"];
	        this.suggestion = source["suggestion"];
	        this.warnings = source["warnings"];
	    }
	}
	export class TableIndex {
	    name: string;
	    columns: string[];
	    unique: boolean;
	    indexType: string;
	    cardinality: number;
	
	    static createFrom(source: any = {}) {
	        return new TableIndex(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.columns = source["columns"];
	        this.unique = source["unique"];
	        this.indexType = source["indexType"];
	        this.cardinality = source["cardinality"];
	    }
	}
	export class TableField {
	    name: string;
	    type: string;
	    nullable: boolean;
	    defaultValue: string;
	    comment: string;
	    primary: boolean;
	    autoIncrement: boolean;
	    unsigned: boolean;
	    onUpdate: string;
	    charset: string;
	    collation: string;
	
	    static createFrom(source: any = {}) {
	        return new TableField(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.nullable = source["nullable"];
	        this.defaultValue = source["defaultValue"];
	        this.comment = source["comment"];
	        this.primary = source["primary"];
	        this.autoIncrement = source["autoIncrement"];
	        this.unsigned = source["unsigned"];
	        this.onUpdate = source["onUpdate"];
	        this.charset = source["charset"];
	        this.collation = source["collation"];
	    }
	}
	export class TableDetail {
	    connectionId: string;
	    database: string;
	    table: string;
	    ddl: string;
	    fields: TableField[];
	    indexes: TableIndex[];
	    indexDiagnostics: IndexDiagnostic[];
	
	    static createFrom(source: any = {}) {
	        return new TableDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.ddl = source["ddl"];
	        this.fields = this.convertValues(source["fields"], TableField);
	        this.indexes = this.convertValues(source["indexes"], TableIndex);
	        this.indexDiagnostics = this.convertValues(source["indexDiagnostics"], IndexDiagnostic);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TableDetailRequest {
	    connectionId: string;
	    database: string;
	    table: string;
	
	    static createFrom(source: any = {}) {
	        return new TableDetailRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	    }
	}
	
	
	
	export class TablePartitionRequest {
	    connectionId: string;
	    database: string;
	    table: string;
	
	    static createFrom(source: any = {}) {
	        return new TablePartitionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	    }
	}
	export class TablePartitionResult {
	    connectionId: string;
	    database: string;
	    table: string;
	    partitionKey: string;
	    partitions: PartitionInfo[];
	    supported: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new TablePartitionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.partitionKey = source["partitionKey"];
	        this.partitions = this.convertValues(source["partitions"], PartitionInfo);
	        this.supported = source["supported"];
	        this.message = source["message"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TablePreviewRequest {
	    connectionId: string;
	    database: string;
	    table: string;
	    page: number;
	    pageSize: number;
	
	    static createFrom(source: any = {}) {
	        return new TablePreviewRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.page = source["page"];
	        this.pageSize = source["pageSize"];
	    }
	}
	export class TableRowCountRequest {
	    connectionId: string;
	    database: string;
	    tables: string[];
	
	    static createFrom(source: any = {}) {
	        return new TableRowCountRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.tables = source["tables"];
	    }
	}
	export class TableRowCountResult {
	    connectionId: string;
	    database: string;
	    counts: Record<string, number>;
	
	    static createFrom(source: any = {}) {
	        return new TableRowCountResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.counts = source["counts"];
	    }
	}
	export class TransactionRequest {
	    connectionId: string;
	    database: string;
	    action: string;
	
	    static createFrom(source: any = {}) {
	        return new TransactionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.action = source["action"];
	    }
	}
	export class TransactionResult {
	    success: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new TransactionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	    }
	}
	export class WorkspaceState {
	    connections: ConnectionProfile[];
	    ai: AISettingsView;
	    storagePath: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connections = this.convertValues(source["connections"], ConnectionProfile);
	        this.ai = this.convertValues(source["ai"], AISettingsView);
	        this.storagePath = source["storagePath"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

