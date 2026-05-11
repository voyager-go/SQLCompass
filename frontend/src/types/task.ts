export type TaskType = "export-structure" | "export-structure-data" | "import-sql" | "import-csv" | "export-query-sql" | "export-query-csv" | "export-query-xls";

export type TaskStatus = "running" | "completed" | "failed";

export type TaskRecord = {
    id: string;
    type: TaskType;
    label: string;
    status: TaskStatus;
    progress: number;       // 0~100
    total?: number;          // 总步骤数
    current?: number;        // 当前步骤
    message?: string;        // 进度描述
    error?: string;          // 失败原因
    connectionName: string;
    database: string;
    createdAt: number;       // 时间戳
    finishedAt?: number;     // 完成时间戳
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
    "export-structure": "导出结构",
    "export-structure-data": "导出结构及数据",
    "import-sql": "导入 SQL",
    "import-csv": "导入 CSV",
    "export-query-sql": "导出查询结果(SQL)",
    "export-query-csv": "导出查询结果(CSV)",
    "export-query-xls": "导出查询结果(Excel)",
};
