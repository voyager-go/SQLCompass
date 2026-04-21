interface OptimizeReviewModalProps {
    optimizeReview: {
        target: "full" | "selection";
        sql: string;
        reasoning: string;
        prompt: string;
        analysis: any;
    } | null;
    setOptimizeReview: (v: OptimizeReviewModalProps["optimizeReview"]) => void;
    isOptimizingSQL: boolean;
    handleRetryOptimizeReview: () => void;
    handleApplyOptimizeReview: () => void;
}

export function OptimizeReviewModal({
    optimizeReview,
    setOptimizeReview,
    isOptimizingSQL,
    handleRetryOptimizeReview,
    handleApplyOptimizeReview,
}: OptimizeReviewModalProps) {
    if (!optimizeReview) return null;

    return (
        <div className="modal-backdrop" onClick={() => setOptimizeReview(null)}>
            <div className="modal-card modal-card--wide" onClick={(event) => event.stopPropagation()}>
                <div className="section-title">
                    <div>
                        <h3>AI 优化建议</h3>
                        <p>AI 会先解释为什么这么优化，你确认后才会回填到编辑器。</p>
                    </div>
                </div>
                <div className="form-grid">
                    <label className="field field--full">
                        <span>优化提示词</span>
                        <textarea
                            value={optimizeReview.prompt}
                            onChange={(event) => setOptimizeReview({ ...optimizeReview, prompt: event.target.value })}
                            rows={3}
                            placeholder="可补充约束，例如：尽量减少子查询、保持索引友好、不要改动 where 条件"
                        />
                    </label>
                </div>
                <div className="notice notice--info">{optimizeReview.reasoning}</div>
                <div className="code-block code-block--light">
                    <pre>{optimizeReview.sql}</pre>
                </div>
                <div className="toolbar-actions toolbar-actions--end">
                    <button type="button" className="ghost-button" onClick={() => setOptimizeReview(null)}>
                        取消
                    </button>
                    <button type="button" className="ghost-button" onClick={handleRetryOptimizeReview} disabled={isOptimizingSQL}>
                        {isOptimizingSQL ? "优化中..." : "再次优化"}
                    </button>
                    <button type="button" className="primary-button" onClick={handleApplyOptimizeReview}>
                        确认回填
                    </button>
                </div>
            </div>
        </div>
    );
}
