export type NavigationItem = {
    id: string;
    title: string;
    description: string;
};

export type EngineCapabilities = {
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
};

export type EngineDescriptor = {
    id: string;
    name: string;
    category: string;
    queryLanguage: string;
    summary: string;
    capability: EngineCapabilities;
};

export type AISettings = {
    baseUrl: string;
    modelName: string;
    apiKeyConfigured: boolean;
    apiKeySource: string;
    storageMode: string;
};

export type AIWorkflow = {
    id: string;
    title: string;
    summary: string;
    requiresPreview: boolean;
    riskNotes: string[];
};

export type AIOverview = {
    settings: AISettings;
    features: AIWorkflow[];
    safeguards: string[];
};

export type HistoryOverview = {
    features: string[];
    retention: string;
    smartActions: string[];
};

export type ImportExportOverview = {
    importFormats: string[];
    exportFormats: string[];
    scenarios: string[];
    safeguards: string[];
};

export type RiskGuard = {
    action: string;
    level: string;
    rule: string;
};

export type DeliveryPhase = {
    name: string;
    outcome: string;
    highlights: string[];
};

export type ProductOverview = {
    appName: string;
    tagline: string;
    summary: string;
    desktopTarget: string;
    navigation: NavigationItem[];
    engines: EngineDescriptor[];
    ai: AIOverview;
    history: HistoryOverview;
    importExport: ImportExportOverview;
    safeguards: RiskGuard[];
    roadmap: DeliveryPhase[];
    constraints: string[];
};
