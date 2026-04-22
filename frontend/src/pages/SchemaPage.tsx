import { NoticeBanner } from "../components/NoticeBanner";
import type { TableDetail, SchemaDraftField } from "../types/runtime";
import type { SchemaDraftIndex } from "../lib/utils";

type NoticeTone = "success" | "error" | "info";

interface SchemaPageProps {
    selectedTable: string;
    tableDetail: TableDetail | null;
    schemaNotice: { tone: NoticeTone; message: string } | null;
    schemaDraftFields: SchemaDraftField[];
    mysqlTypeOptions: string[];
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
}

export function SchemaPage({
    selectedTable,
    tableDetail,
    schemaNotice,
    schemaDraftFields,
    mysqlTypeOptions,
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
}: SchemaPageProps) {
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
                    <button type="button" className="ghost-button" onClick={handleAddIndex} disabled={!tableDetail}>
                        新增索引
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setRenameModalOpen(true)} disabled={!tableDetail}>
                        重命名表
                    </button>
                    <button type="button" className="ghost-button" onClick={handleExportDDL} disabled={!tableDetail || isExporting}>
                        {isExporting ? "导出中..." : "导出 DDL"}
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
                                                <select value={field.type} onChange={(event) => updateDraftField(index, "type", event.target.value)}>
                                                    {mysqlTypeOptions.map((type) => (
                                                        <option key={type} value={type}>
                                                            {type}
                                                        </option>
                                                    ))}
                                                </select>
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
                                                <button type="button" className="text-button text-button--danger" onClick={() => handleDeleteDraftField(index)}>
                                                    删除
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
                        </div>
                        <div className="schema-table-shell">
                            <table className="schema-table">
                                <thead>
                                    <tr>
                                        <th>索引名</th>
                                        <th>字段</th>
                                        <th>唯一</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {schemaDraftIndexes.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} style={{ textAlign: "center", color: "#999" }}>暂无索引，点击上方「新增索引」添加</td>
                                        </tr>
                                    ) : (
                                        schemaDraftIndexes.map((idx, index) => (
                                            <tr key={idx.id}>
                                                <td>
                                                    <input
                                                        value={idx.name}
                                                        onChange={(event) => updateDraftIndex(index, "name", event.target.value)}
                                                        placeholder="索引名"
                                                    />
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
                                                <td>
                                                    <button type="button" className="text-button text-button--danger" onClick={() => handleDeleteDraftIndex(index)}>
                                                        删除
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="detail-card schema-ddl-card">
                        <div className="section-title">
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
                            <pre>{tableDetail.ddl}</pre>
                        </div>
                    </div>

                    <div className="schema-detail-grid">
                        <div className="detail-card schema-detail-card">
                            <div className="section-title">
                                <div>
                                    <h3>索引诊断</h3>
                                </div>
                            </div>
                            <ul className="diagnostic-list">
                                {tableDetail.indexDiagnostics.map((item) => (
                                    <li key={`${item.title}-${item.detail}`}>
                                        <strong>{item.title}</strong>
                                        <span>{item.detail}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="detail-card schema-detail-card">
                            <div className="section-title">
                                <div>
                                    <h3>结构变更预览 SQL</h3>
                                </div>
                            </div>
                            <div className="code-block code-block--wide schema-alter-block">
                                <pre>{currentAlterSQL}</pre>
                            </div>
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
