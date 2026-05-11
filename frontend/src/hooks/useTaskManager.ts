import { useCallback, useRef, useState } from "react";
import type { TaskRecord, TaskStatus, TaskType } from "../types/task";

let taskSeq = 0;
function nextTaskId(): string {
    taskSeq++;
    return `task-${Date.now()}-${taskSeq}`;
}

export function useTaskManager() {
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [activeTaskIds, setActiveTaskIds] = useState<string[]>([]);
    const tasksRef = useRef(tasks);
    tasksRef.current = tasks;

    const createTask = useCallback((params: {
        type: TaskType;
        label: string;
        connectionName: string;
        database: string;
        total?: number;
    }): TaskRecord => {
        const task: TaskRecord = {
            id: nextTaskId(),
            type: params.type,
            label: params.label,
            status: "running",
            progress: 0,
            total: params.total,
            current: 0,
            message: "准备中...",
            connectionName: params.connectionName,
            database: params.database,
            createdAt: Date.now(),
        };
        setTasks((prev) => [task, ...prev]);
        setActiveTaskIds((prev) => [...prev, task.id]);
        return task;
    }, []);

    const updateTask = useCallback((id: string, patch: Partial<Pick<TaskRecord, "progress" | "current" | "message" | "status" | "error" | "total">>) => {
        setTasks((prev) =>
            prev.map((t) => {
                if (t.id !== id) return t;
                return { ...t, ...patch };
            })
        );
    }, []);

    const completeTask = useCallback((id: string, message?: string) => {
        setTasks((prev) =>
            prev.map((t) => {
                if (t.id !== id) return t;
                return { ...t, status: "completed" as TaskStatus, progress: 100, message: message ?? "已完成", finishedAt: Date.now() };
            })
        );
        // 延迟从 activeTaskIds 中移除
        setTimeout(() => {
            setActiveTaskIds((prev) => prev.filter((tid) => tid !== id));
        }, 800);
    }, []);

    const failTask = useCallback((id: string, error: string) => {
        setTasks((prev) =>
            prev.map((t) => {
                if (t.id !== id) return t;
                return { ...t, status: "failed" as TaskStatus, error, message: "失败", finishedAt: Date.now() };
            })
        );
        setTimeout(() => {
            setActiveTaskIds((prev) => prev.filter((tid) => tid !== id));
        }, 1200);
    }, []);

    const dismissActiveTask = useCallback((id: string) => {
        setActiveTaskIds((prev) => prev.filter((tid) => tid !== id));
    }, []);

    const clearCompletedTasks = useCallback(() => {
        setTasks((prev) => prev.filter((t) => t.status === "running"));
    }, []);

    const removeTask = useCallback((id: string) => {
        setTasks((prev) => prev.filter((t) => t.id !== id));
        setActiveTaskIds((prev) => prev.filter((tid) => tid !== id));
    }, []);

    return {
        tasks,
        activeTaskIds,
        createTask,
        updateTask,
        completeTask,
        failTask,
        dismissActiveTask,
        clearCompletedTasks,
        removeTask,
    };
}
