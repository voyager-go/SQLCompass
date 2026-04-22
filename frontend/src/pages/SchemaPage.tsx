import { useState } from "react";
import { NoticeBanner } from "../components/NoticeBanner";
import { TypeCombobox } from "../components/TypeCombobox";
import type { TableDetail, SchemaDraftField } from "../types/runtime";
import type { SchemaDraftIndex } from "../lib/utils";
import { getIndexTypeOptions } from "../lib/utils";
import { highlightSQL } from "../lib/sqlHighlight";

type NoticeTone = "success" | "error" | "info";

interface SchemaPageProps {
    selectedTable: string;
    tableDetail: TableDetail | null;
    schemaNotice: { tone: NoticeTone; message: string } | null;
    schemaDraftFields: SchemaDraftField[];
    mysqlTypeOptions: string[];
    activeEngine: string;
    updateDraftField: <K extends keyof SchemaDraftField>(index: number, key: K, value: SchemaDraftField[K]) => void;
    applyFieldSuggestion: (index: number, fieldName: string) => Promise<void>;
    handleGenerateFieldComment: (index: number) => Promise<void>;
    handleDeleteDraftField: (index: number) => void;
    handleAddField: () => void;
    setRenameModalOpen: (v: boolean) => void;
    handleExportDDL: () => Promise<void>;
    isExporting: boolean;
    handleCopyDDL: () => void;
    currentAlterSQL: string;
    renameModalOpen: boolean;
    renameTableName: string;
    setRenameTableName: (v: string) => void;
    handleRenameTable: () => Promise<void>;
    isRenamingTable: boolean;
    schemaDraftIndexes: SchemaDraftIndex[];
    handleAddIndex: () => void;
    handleDeleteDraftIndex: (index: number) => void;
    updateDraftIndex: <K extends keyof SchemaDraftIndex>(index: number, key: K, value: SchemaDraftIndex[K]) => void;
    handleGenerateIndexName: (index: number, tableName: string) => Promise<void>;
    aiConfigured: boolean;
    handleSaveFields: () => Promise<void>;
    isSavingFields: boolean;
    handleSaveIndexes: () => Promise<void>;
    isSavingIndexes: boolean;
}

export function SchemaPage({
    selectedTable,
    tableDetail,
    schemaNotice,
    schemaDraftFields,
    mysqlTypeOptions,
    activeEngine,
    updateDraftField,
    applyFieldSuggestion,
    handleGenerateFieldComment,
    handleDeleteDraftField,
    handleAddField,
    setRenameModalOpen,
    handleExportDDL,
    isExporting,
    handleCopyDDL,
    currentAlterSQL,
    renameModalOpen,
    renameTableName,
    setRenameTableName,
    handleRenameTable,
    isRenamingTable,
    schemaDraftIndexes,
    handleAddIndex,
    handleDeleteDraftIndex,
    updateDraftIndex,
    handleGenerateIndexName,
    aiConfigured,
    handleSaveFields,
    isSavingFields,
    handleSaveIndexes,
    isSavingIndexes,
}: SchemaPageProps) {
    const indexTypeOptions = getIndexTypeOptions(activeEngine);
    const [runningAiDiagnose, setRunningAiDiagnose] = useState(false);
    const [aiDiagnostics, setAiDiagnostics] = useState<{ title: string; detail: string }[] | null>(null);

    async function handleAIDiagnose() {
        if (!tableDetail || !aiConfigured) return;
        setRunningAiDiagnose(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 800));
            setAiDiagnostics(tableDetail.indexDiagnostics.map((d) => ({ title: d.title, detail: d.detail })));
        } finally {
            setRunningAiDiagnose(false);
        }
    }

    return (
        <section className="page-panel page-panel--wide">
            <div className="page-headline">
                <div>
                    <h2>表设计</h2>
                    <p>{selectedTable ? `当前表：${selectedTable}` : "请先从左侧点击某张表，再进入这里查看结构。"}</p>
                </div>
                <div className="toolbar-actions">
                    <button type="button" className="ghost-button" onClick={handleAddField} disabled={!tableDetail}>
                        新增字段
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setRenameModalOpen(true)} disabled={!tableDetail}>
                        重命名表
                    </button>
                    <button type="button" className="ghost-button" onClick={handleCopyDDL} disabled={!tableDetail}>
                        复制 DDL
                    </button>
                </div>
            </div>

            <NoticeBanner notice={schemaNotice} />

            {!tableDetail ? (
                <div className="empty-block">左侧点开数据库后，单击某张表先查看前 30 行数据；需要改结构时再切到这里。</div>
            ) : (
                <div className="schema-layout">
                    <div className="detail-card schema-form-card">
                        <div className="section-title">
                            <div>
                                <h3>字段结构</h3>
                            </div>
                            <div className="toolbar-actions">
                                <button type="button" className="primary-button" onClick={handleSaveFields} disabled={!tableDetail || isSavingFields}>
                                    {isSavingFields ? "保存中..." : "保存"}
                                </button>
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
                                    {schemaDraftFields.map((field, index) => (
                                        <tr key={field.id}>
                                            <td>
                                                <input
                                                    value={field.name}
                                                    onChange={(event) => updateDraftField(index, "name", event.target.value)}
                                                    onBlur={(event) => applyFieldSuggestion(index, event.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <TypeCombobox
                                                    options={mysqlTypeOptions}
                                                    value={field.type}
                                                    onChange={(value) => updateDraftField(index, "type", value)}
                                                />
                                            </td>
                                            <td>
                                                <label className="checkbox-cell">
                                                    <input type="checkbox" checked={field.nullable} onChange={(event) => updateDraftField(index, "nullable", event.target.checked)} />
                                                </label>
                                            </td>
                                            <td>
                                                <input value={field.defaultValue} onChange={(event) => updateDraftField(index, "defaultValue", event.target.value)} />
                                            </td>
                                            <td>
                                                <label className="checkbox-cell">
                                                    <input type="checkbox" checked={field.primary} onChange={(event) => updateDraftField(index, "primary", event.target.checked)} />
                                                </label>
                                            </td>
                                            <td>
                                                <label className="checkbox-cell">
                                                    <input type="checkbox" checked={field.autoIncrement} onChange={(event) => updateDraftField(index, "autoIncrement", event.target.checked)} />
                                                </label>
                                            </td>
                                            <td>
                                                <div className="comment-editor">
                                                    <input value={field.comment} onChange={(event) => updateDraftField(index, "comment", event.target.value)} />
                                                    {field.needsAiComment ? (
                                                        <button type="button" className="mini-ai-button" onClick={() => handleGenerateFieldComment(index)} disabled={field.aiLoading}>
                                                            {field.aiLoading ? "生成中" : "AI"}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td>
                                                <button type="button" className="icon-btn icon-btn--delete" title="删除字段" onClick={() => handleDeleteDraftField(index)}>
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
                                <h3>索引结构</h3>
                            </div>
                            <div className="toolbar-actions">
                                <button type="button" className="ghost-button" onClick={handleAddIndex} disabled={!tableDetail}>
                                    新增索引
                                </button>
                                <button type="button" className="primary-button" onClick={handleSaveIndexes} disabled={!tableDetail || isSavingIndexes}>
                                    {isSavingIndexes ? "保存中..." : "保存"}
                                </button>
                            </div>
                        </div>
                        <div className="schema-table-shell">
                            <table className="schema-table">
                                <thead>
                                    <tr>
                                        <th>索引名</th>
                                        <th>字段</th>
                                        <th>唯一</th>
                                        {indexTypeOptions.length > 0 ? <th>类型</th> : null}
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {schemaDraftIndexes.length === 0 ? (
                                        <tr>
                                            <td colSpan={indexTypeOptions.length > 0 ? 5 : 4} style={{ textAlign: "center", color: "#999" }}>暂无索引，点击上方「新增索引」添加</td>
                                        </tr>
                                    ) : (
                                        schemaDraftIndexes.map((idx, index) => (
                                            <tr key={idx.id}>
                                                <td>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        <input
                                                            value={idx.name}
                                                            onChange={(event) => updateDraftIndex(index, "name", event.target.value)}
                                                            placeholder="索引名"
                                                            style={{ flex: 1, minWidth: 60 }}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="mini-ai-button"
                                                            title={aiConfigured ? "AI 生成索引名" : "尚未配置 AI"}
                                                            onClick={() => {
                                                                if (!aiConfigured) {
                                                                    return;
                                                                }
                                                                if (idx.columns.length === 0) {
                                                                    return;
                                                                }
                                                                handleGenerateIndexName(index, selectedTable);
                                                            }}
                                                            disabled={!aiConfigured || !idx.columns.length}
                                                        >
                                                            AI
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>
                                                    <input
                                                        value={idx.columns.join(",")}
                                                        onChange={(event) => updateDraftIndex(index, "columns", event.target.value.split(",").map((c) => c.trim()).filter(Boolean))}
                                                        placeholder="字段1,字段2"
                                                    />
                                                </td>
                                                <td>
                                                    <label className="checkbox-cell">
                                                        <input type="checkbox" checked={idx.unique} onChange={(event) => updateDraftIndex(index, "unique", event.target.checked)} />
                                                    </label>
                                                </td>
                                                {indexTypeOptions.length > 0 ? (
                                                    <td>
                                                        <select
                                                            value={idx.indexType}
                                                            onChange={(event) => updateDraftIndex(index, "indexType", event.target.value)}
                                                        >
                                                            {indexTypeOptions.map((type) => (
                                                                <option key={type} value={type}>
                                                                    {type}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                ) : null}
                                                <td>
                                                    <button type="button" className="icon-btn icon-btn--delete" title="删除索引" onClick={() => handleDeleteDraftIndex(index)}>
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

                        <div className="section-title" style={{ marginTop: 24 }}>
                            <div>
                                <h3>DDL 语句</h3>
                            </div>
                            <div className="toolbar-actions">
                                <button type="button" className="ghost-button" onClick={handleCopyDDL}>
                                    复制 DDL
                                </button>
                                <button type="button" className="ghost-button" onClick={handleExportDDL} disabled={isExporting}>
                                    {isExporting ? "导出中..." : "导出 SQL"}
                                </button>
                            </div>
                        </div>
                        <div className="code-block code-block--wide code-block--tall">
                            <pre dangerouslySetInnerHTML={{ __html: highlightSQL(tableDetail.ddl) }} />
                        </div>
                    </div>

                    <div className="schema-detail-grid">
                        <div className="detail-card schema-detail-card">
                            <div className="section-title">
                                <div>
                                    <h3>索引诊断</h3>
                                </div>
                                {aiConfigured ? (
                                    <button
                                        type="button"
                                        className="mini-ai-button"
                                        onClick={handleAIDiagnose}
                                        disabled={runningAiDiagnose}
                                    >
                                        {runningAiDiagnose ? "诊断中..." : "AI 诊断"}
                                    </button>
                                ) : null}
                            </div>
                            {aiDiagnostics ? (
                                <ul className="diagnostic-list">
                                    {aiDiagnostics.map((item, i) => (
                                        <li key={`${item.title}-${i}`}>
                                            <strong>{item.title}</strong>
                                            <span>{item.detail}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="diagnostic-empty">
                                    {aiConfigured ? "点击右上角「AI 诊断」查看索引诊断结果。" : "配置 AI 后可使用智能索引诊断功能。"}
                                </div>
                            )}
                        </div>

                        <div className="detail-card schema-detail-card">
                            <div className="section-title">
                                <div>
                                    <h3>结构变更预览 SQL</h3>
                                </div>
                            </div>
                            {currentAlterSQL.trim() ? (
                                <div className="code-block code-block--wide schema-alter-block">
                                    <pre dangerouslySetInnerHTML={{ __html: highlightSQL(currentAlterSQL) }} />
                                </div>
                            ) : (
                                <div className="diagnostic-empty">暂无结构变更。</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {renameModalOpen ? (
                <div className="modal-backdrop" onClick={() => setRenameModalOpen(false)}>
                    <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>重命名表</h3>
                                <p>这个操作不常用，所以收进右上角按钮里。</p>
                            </div>
                        </div>
                        <label className="field">
                            <span>新表名</span>
                            <input value={renameTableName} onChange={(event) => setRenameTableName(event.target.value)} />
                        </label>
                        <div className="toolbar-actions toolbar-actions--end">
                            <button type="button" className="ghost-button" onClick={() => setRenameModalOpen(false)}>
                                取消
                            </button>
                            <button type="button" className="primary-button" onClick={handleRenameTable} disabled={isRenamingTable}>
                                {isRenamingTable ? "处理中..." : "确认重命名"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
