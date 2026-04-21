interface DeleteDialogModalProps {
    deleteDialog: { statement: string; count: number } | null;
    setDeleteDialog: (v: null) => void;
    isExecutingQuery: boolean;
    handleConfirmDeleteSelectedRows: () => void;
}

export function DeleteDialogModal({
    deleteDialog,
    setDeleteDialog,
    isExecutingQuery,
    handleConfirmDeleteSelectedRows,
}: DeleteDialogModalProps) {
    if (!deleteDialog) return null;

    return (
        <div className="modal-backdrop" onClick={() => setDeleteDialog(null)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                <div className="section-title">
                    <div>
                        <h3>确认删除选中项</h3>
                        <p>将从当前表中删除 {deleteDialog.count} 条已勾选数据，这个操作不可撤销。</p>
                    </div>
                </div>
                <div className="code-block code-block--light">
                    <pre>{deleteDialog.statement}</pre>
                </div>
                <div className="toolbar-actions toolbar-actions--end">
                    <button type="button" className="ghost-button" onClick={() => setDeleteDialog(null)}>
                        取消
                    </button>
                    <button type="button" className="primary-button" onClick={handleConfirmDeleteSelectedRows} disabled={isExecutingQuery}>
                        {isExecutingQuery ? "删除中..." : "确认删除"}
                    </button>
                </div>
            </div>
        </div>
    );
}
