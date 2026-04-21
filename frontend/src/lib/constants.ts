export type NoticeTone = "success" | "error" | "info";
export type WorkbenchPage = "connections" | "query" | "history" | "schema" | "transfer" | "ai" | "theme" | "settings";
export type WorkMode = "normal" | "chat";
export type ThemeMode = "light" | "dark" | "custom";

export type PageEntry = {
    id: WorkbenchPage;
    label: string;
    summary: string;
};

export const WORKBENCH_PAGES: PageEntry[] = [
    { id: "connections", label: "连接管理", summary: "切换与维护连接" },
    { id: "history", label: "历史查询", summary: "按连接回看 SQL" },
    { id: "ai", label: "AI 设置", summary: "模型与注释助手" },
    { id: "theme", label: "自定义主题", summary: "个性化外观设置" },
    { id: "settings", label: "系统设置", summary: "存储路径与数据管理" },
];

export const SLASH_COMMANDS = [
    { key: "database", label: "/database", desc: "选择数据库" },
    { key: "table", label: "/table", desc: "选择数据表" },
] as const;

export const SLASH_PAGE_SIZE = 20;


