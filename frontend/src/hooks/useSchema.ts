import { useMemo, useState } from "react";
import type { SchemaDraftField, TableDetail, AIFieldCommentResult, FieldDictionarySuggestion } from "../types/runtime";
import { RenameTable, GenerateFieldComment, GetFieldDictionarySuggestion } from "../../wailsjs/go/main/App";
import { browserGeneratedID, buildAlterSQL, copyText } from "../lib/utils";
import type { NoticeTone } from "../lib/constants";

type Notice = {
    tone: NoticeTone;
    message: string;
};

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
    renameModalOpen: boolean;
    setRenameModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    renameTableName: string;
    setRenameTableName: React.Dispatch<React.SetStateAction<string>>;
    schemaNotice: Notice | null;
    setSchemaNotice: React.Dispatch<React.SetStateAction<Notice | null>>;
    isRenamingTable: boolean;
    currentAlterSQL: string;
    mysqlTypeOptions: string[];
    applyFieldSuggestion: (index: number, fieldName: string) => Promise<void>;
    handleGenerateFieldComment: (index: number) => Promise<void>;
    updateDraftField: <K extends keyof SchemaDraftField>(index: number, key: K, value: SchemaDraftField[K]) => void;
    handleAddField: () => void;
    handleDeleteDraftField: (index: number) => void;
    handleRenameTable: () => Promise<void>;
    handleExportDDL: () => Promise<void>;
    handleCopyDDL: () => void;
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
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [renameTableName, setRenameTableName] = useState("");
    const [schemaNotice, setSchemaNotice] = useState<Notice | null>(null);
    const [isRenamingTable, setIsRenamingTable] = useState(false);

    const currentAlterSQL = useMemo(() => buildAlterSQL(tableDetail, selectedTable, schemaDraftFields), [tableDetail, selectedTable, schemaDraftFields]);

    const mysqlFieldTypes = [
        "tinyint", "smallint", "mediumint", "int", "bigint",
        "float", "double", "decimal",
        "date", "datetime", "timestamp", "time", "year",
        "char", "varchar", "tinytext", "text", "mediumtext", "longtext",
        "binary", "varbinary", "tinyblob", "blob", "mediumblob", "longblob",
        "enum", "set",
        "json",
    ];

    const mysqlTypeOptions = useMemo(() => {
        const dynamicTypes = schemaDraftFields.map((item) => item.type).filter(Boolean);
        return [...new Set([...mysqlFieldTypes, ...dynamicTypes])];
    }, [schemaDraftFields]);

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
            current.map((field, itemIndex) =>
                itemIndex === index
                    ? {
                          ...field,
                          [key]: value,
                      }
                    : field,
            ),
        );
    }

    function handleAddField() {
        setSchemaDraftFields((current) => [
            ...current,
            {
                id: browserGeneratedID(),
                originName: "",
                name: "",
                type: "varchar(255)",
                nullable: true,
                defaultValue: "",
                comment: "",
                primary: false,
                autoIncrement: false,
                needsAiComment: true,
                aiLoading: false,
            },
        ]);
    }

    function handleDeleteDraftField(index: number) {
        setSchemaDraftFields((current) => current.filter((_, itemIndex) => itemIndex !== index));
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

    return {
        schemaDraftFields,
        setSchemaDraftFields,
        renameModalOpen,
        setRenameModalOpen,
        renameTableName,
        setRenameTableName,
        schemaNotice,
        setSchemaNotice,
        isRenamingTable,
        currentAlterSQL,
        mysqlTypeOptions,
        applyFieldSuggestion,
        handleGenerateFieldComment,
        updateDraftField,
        handleAddField,
        handleDeleteDraftField,
        handleRenameTable,
        handleExportDDL,
        handleCopyDDL,
    };
}
