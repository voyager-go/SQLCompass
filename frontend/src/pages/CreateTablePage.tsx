import { useState, useEffect, useRef, useCallback } from "react";
import { CreateTable, GenerateFieldComment, GenerateIndexName, SuggestPartition } from "../../wailsjs/go/main/App";
import { createPortal } from "react-dom";
import type { SchemaFieldInput, SchemaIndexInput } from "../types/runtime";
import type { WorkbenchPage } from "../lib/constants";
import { TypeCombobox } from "../components/TypeCombobox";
import { browserGeneratedID, getFieldTypeOptions, getIndexTypeOptions, isIntegerType, isTimestampType } from "../lib/utils";

type PartitionSuggestion = {
    partitionddl: string;
    suggestion: string;
    warnings: string[];
};

interface CreateTablePageProps {
    selectedConnection: { id: string; engine?: string } | null;
    selectedDatabase: string;
    pushToast: (tone: "success" | "error" | "info", title: string, message: string) => void;
    loadExplorer: (connectionId: string, preferredDatabase?: string) => Promise<void>;
    setActivePage: (v: WorkbenchPage) => void;
    aiConfigured: boolean;
}

type FieldWithAI = SchemaFieldInput & { id: string; aiLoading: boolean };
type IndexWithAI = SchemaIndexInput & { id: string; aiLoading: boolean };

function emptyField(): FieldWithAI {
    return {
        id: browserGeneratedID(),
        name: "",
        type: "",
        nullable: false,
        defaultValue: "",
        comment: "",
        primary: false,
        autoIncrement: false,
        unsigned: false,
        onUpdate: "",
        aiLoading: false,
    };
}

function emptyIndex(engine: string): IndexWithAI {
    const options = getIndexTypeOptions(engine);
    return {
        id: browserGeneratedID(),
        name: "",
        columns: [],
        unique: false,
        indexType: options.length > 0 ? options[0] : "",
        aiLoading: false,
    };
}

/* ── MultiSelectCombobox ── */
interface MultiSelectProps {
    options: string[];
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
}

function MultiSelectCombobox({ options, value, onChange, placeholder }: MultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const filtered = options.filter(
        (opt) => opt.toLowerCase().includes(inputValue.toLowerCase()) && !value.includes(opt),
    );

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    /* Sync dropdown position when opening */
    useEffect(() => {
        if (open && wrapRef.current) {
            const rect = wrapRef.current.getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + window.scrollY + 2,
                left: rect.left + window.scrollX,
                width: rect.width,
            });
        } else {
            setDropdownPos(null);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function update() {
            if (wrapRef.current) {
                const rect = wrapRef.current.getBoundingClientRect();
                setDropdownPos({
                    top: rect.bottom + window.scrollY + 2,
                    left: rect.left + window.scrollX,
                    width: rect.width,
                });
            }
        }
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [open]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (open && filtered[activeIndex]) {
                    onChange([...value, filtered[activeIndex]]);
                    setInputValue("");
                    setActiveIndex(0);
                    setOpen(true);
                }
            } else if (e.key === "Escape") {
                setOpen(false);
            }
        },
        [open, filtered, activeIndex, value, onChange],
    );

    function removeItem(item: string) {
        onChange(value.filter((v) => v !== item));
    }

    const dropdownEl =
        open && filtered.length > 0 && dropdownPos ? (
            <div
                className="combobox-dropdown combobox-dropdown--portal"
                style={{ position: "absolute", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
            >
                {filtered.map((opt, idx) => (
                    <div
                        key={opt}
                        className={`combobox-option${idx === activeIndex ? " combobox-option--active" : ""}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            onChange([...value, opt]);
                            setInputValue("");
                            setActiveIndex(0);
                        }}
                    >
                        {opt}
                    </div>
                ))}
            </div>
        ) : null;

    return (
        <>
            <div className="combobox-wrap combobox-wrap--multi" ref={wrapRef}>
                <div className="multiselect-input" onClick={() => inputRef.current?.focus()}>
                    {value.length > 0 ? (
                        value.map((item) => (
                            <span key={item} className="multiselect-tag">
                                {item}
                                <button type="button" onClick={(e) => { e.stopPropagation(); removeItem(item); }}>&times;</button>
                            </span>
                        ))
                    ) : null}
                    <input
                        ref={inputRef}
                        value={inputValue}
                        placeholder={value.length > 0 ? "" : (placeholder ?? "选择字段")}
                        onFocus={() => { setOpen(true); setActiveIndex(0); }}
                        onChange={(e) => { setInputValue(e.target.value); setOpen(true); setActiveIndex(0); }}
                        onKeyDown={handleKeyDown}
                    />
                </div>
            </div>
            {dropdownEl ? createPortal(dropdownEl, document.body) : null}
        </>
    );
}

export function CreateTablePage({ selectedConnection, selectedDatabase, pushToast, loadExplorer, setActivePage, aiConfigured }: CreateTablePageProps) {
    const [tableName, setTableName] = useState("");
    const [schemaName, setSchemaName] = useState("public");
    const [partitionBy, setPartitionBy] = useState("");
    const [primaryKeyExpr, setPrimaryKeyExpr] = useState("");
    const [orderByExpr, setOrderByExpr] = useState("");
    const [sampleByExpr, setSampleByExpr] = useState("");
    const [fields, setFields] = useState<FieldWithAI[]>([emptyField()]);
    const [indexes, setIndexes] = useState<IndexWithAI[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

    // AI 分区建议相关状态
    const [partitionSuggestion, setPartitionSuggestion] = useState<PartitionSuggestion | null>(null);
    const [isSuggestingPartition, setIsSuggestingPartition] = useState(false);
    const fieldTypeOptions = getFieldTypeOptions(selectedConnection?.engine ?? "mysql", fields.map((f) => f.type));
    const supportsCreateTable = ["mysql", "mariadb", "postgresql", "sqlite", "clickhouse"].includes((selectedConnection?.engine ?? "mysql").toLowerCase());
    const engine = (selectedConnection?.engine ?? "mysql").toLowerCase();
    const isPostgreSQL = engine === "postgresql";
    const isClickHouse = engine === "clickhouse";
    const isMySQL = engine === "mysql" || engine === "mariadb";
    const supportsPartition = isClickHouse || isMySQL;

    // 字段名列表供索引多选用
    const fieldNames = fields.map((f) => f.name).filter(Boolean);

    function addField(afterIndex?: number) {
        setFields((current) => {
            const newField = emptyField();
            if (afterIndex !== undefined && afterIndex >= 0) {
                const next = [...current];
                next.splice(afterIndex + 1, 0, newField);
                return next;
            }
            return [...current, newField];
        });
    }

    function updateField(index: number, key: keyof SchemaFieldInput, value: unknown) {
        setFields((current) =>
            current.map((field, i) => {
                if (i !== index) {
                    if (key === "primary" && value === true) return { ...field, primary: false };
                    return field;
                }
                return { ...field, [key]: value };
            }),
        );
    }

    function deleteField(index: number) {
        setFields((current) => current.filter((_, i) => i !== index));
    }

    async function handleGenerateFieldComment(index: number) {
        const field = fields[index];
        if (!field?.name.trim() || !aiConfigured) return;

        try {
            setFields((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, aiLoading: true } : item,
                ),
            );
            const result = (await GenerateFieldComment({ fieldName: field.name })) as { comment: string };
            setFields((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, comment: result.comment, aiLoading: false } : item,
                ),
            );
        } catch {
            setNotice({ tone: "error", message: "AI 生成字段注释失败" });
            setFields((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, aiLoading: false } : item,
                ),
            );
        }
    }

    async function handleGenerateIndexComment(index: number) {
        const idx = indexes[index];
        if (!idx || idx.columns.length === 0 || !aiConfigured) return;

        try {
            setIndexes((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, aiLoading: true } : item,
                ),
            );
            const result = (await GenerateIndexName({
                tableName: tableName.trim() || "new_table",
                columns: idx.columns.join(","),
            })) as { name: string };
            setIndexes((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, name: result.name, aiLoading: false } : item,
                ),
            );
        } catch {
            setNotice({ tone: "error", message: "AI 生成索引名失败" });
            setIndexes((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, aiLoading: false } : item,
                ),
            );
        }
    }

    async function handleAISuggestPartition() {
        if (!aiConfigured || isSuggestingPartition) return;
        const validFields = fields.filter((f) => f.name.trim() && f.type.trim());
        if (validFields.length === 0) {
            setNotice({ tone: "error", message: "请先添加字段再使用 AI 分区建议" });
            return;
        }

        setIsSuggestingPartition(true);
        try {
            const result = (await SuggestPartition({
                engine: engine,
                tableName: tableName.trim() || "new_table",
                fields: validFields.map(({ id, aiLoading, ...rest }) => rest),
                indexes: indexes
                    .filter((idx) => idx.name.trim() && idx.columns.length > 0)
                    .map(({ id, aiLoading, ...rest }) => rest),
            })) as PartitionSuggestion;
            setPartitionSuggestion(result);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "AI 分区建议失败";
            setNotice({ tone: "error", message: msg });
        } finally {
            setIsSuggestingPartition(false);
        }
    }

    function confirmPartitionSuggestion() {
        if (partitionSuggestion) {
            setPartitionBy(partitionSuggestion.partitionddl);
            setPartitionSuggestion(null);
        }
    }

    function addIndex() {
        setIndexes((current) => [...current, emptyIndex(engine)]);
    }

    function updateIndex(index: number, key: keyof SchemaIndexInput, value: unknown) {
        setIndexes((current) =>
            current.map((idx, i) => (i === index ? { ...idx, [key]: value } : idx)),
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
        const invalidTypeFields = fields.filter((f) => f.name.trim() && !f.type.trim());
        if (invalidTypeFields.length > 0) {
            setNotice({ tone: "error", message: `字段「${invalidTypeFields.map(f => f.name).join("、")}」未选择类型。` });
            return;
        }
        const validFields = fields.filter((f) => f.name.trim() && f.type.trim());
        if (validFields.length === 0) {
            setNotice({ tone: "error", message: "至少需要一个有效字段（需填写字段名和选择类型）。" });
            return;
        }

        try {
            setIsCreating(true);
            const result = (await CreateTable({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                schema: isPostgreSQL ? schemaName.trim() : "",
                tableName: tableName.trim(),
                partitionBy: supportsPartition ? partitionBy.trim() : "",
                primaryKey: isClickHouse ? primaryKeyExpr.trim() : "",
                orderBy: isClickHouse ? orderByExpr.trim() : "",
                sampleBy: isClickHouse ? sampleByExpr.trim() : "",
                fields: validFields.map(({ id, aiLoading, ...rest }) => rest),
                indexes: indexes
                    .filter((idx) => idx.name.trim() && idx.columns.length > 0)
                    .map(({ id, aiLoading, ...rest }) => rest),
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
                        {/* 表名 */}
                        <div className="section-title">
                            <div><h3>表名</h3></div>
                        </div>
                        <input
                            className="field-input"
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            placeholder="输入新表名"
                            style={{ marginBottom: 16 }}
                            autoComplete="off"
                        />
                        {isPostgreSQL ? (
                            <input
                                className="field-input"
                                value={schemaName}
                                onChange={(e) => setSchemaName(e.target.value)}
                                placeholder="Schema，默认 public"
                                style={{ marginBottom: 16 }}
                                autoComplete="off"
                            />
                        ) : null}

                        {/* 字段结构 */}
                        <div className="section-title">
                            <div><h3>字段结构</h3></div>
                        </div>
                        <div className="schema-table-shell">
                            <table className="schema-table">
                                <thead>
                                    <tr>
                                        <th>字段名</th><th>类型</th><th>可空</th>{isMySQL ? <th>无符号</th> : null}<th>默认值</th>{isMySQL ? <th>自动更新</th> : null}<th>主键</th><th>自增</th><th>注释</th><th>操作</th>
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
                                                    autoComplete="off"
                                                />
                                            </td>
                                            <td>
                                                <TypeCombobox options={fieldTypeOptions} value={field.type} onChange={(value) => updateField(index, "type", value)} />
                                            </td>
                                            <td>
                                                <label className="checkbox-cell">
                                                    <input type="checkbox" checked={field.nullable} onChange={(e) => updateField(index, "nullable", e.target.checked)} />
                                                </label>
                                            </td>
                                            {isMySQL ? (
                                                <td>
                                                    {isIntegerType(field.type) ? (
                                                        <label className="checkbox-cell">
                                                            <input type="checkbox" checked={field.unsigned || false} onChange={(e) => updateField(index, "unsigned", e.target.checked)} />
                                                        </label>
                                                    ) : null}
                                                </td>
                                            ) : null}
                                            <td style={{ position: "relative" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                                    <input
                                                        value={field.defaultValue}
                                                        onChange={(e) => updateField(index, "defaultValue", e.target.value)}
                                                        placeholder="默认值"
                                                        style={{ flex: 1 }}
                                                        autoComplete="off"
                                                    />
                                                    {(isTimestampType(field.type)) ? (
                                                        <button
                                                            type="button"
                                                            className="mini-ai-button"
                                                            title="填充 CURRENT_TIMESTAMP"
                                                            onClick={() => updateField(index, "defaultValue", "CURRENT_TIMESTAMP")}
                                                            style={{ fontSize: 11 }}
                                                        >
                                                            NOW
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>
                                            {isMySQL ? (
                                                <td>
                                                    {isTimestampType(field.type) && (field.type.toLowerCase() === "timestamp" || field.type.toLowerCase() === "datetime") ? (
                                                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={field.onUpdate === "CURRENT_TIMESTAMP"}
                                                                onChange={(e) => updateField(index, "onUpdate", e.target.checked ? "CURRENT_TIMESTAMP" : "")}
                                                            />
                                                            自动更新
                                                        </label>
                                                    ) : null}
                                                </td>
                                            ) : null}
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
                                                <div className="comment-editor">
                                                    <input value={field.comment} onChange={(e) => updateField(index, "comment", e.target.value)} placeholder="注释" autoComplete="off" />
                                                    {aiConfigured ? (
                                                        <button type="button" className="mini-ai-button" onClick={() => handleGenerateFieldComment(index)} disabled={field.aiLoading}>
                                                            {field.aiLoading ? "..." : "AI"}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                                <button type="button" className="icon-btn icon-btn--add" title="在下方插入字段" onClick={() => addField(index)}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                                    </svg>
                                                </button>
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

                        {/* 索引 */}
                        <div className="section-title" style={{ marginTop: 24 }}>
                            <div><h3>索引结构</h3></div>
                            <div className="toolbar-actions">
                                <button type="button" className="ghost-button" onClick={addIndex}>新增索引</button>
                            </div>
                        </div>
                        <div className="schema-table-shell">
                            <table className="schema-table">
                                <thead>
                                    <tr>
                                        <th>索引名</th><th>字段</th><th>唯一</th>{getIndexTypeOptions(engine).length > 0 ? <th>类型</th> : null}<th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {indexes.length === 0 ? (
                                        <tr><td colSpan={getIndexTypeOptions(engine).length > 0 ? 5 : 4} style={{ textAlign: "center", color: "#999" }}>暂无索引，点击上方「新增索引」添加</td></tr>
                                    ) : (
                                        indexes.map((idx, index) => (
                                            <tr key={idx.id}>
                                                <td>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        <input
                                                            value={idx.name}
                                                            onChange={(e) => updateIndex(index, "name", e.target.value)}
                                                            placeholder="索引名"
                                                            style={{ flex: 1, minWidth: 60 }}
                                                        />
                                                        {aiConfigured ? (
                                                            <button
                                                                type="button"
                                                                className="mini-ai-button"
                                                                title="AI 生成索引名"
                                                                onClick={() => handleGenerateIndexComment(index)}
                                                                disabled={idx.aiLoading || idx.columns.length === 0}
                                                            >
                                                                {idx.aiLoading ? "..." : "AI"}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td>
                                                    <MultiSelectCombobox
                                                        options={fieldNames}
                                                        value={idx.columns}
                                                        onChange={(val) => updateIndex(index, "columns", val)}
                                                        placeholder="选择字段"
                                                    />
                                                </td>
                                                <td>
                                                    <label className="checkbox-cell">
                                                        <input type="checkbox" checked={idx.unique} onChange={(e) => updateIndex(index, "unique", e.target.checked)} />
                                                    </label>
                                                </td>
                                                {getIndexTypeOptions(engine).length > 0 ? (
                                                    <td>
                                                        <select value={idx.indexType} onChange={(e) => updateIndex(index, "indexType", e.target.value)}>
                                                            {getIndexTypeOptions(engine).map((type) => (<option key={type} value={type}>{type}</option>))}
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

                        {/* 分区（可选，移到底部） */}
                        {supportsPartition ? (
                            <div style={{ marginTop: 24 }}>
                                <div className="section-title">
                                    <div>
                                        <h3>分区设置 <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--text-secondary)" }}>（可选）</span></h3>
                                    </div>
                                    {aiConfigured ? (
                                        <button
                                            type="button"
                                            className="ghost-button ghost-button--sm"
                                            onClick={handleAISuggestPartition}
                                            disabled={isSuggestingPartition || fields.filter((f) => f.name.trim() && f.type.trim()).length === 0}
                                        >
                                            {isSuggestingPartition ? "AI 分析中..." : "AI 快捷分区"}
                                        </button>
                                    ) : null}
                                </div>
                                {isMySQL && fields.some((f) => f.primary) && partitionBy.trim() !== "" ? (
                                    <div style={{
                                        background: "#fef2f2",
                                        border: "1px solid #dc2626",
                                        borderRadius: 8,
                                        padding: "10px 14px",
                                        marginBottom: 12,
                                        fontSize: 12.5,
                                        color: "#991b1b",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                    }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <line x1="15" y1="9" x2="9" y2="15"></line>
                                            <line x1="9" y1="9" x2="15" y2="15"></line>
                                        </svg>
                                        <span>MySQL 分区要求主键必须包含所有分区键。系统将在建表时自动把分区键追加到主键中。</span>
                                    </div>
                                ) : null}
                                {isMySQL ? (
                                    <label className="field field--full">
                                        <span>PARTITION BY</span>
                                        <textarea
                                            value={partitionBy}
                                            onChange={(e) => setPartitionBy(e.target.value)}
                                            rows={4}
                                            style={{
                                                width: "100%",
                                                fontFamily: "var(--font-mono)",
                                                fontSize: 12.5,
                                                lineHeight: 1.6,
                                                resize: "vertical",
                                                minHeight: 80,
                                                border: "1px solid var(--border-soft)",
                                                borderRadius: 8,
                                                padding: "8px 12px",
                                                background: "var(--surface-2)",
                                                color: "var(--text-primary)",
                                                outline: "none",
                                            }}
                                            placeholder="例如：PARTITION BY RANGE (YEAR(created_at)) ( PARTITION p2024 VALUES LESS THAN (2025), PARTITION p2025 VALUES LESS THAN (2026), PARTITION pmax VALUES LESS THAN MAXVALUE )"
                                        />
                                    </label>
                                ) : (
                                    <>
                                        <label className="field field--full"><span>PARTITION BY</span><input value={partitionBy} onChange={(e) => setPartitionBy(e.target.value)} /></label>
                                        <label className="field field--half"><span>PRIMARY KEY</span><input value={primaryKeyExpr} onChange={(e) => setPrimaryKeyExpr(e.target.value)} /></label>
                                        <label className="field field--half"><span>ORDER BY</span><input value={orderByExpr} onChange={(e) => setOrderByExpr(e.target.value)} /></label>
                                        <label className="field field--full"><span>SAMPLE BY</span><input value={sampleByExpr} onChange={(e) => setSampleByExpr(e.target.value)} /></label>
                                    </>
                                )}
                            </div>
                        ) : null}
                    </div>

                    {/* AI 分区建议确认弹窗 */}
                    {partitionSuggestion ? createPortal(
                        <div className="modal-overlay" onClick={() => setPartitionSuggestion(null)}>
                            <div className="confirm-dialog" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
                                <div className="confirm-dialog__header">
                                    <h4>AI 分区建议</h4>
                                </div>
                                <div className="confirm-dialog__body">
                                    {partitionSuggestion.suggestion && (
                                        <p style={{ color: "var(--text-primary)", marginBottom: 12, lineHeight: 1.6 }}>{partitionSuggestion.suggestion}</p>
                                    )}

                                    <div style={{
                                        background: "var(--surface-2)",
                                        borderRadius: 8,
                                        padding: 12,
                                        fontFamily: "monospace",
                                        fontSize: 12,
                                        overflowX: "auto",
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-all",
                                        marginBottom: 16,
                                    }}>
                                        {partitionSuggestion.partitionddl}
                                    </div>

                                    {partitionSuggestion.warnings && partitionSuggestion.warnings.length > 0 && (
                                        <div style={{
                                            background: "#fef3c7",
                                            border: "1px solid #f59e0b",
                                            borderRadius: 8,
                                            padding: 14,
                                            marginBottom: 0,
                                        }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontWeight: 600, color: "#92400e" }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"></path>
                                                    <line x1="12" y1="9" x2="12" y2="13"></line>
                                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                                </svg>
                                                分区注意事项
                                            </div>
                                            <ul style={{ margin: 0, paddingLeft: 18, color: "#92400e", fontSize: 13 }}>
                                                {partitionSuggestion.warnings.map((w, i) => (
                                                    <li key={i} style={{ marginBottom: 4 }}>{w}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <div className="confirm-dialog__footer">
                                    <button type="button" className="ghost-button" onClick={() => setPartitionSuggestion(null)}>取消</button>
                                    <button type="button" className="primary-button" onClick={confirmPartitionSuggestion}>确认应用</button>
                                </div>
                            </div>
                        </div>,
                        document.body,
                    ) : null}
                </div>
            )}
        </section>
    );
}
