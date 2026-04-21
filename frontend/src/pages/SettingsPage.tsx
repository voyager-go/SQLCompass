import { useCallback, useState } from "react";
import {
    ClearStorageData,
    GetCrashLogs,
    GetStorageInfo,
    GrantStoragePermission,
    SelectStorageDirectory,
    SetStoragePath,
} from "../../wailsjs/go/main/App";
import type { SetStoragePathResult, StorageInfoView } from "../types/runtime";

type NoticeTone = "success" | "error" | "info";

type CrashLogEntry = {
    id: string;
    message: string;
    stack: string;
    createdAt: string;
};

interface SettingsPageProps {
    browserPreview: boolean;
    newStoragePath: string;
    setNewStoragePath: (v: string) => void;
    storageInfo: StorageInfoView | null;
    setStorageInfo: (v: StorageInfoView | null) => void;
    showPermissionModal: boolean;
    setShowPermissionModal: (v: boolean) => void;
    showClearModal: string | null;
    setShowClearModal: (v: string | null) => void;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
    refreshWorkspaceState: () => Promise<void>;
}

const fileCategoryMap: Record<string, { label: string; category: string; color: string }> = {
    "app-state.json": { label: "连接配置", category: "connections", color: "#3b82f6" },
    "config.json": { label: "软件配置", category: "config", color: "#8b5cf6" },
    "query-history.json": { label: "SQL历史", category: "history", color: "#10b981" },
    "crash-logs.json": { label: "崩溃日志", category: "crash", color: "#ef4444" },
    "ai-snapshots.json": { label: "AI快照", category: "ai-snapshots", color: "#f59e0b" },
};

function getFileLabel(name: string) {
    return fileCategoryMap[name]?.label ?? "数据文件";
}

function getFileCategory(name: string) {
    return fileCategoryMap[name]?.category ?? "";
}

function getFileColor(name: string) {
    return fileCategoryMap[name]?.color ?? "#6b7280";
}

export function SettingsPage({
    browserPreview,
    newStoragePath,
    setNewStoragePath,
    storageInfo,
    setStorageInfo,
    showPermissionModal,
    setShowPermissionModal,
    showClearModal,
    setShowClearModal,
    pushToast,
    refreshWorkspaceState,
}: SettingsPageProps) {
    const [crashLogs, setCrashLogs] = useState<CrashLogEntry[]>([]);
    const [showCrashLogModal, setShowCrashLogModal] = useState(false);

    const handleSetStoragePath = useCallback(async () => {
        if (browserPreview) return;
        const result = (await SetStoragePath(newStoragePath)) as SetStoragePathResult;
        if (result.success) {
            pushToast("success", "路径已更新", result.message);
            const info = (await GetStorageInfo()) as StorageInfoView;
            setStorageInfo(info);
            await refreshWorkspaceState();
        } else {
            pushToast("error", "更新失败", result.message);
        }
    }, [browserPreview, newStoragePath, pushToast, refreshWorkspaceState, setStorageInfo]);

    const handleGrantPermission = useCallback(async () => {
        if (browserPreview) return;
        const result = (await GrantStoragePermission()) as SetStoragePathResult;
        if (result.success) {
            pushToast("success", "权限已授予", result.message);
            const info = (await GetStorageInfo()) as StorageInfoView;
            setStorageInfo(info);
        } else {
            pushToast("error", "权限设置失败", result.message);
        }
        setShowPermissionModal(false);
    }, [browserPreview, pushToast, setStorageInfo, setShowPermissionModal]);

    const handleClearData = useCallback(async (category: string) => {
        if (browserPreview) return;
        const result = (await ClearStorageData(category)) as SetStoragePathResult;
        if (result.success) {
            pushToast("success", "清理完成", result.message);
            const info = (await GetStorageInfo()) as StorageInfoView;
            setStorageInfo(info);
        } else {
            pushToast("error", "清理失败", result.message);
        }
        setShowClearModal(null);
    }, [browserPreview, pushToast, setStorageInfo, setShowClearModal]);

    const handleSelectDirectory = useCallback(async () => {
        if (browserPreview) return;
        const dir = await SelectStorageDirectory();
        if (dir) {
            setNewStoragePath(dir);
        }
    }, [browserPreview, setNewStoragePath]);

    const handleViewCrashLogs = useCallback(async () => {
        if (browserPreview) return;
        try {
            const logs = (await GetCrashLogs()) as CrashLogEntry[];
            setCrashLogs(logs ?? []);
            setShowCrashLogModal(true);
        } catch {
            pushToast("error", "读取失败", "无法读取崩溃日志");
        }
    }, [browserPreview, pushToast]);

    const clearModalLabel = (() => {
        switch (showClearModal) {
            case "history":
                return "所有SQL查询历史记录（仅保留近3天）";
            case "crash":
                return "所有崩溃日志";
            case "ai-snapshots":
                return "所有AI对话快照";
            case "config":
                return "所有软件与AI配置";
            case "connections":
                return "所有数据库连接配置";
            default:
                return "所选数据";
        }
    })();

    return (
        <section className="page-panel">
            <div className="page-headline">
                <div>
                    <h2>系统设置</h2>
                    <p>管理应用存储路径、查看存储占用与清理数据</p>
                </div>
            </div>

            {/* Storage Path */}
            <div className="settings-section panel-card" style={{ marginBottom: 20 }}>
                <div className="section-title">
                    <div>
                        <h3>存储路径</h3>
                        <p>自定义应用数据的存储位置，修改后已有数据将自动迁移</p>
                    </div>
                </div>
                <div className="settings-path-row">
                    <input
                        type="text"
                        className="settings-path-input"
                        value={newStoragePath}
                        onChange={(e) => setNewStoragePath(e.target.value)}
                        placeholder="输入新的存储路径..."
                    />
                    <button type="button" className="ghost-button" onClick={handleSelectDirectory} disabled={browserPreview} title="选择文件夹">
                        选择路径
                    </button>
                    <button type="button" className="primary-button" onClick={handleSetStoragePath} disabled={browserPreview || newStoragePath === (storageInfo?.dataDir ?? "")}>
                        应用配置
                    </button>
                </div>
            </div>

            {/* Storage Overview */}
            {storageInfo && (
                <div className="settings-section panel-card" style={{ marginBottom: 20 }}>
                    <div className="section-title">
                        <div>
                            <h3>存储概况</h3>
                            <p>应用数据文件按类别独立存储，便于管理与清理</p>
                        </div>
                        <div className="settings-total-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                            </svg>
                            <span>{storageInfo.totalHR}</span>
                        </div>
                    </div>

                    {!storageInfo.writable && (
                        <div className="notice-banner notice-banner--error" style={{ marginBottom: 14 }}>
                            <span className="notice-banner__icon">!</span>
                            <span className="notice-banner__text">
                                当前存储目录没有写入权限，部分功能可能无法正常使用。
                                <button type="button" className="text-button" onClick={() => setShowPermissionModal(true)} style={{ marginLeft: 8 }}>
                                    授权写入
                                </button>
                            </span>
                        </div>
                    )}

                    {storageInfo.writable && (
                        <div className="notice-banner notice-banner--success" style={{ marginBottom: 14 }}>
                            <span className="notice-banner__icon">✓</span>
                            <span className="notice-banner__text">存储目录读写权限正常</span>
                        </div>
                    )}

                    <div className="settings-file-list">
                        {storageInfo.files.length === 0 ? (
                            <div className="settings-file-empty">暂无存储文件</div>
                        ) : (
                            storageInfo.files.map((file, idx) => {
                                const category = getFileCategory(file.name);
                                const label = getFileLabel(file.name);
                                const color = getFileColor(file.name);
                                const isCrashLog = file.name === "crash-logs.json";
                                return (
                                    <div key={idx} className="settings-file-item">
                                        <div className="settings-file-icon">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                {file.name.endsWith("/") ? (
                                                    <>
                                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                                    </>
                                                ) : (
                                                    <>
                                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                        <polyline points="14 2 14 8 20 8"></polyline>
                                                    </>
                                                )}
                                            </svg>
                                        </div>
                                        <div className="settings-file-info">
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                                <span className="settings-file-name">{file.name}</span>
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        padding: "1px 6px",
                                                        borderRadius: 4,
                                                        background: `${color}18`,
                                                        color,
                                                        fontWeight: 600,
                                                        border: `1px solid ${color}30`,
                                                    }}
                                                >
                                                    {label}
                                                </span>
                                            </div>
                                            <span className="settings-file-path">{file.path}</span>
                                        </div>
                                        <div className="settings-file-size">{file.sizeHR}</div>
                                        <div style={{ display: "flex", gap: 6 }}>
                                            {isCrashLog && (
                                                <button
                                                    type="button"
                                                    className="mini-ghost-button"
                                                    onClick={handleViewCrashLogs}
                                                    title="查看崩溃日志"
                                                >
                                                    查看
                                                </button>
                                            )}
                                            {category && (
                                                <button
                                                    type="button"
                                                    className="mini-ghost-button ghost-button--danger"
                                                    onClick={() => setShowClearModal(category)}
                                                    title={`清理${label}`}
                                                >
                                                    清理
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* Permission Modal */}
            {showPermissionModal && (
                <div className="modal-backdrop" onClick={() => setShowPermissionModal(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>写入权限请求</h3>
                                <p>应用需要写入配置文件以保存您的设置</p>
                            </div>
                        </div>
                        <div className="notice-banner notice-banner--info">
                            <span className="notice-banner__icon">i</span>
                            <span className="notice-banner__text">
                                当前存储目录 <code>{storageInfo?.dataDir}</code> 没有写入权限。是否授权该目录读写权限？
                            </span>
                        </div>
                        <div className="toolbar-actions toolbar-actions--end">
                            <button type="button" className="ghost-button" onClick={() => setShowPermissionModal(false)}>
                                拒绝
                            </button>
                            <button type="button" className="primary-button" onClick={handleGrantPermission}>
                                授权写入
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clear Confirm Modal */}
            {showClearModal && (
                <div className="modal-backdrop" onClick={() => setShowClearModal(null)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>确认清理</h3>
                                <p>此操作不可撤销，请确认</p>
                            </div>
                        </div>
                        <div className="notice-banner notice-banner--error">
                            <span className="notice-banner__icon">!</span>
                            <span className="notice-banner__text">
                                确定要清除{clearModalLabel}吗？此操作不可撤销。
                            </span>
                        </div>
                        <div className="toolbar-actions toolbar-actions--end">
                            <button type="button" className="ghost-button" onClick={() => setShowClearModal(null)}>
                                取消
                            </button>
                            <button type="button" className="primary-button" style={{ background: "rgba(239, 68, 68, 0.9)", borderColor: "rgba(239, 68, 68, 0.6)" }} onClick={() => handleClearData(showClearModal)}>
                                确认清理
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Crash Log Viewer Modal */}
            {showCrashLogModal && (
                <div className="modal-backdrop" onClick={() => setShowCrashLogModal(false)}>
                    <div className="modal-card" style={{ maxWidth: 720, width: "90vw" }} onClick={(e) => e.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>崩溃日志</h3>
                                <p>软件运行过程中捕获的异常与堆栈信息</p>
                            </div>
                        </div>
                        {crashLogs.length === 0 ? (
                            <div className="settings-file-empty" style={{ padding: "24px 0" }}>
                                暂无崩溃日志
                            </div>
                        ) : (
                            <div style={{ maxHeight: "60vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                                {crashLogs.map((log) => (
                                    <div key={log.id} style={{ padding: 12, background: "rgba(239,68,68,0.06)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.15)" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: "#ef4444" }}>{log.message}</span>
                                            <span style={{ fontSize: 11, color: "#9ca3af" }}>{new Date(log.createdAt).toLocaleString()}</span>
                                        </div>
                                        <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#6b7280", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 200, overflow: "auto" }}>
                                            {log.stack}
                                        </pre>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="toolbar-actions toolbar-actions--end" style={{ marginTop: 16 }}>
                            <button type="button" className="ghost-button" onClick={() => setShowCrashLogModal(false)}>
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
