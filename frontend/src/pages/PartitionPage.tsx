import { useEffect, useState } from "react";
import type { TablePartitionResult, PartitionInfo } from "../types/runtime";
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

export function PartitionPage({ selectedConnection, selectedDatabase, selectedTable, pushToast }: PartitionPageProps) {
    const [partitionResult, setPartitionResult] = useState<TablePartitionResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);

    useEffect(() => {
        setPartitionResult(null);
        setNotice(null);
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
            const { GetTablePartitions } = await import("../../wailsjs/go/main/App");
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

    const totalRows = partitionResult?.partitions.reduce((sum, p) => sum + (p.rowCount || 0), 0) ?? 0;
    const totalDataSize = partitionResult?.partitions.reduce((sum, p) => sum + (p.dataSize || 0), 0) ?? 0;
    const totalIndexSize = partitionResult?.partitions.reduce((sum, p) => sum + (p.indexSize || 0), 0) ?? 0;

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
            ) : partitionResult?.supported && partitionResult.partitions.length === 0 ? (
                <div className="empty-block">当前表没有配置分区。</div>
            ) : partitionResult?.supported ? (
                <div className="schema-layout">
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

                    <div className="detail-card">
                        <div className="section-title">
                            <h3>分区明细</h3>
                        </div>
                        <div className="schema-table-shell">
                            <table className="schema-table">
                                <thead>
                                    <tr>
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
                                        <tr key={p.name}>
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
                </div>
            ) : null}
        </section>
    );
}
