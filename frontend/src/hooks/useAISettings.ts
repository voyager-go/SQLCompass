import { useState } from "react";
import { SaveAISettings, ClearAIAPIKey } from "../../wailsjs/go/main/App";
import { saveBrowserWorkspaceState, updateBrowserAIState, createAIForm } from "../lib/utils";
import type { AISettingsInput } from "../types/workspace";
import type { WorkspaceState } from "../types/workspace";
import type { NoticeTone } from "../lib/constants";

type Notice = {
    tone: NoticeTone;
    message: string;
};

export interface UseAISettingsOptions {
    browserPreview: boolean;
    workspaceState: WorkspaceState;
    setWorkspaceState: React.Dispatch<React.SetStateAction<WorkspaceState>>;
    emptyWorkspaceState: WorkspaceState;
    refreshWorkspaceState: () => Promise<void>;
}

export interface UseAISettingsReturn {
    aiForm: AISettingsInput;
    setAIForm: React.Dispatch<React.SetStateAction<AISettingsInput>>;
    aiNotice: Notice | null;
    setAINotice: React.Dispatch<React.SetStateAction<Notice | null>>;
    isSavingAI: boolean;
    handleSaveAISettings: () => Promise<void>;
    handleClearAPIKey: () => Promise<void>;
}

export function useAISettings(options: UseAISettingsOptions): UseAISettingsReturn {
    const { browserPreview, workspaceState, setWorkspaceState, emptyWorkspaceState, refreshWorkspaceState } = options;

    const [aiForm, setAIForm] = useState<AISettingsInput>(createAIForm(emptyWorkspaceState));
    const [aiNotice, setAINotice] = useState<Notice | null>(null);
    const [isSavingAI, setIsSavingAI] = useState(false);

    async function handleSaveAISettings() {
        try {
            setIsSavingAI(true);
            if (browserPreview) {
                const nextState = updateBrowserAIState(workspaceState, aiForm);
                saveBrowserWorkspaceState(nextState);
                setWorkspaceState(nextState);
                setAINotice({ tone: "success", message: "AI 设置已保存到浏览器预览存储。" });
                return;
            }

            await SaveAISettings(aiForm);
            await refreshWorkspaceState();
            setAIForm((current) => ({ ...current, apiKey: "" }));
            setAINotice({ tone: "success", message: "AI 设置已保存。" });
        } catch (error) {
            const message = error instanceof Error ? error.message : "保存 AI 设置失败";
            setAINotice({ tone: "error", message });
        } finally {
            setIsSavingAI(false);
        }
    }

    async function handleClearAPIKey() {
        try {
            setIsSavingAI(true);
            if (browserPreview) {
                const nextState: WorkspaceState = {
                    ...workspaceState,
                    ai: {
                        ...workspaceState.ai,
                        apiKeyConfigured: false,
                        apiKeySource: "未配置",
                        apiKeyPreview: "",
                        storageMode: "浏览器本地预览",
                    },
                };
                saveBrowserWorkspaceState(nextState);
                setWorkspaceState(nextState);
                setAINotice({ tone: "success", message: "AI Key 已清空。" });
                return;
            }

            await ClearAIAPIKey();
            await refreshWorkspaceState();
            setAINotice({ tone: "success", message: "AI Key 已清空。" });
        } catch (error) {
            const message = error instanceof Error ? error.message : "清空 AI Key 失败";
            setAINotice({ tone: "error", message });
        } finally {
            setIsSavingAI(false);
        }
    }

    return {
        aiForm,
        setAIForm,
        aiNotice,
        setAINotice,
        isSavingAI,
        handleSaveAISettings,
        handleClearAPIKey,
    };
}
