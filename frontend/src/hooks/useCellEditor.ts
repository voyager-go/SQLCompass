import { useState } from "react";
import { ExecuteQuery } from "../../wailsjs/go/main/App";
import { toEditorValue, fromEditorValue, stringifySQLValue, stringifyResultSQLValue, getErrorMessage } from "../lib/utils";
import type { NoticeTone } from "../lib/constants";
import type { ConnectionProfile } from "../types/workspace";
import type { TableDetail } from "../types/runtime";

export type CellEditorState = {
    rowKey: string;
    row: Record<string, string>;
    column: string;
    fieldType: string;
    originalValue: string;
    nextValue: string;
};

type PreviewContext = {
    connectionId: string;
    database: string;
    table: string;
};

type Notice = {
    tone: NoticeTone;
    message: string;
};

export function useCellEditor({
    previewContext,
    tableDetail,
    selectedTable,
    primaryFieldNames,
    selectedConnection,
    selectedDatabase,
    queryPageSize,
    queryPage,
    handlePreviewTable,
    pushToast,
    setQueryNotice,
}: {
    previewContext: PreviewContext | null;
    tableDetail: TableDetail | null;
    selectedTable: string;
    primaryFieldNames: string[];
    selectedConnection: ConnectionProfile | null;
    selectedDatabase: string;
    queryPageSize: number;
    queryPage: number;
    handlePreviewTable: (db: string, table: string, page?: number) => Promise<void>;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
    setQueryNotice: React.Dispatch<React.SetStateAction<Notice | null>>;
}) {
    const [cellEditor, setCellEditor] = useState<CellEditorState | null>(null);
    const [isSavingCell, setIsSavingCell] = useState(false);
    const [cellEditorError, setCellEditorError] = useState<string | null>(null);

    function openCellEditor(row: Record<string, string>, rowKey: string, column: string) {
        if (!tableDetail) {
            return;
        }
        // 允许编辑的条件：previewContext 匹配当前表，或 selectedTable 匹配当前表结构
        const expectedTable = previewContext?.table ?? selectedTable;
        if (expectedTable !== tableDetail.table) {
            return;
        }

        const field = tableDetail.fields.find((item: { name: string }) => item.name === column);
        if (!field) {
            return;
        }

        setCellEditorError(null);
        setCellEditor({
            rowKey,
            row,
            column,
            fieldType: field.type,
            originalValue: row[column] ?? "",
            nextValue: toEditorValue(row[column] ?? "", field.type),
        });
    }

    function quoteIdentifier(name: string): string {
        const engine = selectedConnection?.engine ?? "mysql";
        if (["postgresql", "sqlite"].includes(engine)) {
            return `"${name.replace(/"/g, "\"\"")}"`;
        }
        return `\`${name.replace(/`/g, "``")}\``;
    }

    function buildCellUpdateStatement(editorState: CellEditorState): string {
        const nextValue = fromEditorValue(editorState.nextValue, editorState.fieldType);
        const qTable = quoteIdentifier(selectedTable);
        const qColumn = quoteIdentifier(editorState.column);
        const qPrimaryFields = primaryFieldNames
            .map((fieldName) => `${quoteIdentifier(fieldName)} = ${stringifyResultSQLValue(editorState.row[fieldName] ?? "")}`)
            .join(" AND ");
        return `UPDATE ${qTable}\nSET ${qColumn} = ${stringifySQLValue(nextValue)}\nWHERE ${qPrimaryFields};`;
    }

    async function handleConfirmCellEdit() {
        if (!cellEditor || !selectedConnection || !selectedDatabase || !selectedTable) {
            return;
        }

        try {
            setIsSavingCell(true);
            const statement = buildCellUpdateStatement(cellEditor);
            await ExecuteQuery({
                connectionId: selectedConnection.id,
                database: selectedDatabase,
                sql: statement,
                page: 1,
                pageSize: queryPageSize,
            });
            await handlePreviewTable(selectedDatabase, selectedTable, queryPage);
            setCellEditor(null);
            pushToast("success", "字段已更新", `${cellEditor.column} 已保存`);
        } catch (error) {
            const message = getErrorMessage(error);
            setCellEditorError(message);
        } finally {
            setIsSavingCell(false);
        }
    }

    return {
        cellEditor,
        setCellEditor,
        isSavingCell,
        cellEditorError,
        setCellEditorError,
        openCellEditor,
        handleConfirmCellEdit,
    };
}
