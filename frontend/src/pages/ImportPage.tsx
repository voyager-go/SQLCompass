import { useState, useCallback } from "react";
import { SelectImportFile, PreviewImport, ImportFile } from "../../wailsjs/go/main/App";
import type { ImportPreviewResult, ImportResult } from "../types/runtime";

type NoticeTone = "success" | "error" | "info";

interface ImportPageProps {
    selectedConnection: { id: string; engine: string } | null;
    selectedDatabase: string;
    selectedTable: string;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
}

export function ImportPage({ selectedConnection, selectedDatabase, selectedTable, pushToast }: ImportPageProps) {
    const [filePath, setFilePath] = useState("");
    const [format, setFormat] = useState<"csv" | "sql">("csv");
    const [delimiter, setDelimiter] = useState(",");
    const [hasHeader, setHasHeader] = useState(true);
    const [encoding, setEncoding] = useState("utf-8");
    const [mode, setMode] = useState<"insert" | "truncate_insert" | "upsert">("insert");
    const [targetTable, setTargetTable] = useState("");
    const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);

    const handleSelectFile = useCallback(async () => {
        try {
            const path = await SelectImportFile();
            if (path) {
                setFilePath(path);
                setPreview(null);
                setImportResult(null);
            }
        } catch (err) {
            pushToast("error", "选择文件失败", err instanceof Error ? err.message : "未知错误");
        }
    }, [pushToast]);

    const handlePreview = useCallback(async () => {
        if (!filePath) {
            pushToast("error", "未选择文件", "请先选择要导入的文件");
            return;
        }
        setLoading(true);
        setPreview(null);
        setImportResult(null);
        try {
            const res = (await PreviewImport({
                filePath,
                format,
                delimiter,
                hasHeader,
                encoding,
                limit: 20,
            })) as ImportPreviewResult;
            setPreview(res);
        } catch (err) {
            pushToast("error", "预览失败", err instanceof Error ? err.message : "未知错误");
        } finally {
            setLoading(false);
        }
    }, [filePath, format, delimiter, hasHeader, encoding, pushToast]);

    const handleImport = useCallback(async () => {
        if (!selectedConnection) {
            pushToast("error", "未选择连接", "请先选择一个数据库连接");
            return;
        }
        if (!filePath) {
            pushToast("error", "未选择文件", "请先选择要导入的文件");
            return;
        }
        const table = targetTable || selectedTable;
        if (!table) {
            pushToast("error", "未指定表", "请输入或选择目标表");
            return;
        }
        setImporting(true);
        setImportResult(null);
        try {
            const res = (await ImportFile({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                table,
                filePath,
                format,
                delimiter,
                hasHeader,
                encoding,
                mode,
            })) as ImportResult;
            setImportResult(res);
            if (res.success) {
                pushToast("success", "导入完成", res.message);
            } else {
                pushToast("error", "导入失败", res.message);
            }
        } catch (err) {
            pushToast("error", "导入失败", err instanceof Error ? err.message : "未知错误");
        } finally {
            setImporting(false);
        }
    }, [selectedConnection, selectedDatabase, selectedTable, targetTable, filePath, format, delimiter, hasHeader, encoding, mode, pushToast]);

    return (
        <section className="page-panel">
            <div className="page-headline">
                <div>
                    <h2>数据导入</h2>
                    <p>CSV / SQL 文件导入到数据库表</p>
                </div>
            </div>

            <div className="import-form detail-card">
                <div className="section-title">
                    <div>
                        <h3>导入配置</h3>
                        <p>选择文件并配置导入参数</p>
                    </div>
                </div>

                <div className="form-grid">
                    <div className="field field--full">
                        <span>文件路径</span>
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                type="text"
                                value={filePath}
                                readOnly
                                placeholder="点击选择文件..."
                                style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--border-soft)", borderRadius: 9, background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13.5 }}
                            />
                            <button type="button" className="ghost-button" onClick={handleSelectFile}>
                                选择文件
                            </button>
                        </div>
                    </div>

                    <div className="field">
                        <span>文件格式</span>
                        <select value={format} onChange={(e) => setFormat(e.target.value as "csv" | "sql")} style={{ padding: "9px 12px", border: "1px solid var(--border-soft)", borderRadius: 9, background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13.5 }}>
                            <option value="csv">CSV</option>
                            <option value="sql">SQL</option>
                        </select>
                    </div>

                    <div className="field">
                        <span>导入模式</span>
                        <select value={mode} onChange={(e) => setMode(e.target.value as "insert" | "truncate_insert" | "upsert")} style={{ padding: "9px 12px", border: "1px solid var(--border-soft)", borderRadius: 9, background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13.5 }}>
                            <option value="insert">INSERT</option>
                            <option value="truncate_insert">TRUNCATE + INSERT</option>
                            <option value="upsert">UPSERT (INSERT ON DUPLICATE)</option>
                        </select>
                    </div>

                    {format === "csv" ? (
                        <>
                            <div className="field">
                                <span>分隔符</span>
                                <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)} style={{ padding: "9px 12px", border: "1px solid var(--border-soft)", borderRadius: 9, background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13.5 }}>
                                    <option value=",">逗号 (,)</option>
                                    <option value="	">制表符 (Tab)</option>
                                    <option value=";">分号 (;)</option>
                                    <option value="|">竖线 (|)</option>
                                </select>
                            </div>
                            <div className="field">
                                <span>编码</span>
                                <select value={encoding} onChange={(e) => setEncoding(e.target.value)} style={{ padding: "9px 12px", border: "1px solid var(--border-soft)", borderRadius: 9, background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13.5 }}>
                                    <option value="utf-8">UTF-8</option>
                                    <option value="gbk">GBK</option>
                                    <option value="latin1">Latin1</option>
                                </select>
                            </div>
                            <div className="field">
                                <span>包含表头</span>
                                <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", color: "var(--text-primary)", fontSize: 13.5 }}>
                                    <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                                    首行作为列名
                                </label>
                            </div>
                        </>
                    ) : null}

                    <div className="field">
                        <span>目标表</span>
                        <input
                            type="text"
                            value={targetTable || selectedTable}
                            onChange={(e) => setTargetTable(e.target.value)}
                            placeholder="输入目标表名"
                            style={{ padding: "9px 12px", border: "1px solid var(--border-soft)", borderRadius: 9, background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13.5, width: "100%" }}
                        />
                    </div>
                </div>

                <div className="toolbar-actions toolbar-actions--end" style={{ marginTop: 18 }}>
                    <button type="button" className="ghost-button" onClick={handlePreview} disabled={!filePath || loading}>
                        {loading ? "预览中..." : "预览数据"}
                    </button>
                    <button type="button" className="primary-button" onClick={handleImport} disabled={!filePath || importing || !selectedConnection}>
                        {importing ? "导入中..." : "执行导入"}
                    </button>
                </div>
            </div>

            {preview ? (
                <div className="detail-card" style={{ marginTop: 20 }}>
                    <div className="section-title">
                        <div>
                            <h3>数据预览</h3>
                            <p>共 {preview.total} 行，预览前 {preview.rows.length} 行</p>
                        </div>
                    </div>
                    {preview.columns.length > 0 ? (
                        <div className="schema-table-shell">
                            <table className="schema-table">
                                <thead>
                                    <tr>
                                        {preview.columns.map((col) => (
                                            <th key={col}>{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.rows.map((row, idx) => (
                                        <tr key={idx}>
                                            {preview.columns.map((col) => (
                                                <td key={col} title={row[col] ?? ""}>
                                                    <div className="result-cell">{row[col] ?? ""}</div>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-block">预览数据为空</div>
                    )}
                </div>
            ) : null}

            {importResult ? (
                <div className={`detail-card${importResult.success ? "" : ""}`} style={{ marginTop: 20 }}>
                    <div className="section-title">
                        <div>
                            <h3>导入结果</h3>
                            <p>{importResult.message}</p>
                        </div>
                    </div>
                    <div className="summary-list">
                        <div className="summary-item">
                            <span>插入行数</span>
                            <strong>{importResult.insertedRows}</strong>
                        </div>
                        <div className="summary-item">
                            <span>跳过行数</span>
                            <strong>{importResult.skippedRows}</strong>
                        </div>
                        <div className="summary-item">
                            <span>状态</span>
                            <strong style={{ color: importResult.success ? "#059669" : "#dc2626" }}>
                                {importResult.success ? "成功" : "失败"}
                            </strong>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
