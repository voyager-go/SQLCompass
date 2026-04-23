export type ConnectionInput = {
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
};

export type ConnectionProfile = Omit<ConnectionInput, "password"> & {
    passwordSet: boolean;
    createdAt: string;
    updatedAt: string;
};

export type ConnectionGroup = {
    name: string;
    color: string;
    connections: ConnectionProfile[];
};

export type ConnectionTestResult = {
    success: boolean;
    message: string;
    detail: string;
};

export type AISettingsInput = {
    baseUrl: string;
    modelName: string;
    apiKey: string;
};

export type AISettingsView = {
    baseUrl: string;
    modelName: string;
    apiKeyConfigured: boolean;
    apiKeySource: string;
    apiKeyPreview: string;
    storageMode: string;
};

export type WorkspaceState = {
    connections: ConnectionProfile[];
    ai: AISettingsView;
    storagePath: string;
};
