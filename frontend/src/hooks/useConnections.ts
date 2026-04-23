import { useState } from "react";
import type { ConnectionInput, ConnectionProfile, ConnectionTestResult } from "../types/workspace";
import {
    createConnectionDraft,
    upsertBrowserConnection,
    removeBrowserConnection,
    saveBrowserWorkspaceState,
} from "../lib/utils";
import { DeleteConnection, SaveConnection, TestConnection } from "../../wailsjs/go/main/App";
import type { NoticeTone } from "../lib/constants";

type Notice = {
    tone: NoticeTone;
    message: string;
};
import type { WorkspaceState } from "../types/workspace";

export interface UseConnectionsOptions {
    workspaceState: WorkspaceState;
    setWorkspaceState: React.Dispatch<React.SetStateAction<WorkspaceState>>;
    selectedConnectionId: string;
    setSelectedConnectionId: React.Dispatch<React.SetStateAction<string>>;
    selectedConnection: ConnectionProfile | null;
    browserPreview: boolean;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
    refreshWorkspaceState: () => Promise<void>;
    setWorkspaceNotice: React.Dispatch<React.SetStateAction<Notice | null>>;
    setActivePage: (page: string) => void;
}

export interface UseConnectionsReturn {
    connectionDraft: ConnectionInput;
    setConnectionDraft: React.Dispatch<React.SetStateAction<ConnectionInput>>;
    showPassword: boolean;
    setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
    connectionNotice: Notice | null;
    setConnectionNotice: React.Dispatch<React.SetStateAction<Notice | null>>;
    connectionTest: ConnectionTestResult | null;
    setConnectionTest: React.Dispatch<React.SetStateAction<ConnectionTestResult | null>>;
    isSavingConnection: boolean;
    isTestingConnection: boolean;
    updateConnectionField: <K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) => void;
    resetConnectionForm: (engine?: string) => void;
    fillConnectionDraft: (profile: ConnectionProfile) => void;
    handleSelectConnection: (profile: ConnectionProfile) => void;
    handleSaveConnection: () => Promise<void>;
    handleDeleteConnection: (profile: ConnectionProfile) => Promise<void>;
    handleTestConnection: () => Promise<void>;
}

export function useConnections(options: UseConnectionsOptions): UseConnectionsReturn {
    const {
        workspaceState,
        setWorkspaceState,
        selectedConnectionId,
        setSelectedConnectionId,
        selectedConnection,
        browserPreview,
        pushToast,
        refreshWorkspaceState,
        setWorkspaceNotice,
        setActivePage,
    } = options;

    const [connectionDraft, setConnectionDraft] = useState<ConnectionInput>(createConnectionDraft("mysql"));
    const [showPassword, setShowPassword] = useState(false);
    const [connectionNotice, setConnectionNotice] = useState<Notice | null>(null);
    const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null);
    const [isSavingConnection, setIsSavingConnection] = useState(false);
    const [isTestingConnection, setIsTestingConnection] = useState(false);

    function updateConnectionField<K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) {
        setConnectionDraft((current) => {
            if (key === "engine") {
                const nextEngine = String(value);
                return {
                    ...createConnectionDraft(nextEngine),
                    id: current.id,
                    name: current.name,
                    notes: current.notes,
                };
            }

            return {
                ...current,
                [key]: value,
            };
        });
    }

    function resetConnectionForm(engine = selectedConnection?.engine ?? "mysql") {
        setConnectionDraft(createConnectionDraft(engine));
        setConnectionTest(null);
    }

    function fillConnectionDraft(profile: ConnectionProfile) {
        setConnectionDraft({
            id: profile.id,
            name: profile.name,
            engine: profile.engine,
            host: profile.host,
            port: profile.port,
            username: profile.username,
            password: "",
            database: profile.database,
            filePath: profile.filePath,
            url: profile.url,
            notes: profile.notes,
            group: profile.group || "默认分组",
            groupColor: profile.groupColor || "",
            sslMode: profile.sslMode || "disable",
            sslCaCert: profile.sslCaCert || "",
            sslClientCert: profile.sslClientCert || "",
            sslClientKey: profile.sslClientKey || "",
            sshHost: profile.sshHost || "",
            sshPort: profile.sshPort || 22,
            sshUser: profile.sshUser || "",
            sshPassword: "",
            sshKeyFile: profile.sshKeyFile || "",
            useSSH: profile.useSSH || false,
        });
        setActivePage("connections");
    }

    function handleSelectConnection(profile: ConnectionProfile) {
        setSelectedConnectionId(profile.id);
        setWorkspaceNotice(null);
        pushToast("success", "已定位连接", `当前连接：${profile.name}`);
    }

    async function handleSaveConnection() {
        try {
            setIsSavingConnection(true);
            if (browserPreview) {
                const nextState = upsertBrowserConnection(workspaceState, connectionDraft);
                saveBrowserWorkspaceState(nextState);
                setWorkspaceState(nextState);
                setSelectedConnectionId(nextState.connections[0]?.id ?? "");
                setConnectionNotice({ tone: "success", message: "连接已保存到浏览器预览存储。" });
                resetConnectionForm(connectionDraft.engine);
                return;
            }

            const profile = (await SaveConnection(connectionDraft)) as ConnectionProfile;
            await refreshWorkspaceState();
            setSelectedConnectionId(profile.id);
            setConnectionNotice({ tone: "success", message: `连接已保存：${profile.name}` });
            pushToast("success", "连接已保存", profile.name);
            resetConnectionForm(profile.engine);
        } catch (error) {
            const message = error instanceof Error ? error.message : "保存连接失败";
            setConnectionNotice({ tone: "error", message });
        } finally {
            setIsSavingConnection(false);
        }
    }

    async function handleDeleteConnection(profile: ConnectionProfile) {
        if (!window.confirm(`确认删除连接“${profile.name}”吗？`)) {
            return;
        }

        try {
            if (browserPreview) {
                const nextState = removeBrowserConnection(workspaceState, profile.id);
                saveBrowserWorkspaceState(nextState);
                setWorkspaceState(nextState);
                setConnectionNotice({ tone: "success", message: `连接已删除：${profile.name}` });
                return;
            }

            await DeleteConnection(profile.id);
            await refreshWorkspaceState();
            setConnectionNotice({ tone: "success", message: `连接已删除：${profile.name}` });
        } catch (error) {
            const message = error instanceof Error ? error.message : "删除连接失败";
            setConnectionNotice({ tone: "error", message });
        }
    }

    async function handleTestConnection() {
        try {
            setIsTestingConnection(true);
            if (browserPreview) {
                setConnectionNotice({ tone: "info", message: "浏览器预览模式不支持真实数据库测试。" });
                return;
            }

            const result = (await TestConnection(connectionDraft)) as ConnectionTestResult;
            setConnectionTest(result);
            setConnectionNotice({ tone: result.success ? "success" : "error", message: result.detail });
        } catch (error) {
            const message = error instanceof Error ? error.message : "测试连接失败";
            setConnectionNotice({ tone: "error", message });
        } finally {
            setIsTestingConnection(false);
        }
    }

    return {
        connectionDraft,
        setConnectionDraft,
        showPassword,
        setShowPassword,
        connectionNotice,
        setConnectionNotice,
        connectionTest,
        setConnectionTest,
        isSavingConnection,
        isTestingConnection,
        updateConnectionField,
        resetConnectionForm,
        fillConnectionDraft,
        handleSelectConnection,
        handleSaveConnection,
        handleDeleteConnection,
        handleTestConnection,
    };
}
