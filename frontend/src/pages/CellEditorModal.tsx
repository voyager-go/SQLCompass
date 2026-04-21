import { copyText, editorInputType, fromEditorValue } from "../lib/utils";

interface CellEditorModalProps {
    cellEditor: {
        rowKey: string;
        row: Record<string, string>;
        column: string;
        fieldType: string;
        originalValue: string;
        nextValue: string;
    } | null;
    setCellEditor: React.Dispatch<React.SetStateAction<{
        rowKey: string;
        row: Record<string, string>;
        column: string;
        fieldType: string;
        originalValue: string;
        nextValue: string;
    } | null>>;
    isSavingCell: boolean;
    handleConfirmCellEdit: () => void;
    pushToast: (tone: "success" | "error" | "info", title: string, message: string) => void;
}

export function CellEditorModal({
    cellEditor,
    setCellEditor,
    isSavingCell,
    handleConfirmCellEdit,
    pushToast,
}: CellEditorModalProps) {
    if (!cellEditor) return null;

    return (
        <div className="modal-backdrop" onClick={() => setCellEditor(null)}>
            <div className="modal-card modal-card--wide" onClick={(event) => event.stopPropagation()}>
                <div className="section-title">
                    <div>
                        <h3>编辑字段</h3>
                        <p>{cellEditor.column} · {cellEditor.fieldType}</p>
                    </div>
                </div>
                <label className="field field--full">
                    <span>字段值</span>
                    {/(text|blob|json|longtext|mediumtext|tinytext)/i.test(cellEditor.fieldType) ? (
                        <textarea
                            value={cellEditor.nextValue}
                            onChange={(event) => setCellEditor((current) => (current ? { ...current, nextValue: event.target.value } : current))}
                            rows={8}
                        />
                    ) : (
                        <input
                            type={editorInputType(cellEditor.fieldType)}
                            value={cellEditor.nextValue}
                            onChange={(event) => setCellEditor((current) => (current ? { ...current, nextValue: event.target.value } : current))}
                        />
                    )}
                </label>
                <div className="cell-editor-toolbar">
                    <button type="button" className="ghost-button" onClick={() => {
                        copyText(fromEditorValue(cellEditor.nextValue, cellEditor.fieldType));
                        pushToast("success", "复制成功", "字段值已复制到剪贴板");
                    }}>
                        复制
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setCellEditor(null)}>
                        取消
                    </button>
                    <button type="button" className="primary-button" onClick={handleConfirmCellEdit} disabled={isSavingCell}>
                        {isSavingCell ? "保存中..." : "确认"}
                    </button>
                </div>
            </div>
        </div>
    );
}
