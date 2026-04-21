import { NoticeBanner } from "../components/NoticeBanner";
import type { AISettingsInput } from "../types/workspace";

type NoticeTone = "success" | "error" | "info";

type Notice = {
    tone: NoticeTone;
    message: string;
};

type AIState = {
    apiKeySource: string;
    modelName: string;
    storageMode: string;
};

type ConnectionProfile = {
    name: string;
};

export function AIPage({
    aiNotice,
    aiForm,
    setAIForm,
    isSavingAI,
    onSave,
    onClear,
    aiState,
    selectedConnectionName,
}: {
    aiNotice: Notice | null;
    aiForm: AISettingsInput;
    setAIForm: (updater: (current: AISettingsInput) => AISettingsInput) => void;
    isSavingAI: boolean;
    onSave: () => void;
    onClear: () => void;
    aiState: AIState;
    selectedConnectionName: string;
}) {
    return (
        <section className="page-panel">
            <NoticeBanner notice={aiNotice} />

            <div className="ai-layout">
                <div className="panel-card">
                    <div className="form-grid">
                        <label className="field field--full">
                            <span>Base URL</span>
                            <input value={aiForm.baseUrl} onChange={(event) => setAIForm((current) => ({ ...current, baseUrl: event.target.value }))} />
                        </label>
                        <label className="field field--full">
                            <span>Model Name</span>
                            <input value={aiForm.modelName} onChange={(event) => setAIForm((current) => ({ ...current, modelName: event.target.value }))} />
                        </label>
                        <label className="field field--full">
                            <span>API Key</span>
                            <input
                                type="password"
                                value={aiForm.apiKey}
                                onChange={(event) => setAIForm((current) => ({ ...current, apiKey: event.target.value }))}
                                placeholder="输入新 Key 后保存"
                            />
                        </label>
                    </div>
                    <div className="form-actions" style={{ display: "flex", gap: "8px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                        <button type="button" className="ghost-button" onClick={onClear} disabled={isSavingAI}>
                            清空 Key
                        </button>
                        <button type="button" className="primary-button" onClick={onSave} disabled={isSavingAI}>
                            {isSavingAI ? "保存中..." : "保存设置"}
                        </button>
                    </div>
                </div>

                <div className="panel-card">
                    <div className="section-title">
                        <div>
                            <h3>当前状态</h3>
                            <p>这里展示的是本地已保存配置，而不是仓库里的明文信息。</p>
                        </div>
                    </div>
                    <div className="summary-list">
                        <div className="summary-item">
                            <span>API 来源</span>
                            <strong>{aiState.apiKeySource}</strong>
                        </div>
                        <div className="summary-item">
                            <span>模型</span>
                            <strong>{aiState.modelName}</strong>
                        </div>
                        <div className="summary-item">
                            <span>存储方式</span>
                            <strong>{aiState.storageMode}</strong>
                        </div>
                        <div className="summary-item">
                            <span>当前连接</span>
                            <strong>{selectedConnectionName || "未选择"}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
