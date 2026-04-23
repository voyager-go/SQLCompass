import { useEffect, useState } from "react";
import type { TablePartitionResult, PartitionInfo, BuildPartitionDDLResult } from "../types/runtime";
import { GetTablePartitions, BuildPartitionDDL, ExecutePartitionAction } from "../../wailsjs/go/main/App";
import { NoticeBanner } from "../components/NoticeBanner";

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

interface PartitionPageProps {
    selectedConnection: { id: string; engine: string } | null;
    selectedDatabase: string;
    selectedTable: string;
    pushToast: (tone: "success" | "error" | "info", title: string, message: string) => void;
}

type Notice = { tone: "success" | "error" | "info"; message: string };
type DialogMode = "add" | "drop" | "truncate" | null;

export function PartitionPage({ selectedConnection, selectedDatabase, selectedTable, pushToast }: PartitionPageProps) {
    const [partitionResult, setPartitionResult] = useState<TablePartitionResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [dialogMode, setDialogMode] = useState<DialogMode>(null);
    const [partitionClause, setPartitionClause] = useState("");
    const [selectedPartitions, setSelectedPartitions] = useState<Set<string>>(new Set());
    const [previewSQL, setPreviewSQL] = useState("");
    const [previewing, setPreviewing] = useState(false);
    const [executing, setExecuting] = useState(false);

    const engine = (selectedConnection?.engine ?? "").toLowerCase();
    const isClickHouse = engine === "clickhouse";
    const isMySQL = engine === "mysql" || engine === "mariadb";
    const isPostgreSQL = engine === "postgresql";

    useEffect(() => {
        setPartitionResult(null);
        setNotice(null);
        closeDialog();
        if (!selectedConnection || !selectedDatabase || !selectedTable) {
            return;
        }
        loadPartitions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedConnection?.id, selectedDatabase, selectedTable]);

    async function loadPartitions() {
        if (!selectedConnection || !selectedDatabase || !selectedTable) return;
        setLoading(true);
        try {
            const result = (await GetTablePartitions({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                table: selectedTable,
            })) as TablePartitionResult;
            setPartitionResult(result);
            if (!result.supported) {
                setNotice({ tone: "info", message: result.message });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "加载分区信息失败";
            setNotice({ tone: "error", message });
        } finally {
            setLoading(false);
        }
    }

    function closeDialog() {
        setDialogMode(null);
        setPartitionClause("");
        setSelectedPartitions(new Set());
        setPreviewSQL("");
        setPreviewing(false);
    }

    function openAddDialog() {
        closeDialog();
        setDialogMode("add");
        // Provide a template hint
        if (isMySQL) {
            setPartitionClause("PARTITION p_name VALUES LESS THAN ('value')");
        } else if (isPostgreSQL) {
            setPartitionClause("p_name FOR VALUES FROM ('start') TO ('end')");
        }
    }

    function openDropDialog() {
        if (selectedPartitions.size === 0) {
            setNotice({ tone: "info", message: "请先勾选要删除的分区" });
            return;
        }
        closeDialog();
        setDialogMode("drop");
    }

    function openTruncateDialog() {
        if (selectedPartitions.size === 0) {
            setNotice({ tone: "info", message: "请先勾选要截断的分区" });
            return;
        }
        closeDialog();
        setDialogMode("truncate");
    }

    function togglePartition(name: string) {
        setSelectedPartitions((prev) => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    }

    function toggleAll() {
        if (!partitionResult) return;
        if (selectedPartitions.size === partitionResult.partitions.length) {
            setSelectedPartitions(new Set());
        } else {
            setSelectedPartitions(new Set(partitionResult.partitions.map((p) => p.name)));
        }
    }

    async function previewAction() {
        if (!selectedConnection || !selectedDatabase || !selectedTable) return;
        setPreviewing(true);
        try {
            const result = (await BuildPartitionDDL({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                table: selectedTable,
                action: dialogMode,
                partitionClause,
                partitionNames: Array.from(selectedPartitions).join(", "),
            })) as BuildPartitionDDLResult;
            setPreviewSQL(result.sql);
        } catch (error) {
            const message = error instanceof Error ? error.message : "预览SQL失败";
            setNotice({ tone: "error", message });
        } finally {
            setPreviewing(false);
        }
    }

    async function executeAction() {
        if (!selectedConnection || !selectedDatabase || !selectedTable) return;
        const actionLabel = dialogMode === "add" ? "添加" : dialogMode === "drop" ? "删除" : "截断";
        if (!confirm(`确认${actionLabel}分区？此操作不可撤销。`)) return;
        setExecuting(true);
        try {
            const result = (await ExecutePartitionAction({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                table: selectedTable,
                action: dialogMode,
                partitionClause,
                partitionNames: Array.from(selectedPartitions).join(", "),
            })) as { success: boolean; message: string; sql: string };
            if (result.success) {
                pushToast("success", "操作成功", result.message);
                closeDialog();
                await loadPartitions();
            } else {
                setNotice({ tone: "error", message: result.message });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "操作失败";
            setNotice({ tone: "error", message });
        } finally {
            setExecuting(false);
        }
    }

    const totalRows = partitionResult?.partitions.reduce((sum, p) => sum + (p.rowCount || 0), 0) ?? 0;
    const totalDataSize = partitionResult?.partitions.reduce((sum, p) => sum + (p.dataSize || 0), 0) ?? 0;
    const totalIndexSize = partitionResult?.partitions.reduce((sum, p) => sum + (p.indexSize || 0), 0) ?? 0;
    const canOperate = isMySQL || isPostgreSQL || isClickHouse;

    // Partition add hints based on engine
    function getAddHint(): string {
        if (isMySQL) {
            return `RANGE: PARTITION p202505 VALUES LESS THAN ('2025-06-01')\nLIST: PARTITION p_east VALUES IN ('NY','CA')\n完整: PARTITION BY RANGE COLUMNS(created_at) (\n  PARTITION p202504 VALUES LESS THAN ('2025-05-01'),\n  PARTITION p202505 VALUES LESS THAN ('2025-06-01')\n)`;
        }
        if (isPostgreSQL) {
            return `RANGE: p202505 FOR VALUES FROM ('2025-05-01') TO ('2025-06-01')\nLIST: p_east FOR VALUES IN ('NY','CA')`;
        }
        if (isClickHouse) {
            return "ClickHouse 分区由 INSERT 自动创建，无需手动添加";
        }
        return "";
    }

    return (
        <section className="page-panel page-panel--wide">
            <div className="page-headline">
                <div>
                    <h2>分区管理</h2>
                    <p>
                        {selectedTable
                            ? `当前表：${selectedDatabase}.${selectedTable}`
                            : "请先从左侧点击某张表，再进入这里查看分区信息。"}
                    </p>
                </div>
                <div className="toolbar-actions">
                    {canOperate && partitionResult?.supported && (
                        <>
                            {!isClickHouse && (
                                <button type="button" className="ghost-button" onClick={openAddDialog} disabled={loading || !selectedTable}>
                                    + 新增分区
                                </button>
                            )}
                            <button
                                type="button"
                                className="ghost-button"
                                onClick={openDropDialog}
                                disabled={loading || !selectedTable || selectedPartitions.size === 0}
                                style={selectedPartitions.size > 0 ? { color: "var(--danger)" } : undefined}
                            >
                                删除分区
                            </button>
                            <button
                                type="button"
                                className="ghost-button"
                                onClick={openTruncateDialog}
                                disabled={loading || !selectedTable || selectedPartitions.size === 0}
                            >
                                截断分区
                            </button>
                        </>
                    )}
                    <button type="button" className="ghost-button" onClick={loadPartitions} disabled={loading || !selectedTable}>
                        {loading ? "刷新中..." : "刷新"}
                    </button>
                </div>
            </div>

            <NoticeBanner notice={notice} />

            {!selectedTable ? (
                <div className="empty-block">左侧点开数据库后，单击某张表先查看数据；需要查看分区信息时再切到这里。</div>
            ) : loading ? (
                <div className="empty-block">正在加载分区信息...</div>
            ) : partitionResult?.supported && partitionResult.partitions.length === 0 && !dialogMode ? (
                <div className="empty-block">
                    <p>当前表没有配置分区。</p>
                    {canOperate && !isClickHouse && (
                        <button type="button" className="ghost-button" style={{ marginTop: 12 }} onClick={openAddDialog}>
                            + 新增分区
                        </button>
                    )}
                </div>
            ) : partitionResult?.supported ? (
                <div className="schema-layout">
                    {/* Summary */}
                    <div className="detail-card" style={{ marginBottom: 16 }}>
                        <div className="section-title">
                            <h3>分区概览</h3>
                        </div>
                        <div className="partition-summary-grid">
                            <div className="partition-stat">
                                <span className="partition-stat__label">分区数量</span>
                                <span className="partition-stat__value">{partitionResult.partitions.length}</span>
                            </div>
                            <div className="partition-stat">
                                <span className="partition-stat__label">总数据行数</span>
                                <span className="partition-stat__value">{totalRows.toLocaleString()}</span>
                            </div>
                            <div className="partition-stat">
                                <span className="partition-stat__label">分区键</span>
                                <span className="partition-stat__value" title={partitionResult.partitionKey}>
                                    {partitionResult.partitionKey || "—"}
                                </span>
                            </div>
                            <div className="partition-stat">
                                <span className="partition-stat__label">数据总大小</span>
                                <span className="partition-stat__value">{formatBytes(totalDataSize)}</span>
                            </div>
                            <div className="partition-stat">
                                <span className="partition-stat__label">索引总大小</span>
                                <span className="partition-stat__value">{formatBytes(totalIndexSize)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Partition Detail Table */}
                    <div className="detail-card">
                        <div className="section-title">
                            <h3>分区明细</h3>
                            {selectedPartitions.size > 0 && (
                                <span className="partition-selected-count">
                                    已选 {selectedPartitions.size} 个分区
                                </span>
                            )}
                        </div>
                        <div className="schema-table-shell">
                            <table className="schema-table">
                                <thead>
                                    <tr>
                                        {canOperate && (
                                            <th style={{ width: 36 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPartitions.size === partitionResult.partitions.length && partitionResult.partitions.length > 0}
                                                    onChange={toggleAll}
                                                />
                                            </th>
                                        )}
                                        <th>分区名称</th>
                                        <th>分区方式</th>
                                        <th>分区表达式</th>
                                        <th>分区描述</th>
                                        <th>数据行数</th>
                                        <th>数据大小</th>
                                        <th>索引大小</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {partitionResult.partitions.map((p: PartitionInfo) => (
                                        <tr key={p.name} className={selectedPartitions.has(p.name) ? "partition-row--selected" : ""}>
                                            {canOperate && (
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedPartitions.has(p.name)}
                                                        onChange={() => togglePartition(p.name)}
                                                    />
                                                </td>
                                            )}
                                            <td>{p.name}</td>
                                            <td>{p.method || "—"}</td>
                                            <td title={p.expression}>{p.expression || "—"}</td>
                                            <td title={p.description}>{p.description || "—"}</td>
                                            <td>{(p.rowCount ?? 0).toLocaleString()}</td>
                                            <td>{formatBytes(p.dataSize ?? 0)}</td>
                                            <td>{formatBytes(p.indexSize ?? 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Operation Dialog */}
                    {dialogMode && (
                        <div className="detail-card partition-dialog" style={{ marginTop: 16 }}>
                            <div className="section-title">
                                <h3>
                                    {dialogMode === "add" && "新增分区"}
                                    {dialogMode === "drop" && `删除分区 (${selectedPartitions.size} 个)`}
                                    {dialogMode === "truncate" && `截断分区 (${selectedPartitions.size} 个)`}
                                </h3>
                                <button type="button" className="ghost-button" onClick={closeDialog}>取消</button>
                            </div>

                            {dialogMode === "add" && (
                                <div style={{ marginBottom: 12 }}>
                                    <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                                        分区定义
                                    </label>
                                    <textarea
                                        className="partition-textarea"
                                        value={partitionClause}
                                        onChange={(e) => setPartitionClause(e.target.value)}
                                        placeholder={getAddHint().split("\n")[0]}
                                        rows={4}
                                    />
                                    <div className="partition-hint">
                                        <strong>示例：</strong>
                                        <pre>{getAddHint()}</pre>
                                    </div>
                                </div>
                            )}

                            {dialogMode === "drop" && (
                                <div style={{ marginBottom: 12 }}>
                                    <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 8 }}>
                                        即将删除以下分区及其所有数据，此操作不可撤销：
                                    </p>
                                    <div className="partition-tag-list">
                                        {Array.from(selectedPartitions).map((name) => (
                                            <span key={name} className="partition-tag">{name}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {dialogMode === "truncate" && (
                                <div style={{ marginBottom: 12 }}>
                                    <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 8 }}>
                                        即将清空以下分区的所有数据，表结构保留，此操作不可撤销：
                                    </p>
                                    <div className="partition-tag-list">
                                        {Array.from(selectedPartitions).map((name) => (
                                            <span key={name} className="partition-tag">{name}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="partition-dialog-actions">
                                <button
                                    type="button"
                                    className="ghost-button"
                                    onClick={previewAction}
                                    disabled={previewing || (dialogMode === "add" && !partitionClause.trim())}
                                >
                                    {previewing ? "预览中..." : "预览 SQL"}
                                </button>
                                <button
                                    type="button"
                                    className="primary-button"
                                    onClick={executeAction}
                                    disabled={executing || (dialogMode === "add" && !partitionClause.trim()) || (dialogMode !== "add" && previewSQL === "" && !previewing)}
                                    style={dialogMode === "drop" ? { background: "var(--danger)" } : undefined}
                                >
                                    {executing ? "执行中..." : dialogMode === "drop" ? "确认删除" : dialogMode === "truncate" ? "确认截断" : "执行添加"}
                                </button>
                            </div>

                            {previewSQL && (
                                <div style={{ marginTop: 12 }}>
                                    <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                                        将执行的 SQL
                                    </label>
                                    <pre className="partition-sql-preview">{previewSQL}</pre>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : null}
        </section>
    );
}
