import { useState } from "react";
import { CreateTable } from "../../wailsjs/go/main/App";
import { TypeCombobox } from "../components/TypeCombobox";
import type { SchemaFieldInput, SchemaIndexInput } from "../types/runtime";
import type { WorkbenchPage } from "../lib/constants";
import { browserGeneratedID, getFieldTypeOptions, getIndexTypeOptions } from "../lib/utils";

interface CreateTablePageProps {
    selectedConnection: { id: string; engine?: string } | null;
    selectedDatabase: string;
    pushToast: (tone: "success" | "error" | "info", title: string, message: string) => void;
    loadExplorer: (connectionId: string, preferredDatabase?: string) => Promise<void>;
    setActivePage: (v: WorkbenchPage) => void;
}

function emptyField(): SchemaFieldInput & { id: string } {
    return {
        id: browserGeneratedID(),
        name: "",
        type: "varchar(255)",
        nullable: true,
        defaultValue: "",
        comment: "",
        primary: false,
        autoIncrement: false,
    };
}

function emptyIndex(engine: string): SchemaIndexInput & { id: string } {
    const options = getIndexTypeOptions(engine);
    return {
        id: browserGeneratedID(),
        name: "",
        columns: [],
        unique: false,
        indexType: options.length > 0 ? options[0] : "",
    };
}

export function CreateTablePage({ selectedConnection, selectedDatabase, pushToast, loadExplorer, setActivePage }: CreateTablePageProps) {
    const [tableName, setTableName] = useState("");
    const [schemaName, setSchemaName] = useState("public");
    const [partitionBy, setPartitionBy] = useState("");
    const [primaryKeyExpr, setPrimaryKeyExpr] = useState("");
    const [orderByExpr, setOrderByExpr] = useState("");
    const [sampleByExpr, setSampleByExpr] = useState("");
    const [fields, setFields] = useState<(SchemaFieldInput & { id: string })[]>([emptyField()]);
    const [indexes, setIndexes] = useState<(SchemaIndexInput & { id: string })[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
    const fieldTypeOptions = getFieldTypeOptions(selectedConnection?.engine ?? "mysql", fields.map((field) => field.type));
    const supportsCreateTable = ["mysql", "mariadb", "postgresql", "sqlite", "clickhouse"].includes((selectedConnection?.engine ?? "mysql").toLowerCase());
    const engine = (selectedConnection?.engine ?? "mysql").toLowerCase();
    const isPostgreSQL = engine === "postgresql";
    const isClickHouse = engine === "clickhouse";

    function addField() {
        setFields((current) => [...current, emptyField()]);
    }

    function updateField(index: number, key: keyof SchemaFieldInput, value: unknown) {
        setFields((current) =>
            current.map((field, i) => {
                if (i !== index) {
                    if (key === "primary" && value === true) {
                        return { ...field, primary: false };
                    }
                    return field;
                }
                return { ...field, [key]: value };
            })
        );
    }

    function deleteField(index: number) {
        setFields((current) => current.filter((_, i) => i !== index));
    }

    function addIndex() {
        setIndexes((current) => [...current, emptyIndex(engine)]);
    }

    function updateIndex(index: number, key: keyof SchemaIndexInput, value: unknown) {
        setIndexes((current) =>
            current.map((idx, i) => (i === index ? { ...idx, [key]: value } : idx))
        );
    }

    function deleteIndex(index: number) {
        setIndexes((current) => current.filter((_, i) => i !== index));
    }

    async function handleCreateTable() {
        if (!selectedConnection || !selectedDatabase) {
            setNotice({ tone: "error", message: "请先选择连接和数据库。" });
            return;
        }
        if (!supportsCreateTable) {
            setNotice({ tone: "info", message: "当前引擎暂未接入可视化建表，请在查询页执行原生 DDL。" });
            return;
        }
        if (!tableName.trim()) {
            setNotice({ tone: "error", message: "表名不能为空。" });
            return;
        }
        const validFields = fields.filter((f) => f.name.trim() && f.type.trim());
        if (validFields.length === 0) {
            setNotice({ tone: "error", message: "至少需要一个有效字段。" });
            return;
        }

        try {
            setIsCreating(true);
            const result = (await CreateTable({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                schema: isPostgreSQL ? schemaName.trim() : "",
                tableName: tableName.trim(),
                partitionBy: isClickHouse ? partitionBy.trim() : "",
                primaryKey: isClickHouse ? primaryKeyExpr.trim() : "",
                orderBy: isClickHouse ? orderByExpr.trim() : "",
                sampleBy: isClickHouse ? sampleByExpr.trim() : "",
                fields: validFields.map(({ id, ...rest }) => rest),
                indexes: indexes
                    .filter((idx) => idx.name.trim() && idx.columns.length > 0)
                    .map(({ id, ...rest }) => rest),
            })) as { success: boolean; message: string };
            if (result.success) {
                pushToast("success", "创建成功", result.message);
                await loadExplorer(selectedConnection.id, selectedDatabase);
                setActivePage("query");
            } else {
                setNotice({ tone: "error", message: result.message });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "创建表失败";
            setNotice({ tone: "error", message });
        } finally {
            setIsCreating(false);
        }
    }

    return (
        <section className="page-panel page-panel--wide">
            <div className="page-headline">
                <div>
                    <h2>新建表</h2>
                    <p>{selectedDatabase ? `当前数据库：${selectedDatabase}` : "请先从左侧选择一个数据库。"}</p>
                    {!supportsCreateTable ? <p>当前引擎暂未提供可视化建表能力，建议在查询页执行原生 DDL。</p> : null}
                </div>
                <div className="toolbar-actions">
                    <button type="button" className="ghost-button" onClick={addField} disabled={!selectedDatabase || !supportsCreateTable}>
                        新增字段
                    </button>
                    <button type="button" className="ghost-button" onClick={addIndex} disabled={!selectedDatabase || !supportsCreateTable}>
                        新增索引
                    </button>
                    <button type="button" className="primary-button" onClick={handleCreateTable} disabled={isCreating || !selectedDatabase || !supportsCreateTable}>
                        {isCreating ? "创建中..." : "创建表"}
                    </button>
                </div>
            </div>

            {notice ? (
                <div className={`notice notice--${notice.tone}`}>
                    <span>{notice.message}</span>
                </div>
            ) : null}

            {!selectedDatabase ? (
                <div className="empty-block">请先从左侧选择一个数据库。</div>
            ) : (
                <div className="schema-layout">
                    <div className="detail-card schema-form-card">
                        <div className="section-title">
                            <div>
                                <h3>表名</h3>
                            </div>
                        </div>
                        <input
                            className="field-input"
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            placeholder="输入新表名"
                            style={{ marginBottom: 16 }}
                        />

                        {isPostgreSQL ? (
                            <input
                                className="field-input"
                                value={schemaName}
                                onChange={(e) => setSchemaName(e.target.value)}
                                placeholder="Schema，默认 public"
                                style={{ marginBottom: 16 }}
                            />
                        ) : null}

                        {isClickHouse ? (
                            <div className="field-grid" style={{ marginBottom: 16 }}>
                                <label className="field field--full">
                                    <span>PARTITION BY</span>
                                    <input value={partitionBy} onChange={(e) => setPartitionBy(e.target.value)} placeholder="如 toYYYYMM(created_at)" />
                                </label>
                                <label className="field field--half">
                                    <span>PRIMARY KEY</span>
                                    <input value={primaryKeyExpr} onChange={(e) => setPrimaryKeyExpr(e.target.value)} placeholder="如 (id, created_at)" />
                                </label>
                                <label className="field field--half">
                                    <span>ORDER BY</span>
                                    <input value={orderByExpr} onChange={(e) => setOrderByExpr(e.target.value)} placeholder="如 (id, created_at)" />
                                </label>
                                <label className="field field--full">
                                    <span>SAMPLE BY</span>
                                    <input value={sampleByExpr} onChange={(e) => setSampleByExpr(e.target.value)} placeholder="可选，如 id" />
                                </label>
                            </div>
                        ) : null}

                        <div className="section-title">
                            <div>
                                <h3>字段结构</h3>
                            </div>
                        </div>
                        <div className="schema-table-shell">
                            <table className="schema-table">
                                <thead>
                                    <tr>
                                        <th>字段名</th>
                                        <th>类型</th>
                                        <th>可空</th>
                                        <th>默认值</th>
                                        <th>主键</th>
                                        <th>自增</th>
                                        <th>注释</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fields.map((field, index) => (
                                        <tr key={field.id}>
                                            <td>
                                                <input
                                                    value={field.name}
                                                    onChange={(e) => updateField(index, "name", e.target.value)}
                                                    placeholder="字段名"
                                                />
                                            </td>
                                            <td>
                                                <TypeCombobox
                                                    options={fieldTypeOptions}
                                                    value={field.type}
                                                    onChange={(value) => updateField(index, "type", value)}
                                                />
                                            </td>
                                            <td>
                                                <label className="checkbox-cell">
                                                    <input type="checkbox" checked={field.nullable} onChange={(e) => updateField(index, "nullable", e.target.checked)} />
                                                </label>
                                            </td>
                                            <td>
                                                <input value={field.defaultValue} onChange={(e) => updateField(index, "defaultValue", e.target.value)} placeholder="默认值" />
                                            </td>
                                            <td>
                                                <label className="checkbox-cell">
                                                    <input type="checkbox" checked={field.primary} onChange={(e) => updateField(index, "primary", e.target.checked)} />
                                                </label>
                                            </td>
                                            <td>
                                                <label className="checkbox-cell">
                                                    <input type="checkbox" checked={field.autoIncrement} onChange={(e) => updateField(index, "autoIncrement", e.target.checked)} />
                                                </label>
                                            </td>
                                            <td>
                                                <input value={field.comment} onChange={(e) => updateField(index, "comment", e.target.value)} placeholder="注释" />
                                            </td>
                                            <td>
                                                <button type="button" className="icon-btn icon-btn--delete" title="删除字段" onClick={() => deleteField(index)}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="section-title" style={{ marginTop: 24 }}>
                            <div>
                                <h3>索引</h3>
                            </div>
                        </div>
                        <div className="schema-table-shell">
                            <table className="schema-table">
                                <thead>
                                    <tr>
                                        <th>索引名</th>
                                        <th>字段（逗号分隔）</th>
                                        <th>唯一</th>
                                        {getIndexTypeOptions(engine).length > 0 ? <th>类型</th> : null}
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {indexes.length === 0 ? (
                                        <tr>
                                            <td colSpan={getIndexTypeOptions(engine).length > 0 ? 5 : 4} style={{ textAlign: "center", color: "#999" }}>暂无索引，点击上方「新增索引」添加</td>
                                        </tr>
                                    ) : (
                                        indexes.map((idx, index) => (
                                            <tr key={idx.id}>
                                                <td>
                                                    <input
                                                        value={idx.name}
                                                        onChange={(e) => updateIndex(index, "name", e.target.value)}
                                                        placeholder="索引名"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        value={idx.columns.join(",")}
                                                        onChange={(e) => updateIndex(index, "columns", e.target.value.split(",").map((c) => c.trim()).filter(Boolean))}
                                                        placeholder="字段1,字段2"
                                                    />
                                                </td>
                                                <td>
                                                    <label className="checkbox-cell">
                                                        <input type="checkbox" checked={idx.unique} onChange={(e) => updateIndex(index, "unique", e.target.checked)} />
                                                    </label>
                                                </td>
                                                {getIndexTypeOptions(engine).length > 0 ? (
                                                    <td>
                                                        <select
                                                            value={idx.indexType}
                                                            onChange={(e) => updateIndex(index, "indexType", e.target.value)}
                                                        >
                                                            {getIndexTypeOptions(engine).map((type) => (
                                                                <option key={type} value={type}>
                                                                    {type}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                ) : null}
                                                <td>
                                                    <button type="button" className="icon-btn icon-btn--delete" title="删除索引" onClick={() => deleteIndex(index)}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="3 6 5 6 21 6"></polyline>
                                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
