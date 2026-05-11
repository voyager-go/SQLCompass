import type { TaskRecord } from "../types/task";
import { TASK_TYPE_LABELS } from "../types/task";

type TaskProgressOverlayProps = {
    taskIds: string[];
    tasks: TaskRecord[];
    onDismiss: (id: string) => void;
    onGoToTaskCenter: () => void;
};

export function TaskProgressOverlay({ taskIds, tasks, onDismiss, onGoToTaskCenter }: TaskProgressOverlayProps) {
    if (taskIds.length === 0) return null;

    const activeTasks = taskIds
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t): t is TaskRecord => !!t);

    if (activeTasks.length === 0) return null;

    return (
        <div className="task-progress-overlay">
            <div className="task-progress-overlay__card">
                <div className="task-progress-overlay__header">
                    <span className="task-progress-overlay__title">
                        {activeTasks.length === 1 ? "任务执行中" : `${activeTasks.length} 个任务执行中`}
                    </span>
                </div>
                <div className="task-progress-overlay__body">
                    {activeTasks.map((task) => (
                        <div key={task.id} className="task-progress-overlay__item">
                            <div className="task-progress-overlay__item-header">
                                <span className="task-progress-overlay__item-label">{task.label}</span>
                                <span className={`task-progress-overlay__item-status task-progress-overlay__item-status--${task.status}`}>
                                    {task.status === "running" ? `${Math.round(task.progress)}%` : task.status === "completed" ? "完成" : "失败"}
                                </span>
                            </div>
                            <div className="task-progress-overlay__bar-track">
                                <div
                                    className={`task-progress-overlay__bar-fill task-progress-overlay__bar-fill--${task.status}`}
                                    style={{ width: `${task.progress}%` }}
                                />
                            </div>
                            {task.message && (
                                <div className="task-progress-overlay__item-message">{task.message}</div>
                            )}
                            {task.error && (
                                <div className="task-progress-overlay__item-error">{task.error}</div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="task-progress-overlay__footer">
                    <button type="button" className="ghost-button" onClick={onGoToTaskCenter}>
                        查看任务中心
                    </button>
                    {activeTasks.length === 1 && activeTasks[0].status !== "running" ? (
                        <button type="button" className="primary-button" onClick={() => onDismiss(activeTasks[0].id)}>
                            关闭
                        </button>
                    ) : (
                        <button type="button" className="ghost-button" onClick={() => activeTasks.forEach((t) => onDismiss(t.id))}>
                            后台运行
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

type TaskCenterPageProps = {
    tasks: TaskRecord[];
    onClearCompleted: () => void;
    onRemoveTask: (id: string) => void;
};

export function TaskCenterPage({ tasks, onClearCompleted, onRemoveTask }: TaskCenterPageProps) {
    const running = tasks.filter((t) => t.status === "running");
    const completed = tasks.filter((t) => t.status === "completed");
    const failed = tasks.filter((t) => t.status === "failed");
    const finished = [...completed, ...failed].sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

    return (
        <div className="task-center">
            <div className="task-center__header">
                <h2>任务中心</h2>
                {finished.length > 0 && (
                    <button type="button" className="ghost-button" onClick={onClearCompleted}>
                        清除已完成
                    </button>
                )}
            </div>

            {tasks.length === 0 ? (
                <div className="task-center__empty">暂无任务记录</div>
            ) : (
                <>
                    {running.length > 0 && (
                        <div className="task-center__section">
                            <h3 className="task-center__section-title">进行中</h3>
                            <div className="task-center__list">
                                {running.map((task) => (
                                    <TaskCard key={task.id} task={task} onRemove={onRemoveTask} />
                                ))}
                            </div>
                        </div>
                    )}

                    {finished.length > 0 && (
                        <div className="task-center__section">
                            <h3 className="task-center__section-title">已完成</h3>
                            <div className="task-center__list">
                                {finished.map((task) => (
                                    <TaskCard key={task.id} task={task} onRemove={onRemoveTask} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function TaskCard({ task, onRemove }: { task: TaskRecord; onRemove: (id: string) => void }) {
    const typeLabel = TASK_TYPE_LABELS[task.type] ?? task.type;
    const duration =
        task.finishedAt && task.createdAt
            ? ((task.finishedAt - task.createdAt) / 1000).toFixed(1) + "s"
            : undefined;

    return (
        <div className={`task-card task-card--${task.status}`}>
            <div className="task-card__header">
                <span className="task-card__type">{typeLabel}</span>
                <span className={`task-card__status task-card__status--${task.status}`}>
                    {task.status === "running" ? "进行中" : task.status === "completed" ? "已完成" : "失败"}
                </span>
            </div>
            <div className="task-card__label">{task.label}</div>
            <div className="task-card__meta">
                <span>{task.connectionName}</span>
                <span>·</span>
                <span>{task.database}</span>
                {task.status === "running" && <span>· {Math.round(task.progress)}%</span>}
                {duration && <span>· 耗时 {duration}</span>}
            </div>
            {task.status === "running" && (
                <div className="task-card__bar-track">
                    <div
                        className="task-card__bar-fill task-card__bar-fill--running"
                        style={{ width: `${task.progress}%` }}
                    />
                </div>
            )}
            {task.message && task.status === "running" && (
                <div className="task-card__message">{task.message}</div>
            )}
            {task.error && (
                <div className="task-card__error">{task.error}</div>
            )}
            {task.status !== "running" && (
                <button
                    type="button"
                    className="task-card__remove"
                    onClick={() => onRemove(task.id)}
                    title="移除记录"
                >
                    ✕
                </button>
            )}
        </div>
    );
}
