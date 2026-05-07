import { useEffect, useMemo, useState } from "react";
import type { SchemaDraftField, TableDetail, AIFieldCommentResult, FieldDictionarySuggestion } from "../types/runtime";
import { RenameTable, GenerateFieldComment, GetFieldDictionarySuggestion, GenerateIndexName, ExecuteQuery } from "../../wailsjs/go/main/App";
import { browserGeneratedID, buildAlterSQL, copyText, getErrorMessage, getFieldTypeOptions, getIndexTypeOptions, getDefaultFieldType, isIntegerType, isTimestampType } from "../lib/utils";
import type { NoticeTone } from "../lib/constants";
import type { SchemaDraftIndex } from "../lib/utils";

type Notice = {
    tone: NoticeTone;
    message: string;
};

export type AlterPreviewState = {
    scope: "fields" | "indexes";
    title: string;
    sql: string;
    error?: string;
} | null;

export interface UseSchemaOptions {
    browserPreview: boolean;
    activeEngine: string;
    selectedConnection: { id: string } | null;
    selectedDatabase: string;
    selectedTable: string;
    tableDetail: TableDetail | null;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
    setTransferNotice: React.Dispatch<React.SetStateAction<Notice | null>>;
    setSelectedTable: React.Dispatch<React.SetStateAction<string>>;
    loadExplorer: (connectionId: string, preferredDatabase?: string) => Promise<void>;
    loadTable: (connectionId: string, database: string, table: string) => Promise<void>;
    exportTextFile: (kind: "sql" | "csv" | "xls", suggestedName: string, content: string, title: string) => Promise<void>;
}

export interface UseSchemaReturn {
    schemaDraftFields: SchemaDraftField[];
    setSchemaDraftFields: React.Dispatch<React.SetStateAction<SchemaDraftField[]>>;
    schemaDraftIndexes: SchemaDraftIndex[];
    setSchemaDraftIndexes: React.Dispatch<React.SetStateAction<SchemaDraftIndex[]>>;
    renameModalOpen: boolean;
    setRenameModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    renameTableName: string;
    setRenameTableName: React.Dispatch<React.SetStateAction<string>>;
    schemaNotice: Notice | null;
    setSchemaNotice: React.Dispatch<React.SetStateAction<Notice | null>>;
    isRenamingTable: boolean;
    currentAlterSQL: string;
    fieldTypeOptions: string[];
    applyFieldSuggestion: (index: number, fieldName: string) => Promise<void>;
    handleGenerateFieldComment: (index: number) => Promise<void>;
    updateDraftField: <K extends keyof SchemaDraftField>(index: number, key: K, value: SchemaDraftField[K]) => void;
    handleAddField: (afterIndex?: number) => void;
    handleDeleteDraftField: (index: number) => void;
    handleRenameTable: () => Promise<void>;
    handleExportDDL: () => Promise<void>;
    handleCopyDDL: () => void;
    handleAddIndex: () => void;
    handleDeleteDraftIndex: (index: number) => void;
    updateDraftIndex: <K extends keyof SchemaDraftIndex>(index: number, key: K, value: SchemaDraftIndex[K]) => void;
    handleGenerateIndexName: (index: number, tableName: string) => Promise<void>;
    alterPreview: AlterPreviewState;
    setAlterPreview: React.Dispatch<React.SetStateAction<AlterPreviewState>>;
    handleSaveFields: () => Promise<void>;
    handleConfirmAlterPreview: () => Promise<void>;
    isSavingFields: boolean;
    handleSaveIndexes: () => Promise<void>;
    isSavingIndexes: boolean;
}

export function useSchema(options: UseSchemaOptions): UseSchemaReturn {
    const {
        browserPreview,
        activeEngine,
        selectedConnection,
        selectedDatabase,
        selectedTable,
        tableDetail,
        pushToast,
        setTransferNotice,
        setSelectedTable,
        loadExplorer,
        loadTable,
        exportTextFile,
    } = options;

    const [schemaDraftFields, setSchemaDraftFields] = useState<SchemaDraftField[]>([]);
    const [schemaDraftIndexes, setSchemaDraftIndexes] = useState<SchemaDraftIndex[]>([]);
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [renameTableName, setRenameTableName] = useState("");
    const [schemaNotice, setSchemaNotice] = useState<Notice | null>(null);
    const [isRenamingTable, setIsRenamingTable] = useState(false);
    const [isSavingFields, setIsSavingFields] = useState(false);
    const [isSavingIndexes, setIsSavingIndexes] = useState(false);
    const [alterPreview, setAlterPreview] = useState<AlterPreviewState>(null);

    const currentAlterSQL = useMemo(() => buildAlterSQL(activeEngine, tableDetail, selectedTable, schemaDraftFields, schemaDraftIndexes), [activeEngine, tableDetail, selectedTable, schemaDraftFields, schemaDraftIndexes]);

    useEffect(() => {
        setAlterPreview(null);
    }, [selectedConnection, selectedDatabase, selectedTable]);

    const fieldTypeOptions = useMemo(() => {
        const dynamicTypes = schemaDraftFields.map((item) => item.type).filter(Boolean);
        return getFieldTypeOptions(activeEngine, dynamicTypes);
    }, [activeEngine, schemaDraftFields]);

    async function applyFieldSuggestion(index: number, fieldName: string) {
        if (!fieldName.trim()) {
            return;
        }

        try {
            if (browserPreview) {
                setSchemaDraftFields((current) =>
                    current.map((field, itemIndex) =>
                        itemIndex === index
                            ? {
                                  ...field,
                                  needsAiComment: true,
                              }
                            : field,
                    ),
                );
                return;
            }

            const suggestion = (await GetFieldDictionarySuggestion({
                engine: activeEngine,
                fieldName,
            })) as FieldDictionarySuggestion;

            setSchemaDraftFields((current) =>
                current.map((field, itemIndex) =>
                    itemIndex === index
                        ? {
                              ...field,
                              type: suggestion.type || field.type,
                              comment: field.comment.trim() || suggestion.comment,
                              needsAiComment: suggestion.needsAiComment && !suggestion.comment,
                          }
                        : field,
                ),
            );
        } catch {
            setSchemaDraftFields((current) =>
                current.map((field, itemIndex) =>
                    itemIndex === index
                        ? {
                              ...field,
                              needsAiComment: true,
                          }
                        : field,
                ),
            );
        }
    }

    async function handleGenerateFieldComment(index: number) {
        const field = schemaDraftFields[index];
        if (!field?.name.trim()) {
            return;
        }

        try {
            setSchemaDraftFields((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index
                        ? {
                              ...item,
                              aiLoading: true,
                          }
                        : item,
                ),
            );

            const result = (await GenerateFieldComment({ fieldName: field.name })) as AIFieldCommentResult;
            setSchemaDraftFields((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index
                        ? {
                              ...item,
                              comment: result.comment,
                              needsAiComment: false,
                              aiLoading: false,
                          }
                        : item,
                ),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "生成字段注释失败";
            setSchemaNotice({ tone: "error", message });
            setSchemaDraftFields((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index
                        ? {
                              ...item,
                              aiLoading: false,
                          }
                        : item,
                ),
            );
        }
    }

    function updateDraftField<K extends keyof SchemaDraftField>(index: number, key: K, value: SchemaDraftField[K]) {
        setSchemaDraftFields((current) =>
            current.map((field, itemIndex) => {
                if (itemIndex !== index) {
                    // 当设置当前字段为主键时，取消其他字段的主键和自增状态
                    if (key === "primary" && value === true) {
                        return { ...field, primary: false, autoIncrement: false };
                    }
                    return field;
                }
                return { ...field, [key]: value };
            }),
        );
    }

    function handleAddField(afterIndex?: number) {
        const newField = {
            id: browserGeneratedID(),
            originName: "",
            name: "",
            type: getDefaultFieldType(activeEngine),
            nullable: false,
            defaultValue: "",
            comment: "",
            primary: false,
            autoIncrement: false,
            unsigned: false,
            onUpdate: "",
            charset: "utf8mb4",
            collation: "utf8mb4_general_ci",
            needsAiComment: true,
            aiLoading: false,
        };
        setSchemaDraftFields((current) => {
            if (afterIndex !== undefined && afterIndex >= 0) {
                const next = [...current];
                next.splice(afterIndex + 1, 0, newField);
                return next;
            }
            return [...current, newField];
        });
    }

    function handleDeleteDraftField(index: number) {
        setSchemaDraftFields((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }

    function handleAddIndex() {
        const options = getIndexTypeOptions(activeEngine);
        setSchemaDraftIndexes((current) => [
            ...current,
            {
                id: browserGeneratedID(),
                originName: "",
                name: "",
                columns: [],
                unique: false,
                indexType: options.length > 0 ? options[0] : "",
                aiLoading: false,
            },
        ]);
    }

    function handleDeleteDraftIndex(index: number) {
        setSchemaDraftIndexes((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }

    function updateDraftIndex<K extends keyof SchemaDraftIndex>(index: number, key: K, value: SchemaDraftIndex[K]) {
        setSchemaDraftIndexes((current) =>
            current.map((idx, itemIndex) =>
                itemIndex === index
                    ? {
                          ...idx,
                          [key]: value,
                      }
                    : idx,
            ),
        );
    }

    async function handleGenerateIndexName(index: number, tableName: string) {
        const idx = schemaDraftIndexes[index];
        if (!idx || idx.columns.length === 0) {
            setSchemaNotice({ tone: "error", message: "请先选择索引字段。" });
            return;
        }
        try {
            setSchemaDraftIndexes((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, aiLoading: true } : item,
                ),
            );
            const result = (await GenerateIndexName({
                tableName,
                columns: idx.columns,
                unique: idx.unique,
            })) as { name: string };
            setSchemaDraftIndexes((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, name: result.name, aiLoading: false } : item,
                ),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "生成索引名称失败";
            setSchemaNotice({ tone: "error", message });
            setSchemaDraftIndexes((current) =>
                current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, aiLoading: false } : item,
                ),
            );
        }
    }

    async function handleRenameTable() {
        if (!selectedConnection || !selectedDatabase || !selectedTable || !renameTableName.trim()) {
            return;
        }

        if (renameTableName.trim() === selectedTable) {
            setSchemaNotice({ tone: "info", message: "表名未变化。" });
            setRenameModalOpen(false);
            return;
        }

        try {
            setIsRenamingTable(true);
            await RenameTable({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                oldName: selectedTable,
                newName: renameTableName.trim(),
            });
            setSchemaNotice({ tone: "success", message: "表已重命名。" });
            setRenameModalOpen(false);
            setSelectedTable(renameTableName.trim());
            await loadExplorer(selectedConnection.id, selectedDatabase);
            await loadTable(selectedConnection.id, selectedDatabase, renameTableName.trim());
        } catch (error) {
            const message = error instanceof Error ? error.message : "重命名表失败";
            setSchemaNotice({ tone: "error", message });
        } finally {
            setIsRenamingTable(false);
        }
    }

    async function handleExportDDL() {
        if (!tableDetail) {
            setTransferNotice({ tone: "info", message: "请先选择一张真实表。" });
            return;
        }

        await exportTextFile("sql", `${tableDetail.table}.sql`, tableDetail.ddl, "导出表 DDL");
    }

    function handleCopyDDL() {
        if (!tableDetail?.ddl.trim()) {
            setSchemaNotice({ tone: "info", message: "当前没有可复制的 DDL。" });
            return;
        }

        copyText(tableDetail.ddl)
            .then(() => pushToast("success", "已复制 DDL", tableDetail.table))
            .catch(() => pushToast("error", "复制失败", "请稍后重试"));
    }

    function validateFields(fields: SchemaDraftField[]): string | null {
        const names = fields.map((f) => f.name.trim()).filter(Boolean);
        if (names.length === 0) {
            return "表至少需要保留一个字段。";
        }
        const nameSet = new Set<string>();
        for (const name of names) {
            if (nameSet.has(name)) {
                return `字段名 "${name}" 重复，请检查。`;
            }
            nameSet.add(name);
        }
        for (const field of fields) {
            if (!field.name.trim()) {
                return "存在字段名为空，请补全。";
            }
            if (!field.type.trim()) {
                return `字段 "${field.name}" 的类型不能为空。`;
            }
        }
        const hasPrimary = fields.some((f) => f.primary);
        if (!hasPrimary) {
            return "表必须至少包含一个主键字段。";
        }
        const autoIncrWithoutPrimary = fields.some((f) => f.autoIncrement && !f.primary);
        if (autoIncrWithoutPrimary) {
            return "自增字段必须同时设置为主键。";
        }
        return null;
    }

    function validateIndexes(indexes: SchemaDraftIndex[], fields: SchemaDraftField[]): string | null {
        const names = indexes.map((idx) => idx.name.trim()).filter(Boolean);
        const nameSet = new Set<string>();
        for (const name of names) {
            if (nameSet.has(name)) {
                return `索引名 "${name}" 重复，请检查。`;
            }
            nameSet.add(name);
        }
        const fieldNames = new Set(fields.map((f) => f.name.trim()));
        for (const idx of indexes) {
            if (!idx.name.trim()) {
                return "存在索引名为空，请补全。";
            }
            if (idx.columns.length === 0) {
                return `索引 "${idx.name}" 至少需要包含一个字段。`;
            }
            for (const col of idx.columns) {
                if (!fieldNames.has(col.trim())) {
                    return `索引 "${idx.name}" 引用了不存在的字段 "${col.trim()}"。`;
                }
            }
        }
        return null;
    }

    function buildAlterPreview(scope: "fields" | "indexes") {
        if (!selectedConnection || !selectedDatabase || !selectedTable || !tableDetail) {
            setSchemaNotice({ tone: "error", message: "请先选择一张真实表。" });
            return null;
        }
        const error = scope === "fields"
            ? validateFields(schemaDraftFields)
            : validateIndexes(schemaDraftIndexes, schemaDraftFields);
        if (error) {
            setSchemaNotice({ tone: "error", message: error });
            return null;
        }
        const sql = buildAlterSQL(activeEngine, tableDetail, selectedTable, schemaDraftFields, schemaDraftIndexes, scope);
        if (sql.startsWith("--")) {
            setSchemaNotice({ tone: "info", message: scope === "fields" ? "当前没有字段结构变更。" : "当前没有索引结构变更。" });
            return null;
        }
        return {
            scope,
            title: scope === "fields" ? "字段结构变更预览" : "索引结构变更预览",
            sql,
        };
    }

    async function executeAlterSQL(preview: Exclude<AlterPreviewState, null>) {
        if (!selectedConnection || !selectedDatabase || !selectedTable) {
            setSchemaNotice({ tone: "error", message: "请先选择一张真实表。" });
            return;
        }
        const setSaving = preview.scope === "fields" ? setIsSavingFields : setIsSavingIndexes;
        try {
            setSaving(true);
            await ExecuteQuery({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                sql: preview.sql,
                page: 1,
                pageSize: 1,
            });
            setAlterPreview(null);
            setSchemaNotice({ tone: "success", message: preview.scope === "fields" ? "字段结构已保存。" : "索引结构已保存。" });
            await loadTable(selectedConnection.id, selectedDatabase, selectedTable);
        } catch (err) {
            const message = getErrorMessage(err);
            setAlterPreview((current) => current ? { ...current, error: message } : { ...preview, error: message });
            setSchemaNotice(null);
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveFields() {
        const preview = buildAlterPreview("fields");
        if (preview) {
            setAlterPreview(preview);
        }
    }

    async function handleSaveIndexes() {
        const preview = buildAlterPreview("indexes");
        if (preview) {
            setAlterPreview(preview);
        }
    }

    async function handleConfirmAlterPreview() {
        if (alterPreview) {
            await executeAlterSQL(alterPreview);
        }
    }

    return {
        schemaDraftFields,
        setSchemaDraftFields,
        schemaDraftIndexes,
        setSchemaDraftIndexes,
        renameModalOpen,
        setRenameModalOpen,
        renameTableName,
        setRenameTableName,
        schemaNotice,
        setSchemaNotice,
        isRenamingTable,
        currentAlterSQL,
        fieldTypeOptions,
        applyFieldSuggestion,
        handleGenerateFieldComment,
        updateDraftField,
        handleAddField,
        handleDeleteDraftField,
        handleRenameTable,
        handleExportDDL,
        handleCopyDDL,
        handleAddIndex,
        handleDeleteDraftIndex,
        updateDraftIndex,
        handleGenerateIndexName,
        alterPreview,
        setAlterPreview,
        handleSaveFields,
        handleConfirmAlterPreview,
        isSavingFields,
        handleSaveIndexes,
        isSavingIndexes,
    };
}
