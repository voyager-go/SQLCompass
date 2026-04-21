import { useCallback, useMemo, useState } from "react";
import { ChatWithDatabase, ExecuteQuery, RepairChatSQL } from "../../wailsjs/go/main/App";
import type {
    ChatDisplayMode,
    ChatEntry,
    ChatPendingAction,
    ChatDropPayload,
    ChatDatabaseResponse,
    ChatMessage,
    ExplorerTree,
    QueryResult,
    SQLAnalysis,
} from "../types/runtime";
import type { ConnectionProfile } from "../types/workspace";
import { SLASH_COMMANDS, SLASH_PAGE_SIZE } from "../lib/constants";
import { browserGeneratedID, copyText, getErrorMessage, stripSlashCommand, summarizeChatResult, appendUnique } from "../lib/utils";

type NoticeTone = "success" | "error" | "info";

export interface UseChatDeps {
    selectedConnection: ConnectionProfile | null;
    selectedDatabase: string;
    selectedTable: string;
    queryPageSize: number;
    previewPageSize: number;
    explorerTree: ExplorerTree | null;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
    setQueryResult: (v: QueryResult | null) => void;
    setLastExecutedSQL: (v: string) => void;
    setQueryPage: (v: number) => void;
    setPreviewContext: (v: { connectionId: string; database: string; table: string } | null) => void;
    setSQLAnalysis: (v: SQLAnalysis | null) => void;
    setQueryErrorDetail: (v: string) => void;
    loadHistory: (connectionId: string) => Promise<void>;
    handleSelectDatabase: (databaseName: string) => void;
}

export function useChat(deps: UseChatDeps) {
    const {
        selectedConnection,
        selectedDatabase,
        selectedTable,
        queryPageSize,
        previewPageSize,
        explorerTree,
        pushToast,
        setQueryResult,
        setLastExecutedSQL,
        setQueryPage,
        setPreviewContext,
        setSQLAnalysis,
        setQueryErrorDetail,
        loadHistory,
        handleSelectDatabase,
    } = deps;

    const [chatDisplayMode, setChatDisplayMode] = useState<ChatDisplayMode>("summary");
    const [chatInput, setChatInput] = useState("");
    const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
    const [chatPendingAction, setChatPendingAction] = useState<ChatPendingAction | null>(null);
    const [chatContextDatabase, setChatContextDatabase] = useState("");
    const [chatContextTables, setChatContextTables] = useState<string[]>([]);
    const [chatDropActive, setChatDropActive] = useState(false);
    const [slashMenuOpen, setSlashMenuOpen] = useState(false);
    const [slashMenuType, setSlashMenuType] = useState<"command" | "database" | "table">("command");
    const [slashMenuFilter, setSlashMenuFilter] = useState("");
    const [slashMenuPage, setSlashMenuPage] = useState(0);
    const [slashMenuDB, setSlashMenuDB] = useState("");
    const [slashMenuStart, setSlashMenuStart] = useState(0);
    const [slashMenuActiveIndex, setSlashMenuActiveIndex] = useState(0);
    const [isRunningChat, setIsRunningChat] = useState(false);

    const slashMenuItems = useMemo(() => {
        if (slashMenuType === "command") {
            return SLASH_COMMANDS.filter((c) => c.key.includes(slashMenuFilter)).map((item) => ({
                key: item.key,
                label: item.label,
                desc: item.desc,
                tone: "command" as const,
            }));
        }

        if (slashMenuType === "database" && explorerTree) {
            return explorerTree.databases
                .filter((db) => !db.isSystem && db.name.toLowerCase().includes(slashMenuFilter))
                .map((db) => ({
                    key: db.name,
                    label: db.name,
                    desc: `${db.tableCount} 张表`,
                    tone: "database" as const,
                }));
        }

        if (slashMenuType === "table" && explorerTree) {
            const dbName = slashMenuDB || selectedDatabase;
            if (!dbName) {
                return explorerTree.databases
                    .filter((db) => !db.isSystem)
                    .flatMap((db) =>
                        db.tables
                            .filter((table) => table.name.toLowerCase().includes(slashMenuFilter))
                            .map((table) => ({
                                key: `${db.name}.${table.name}`,
                                label: table.name,
                                desc: `${db.name} · ${table.rows === -1 ? "..." : table.rows >= 0 ? table.rows.toLocaleString() : "-"} 行`,
                                tone: "table" as const,
                            })),
                    );
            }

            const db = explorerTree.databases.find((item) => item.name === dbName);
            if (!db) {
                return [];
            }

            return db.tables
                .filter((table) => table.name.toLowerCase().includes(slashMenuFilter))
                .map((table) => ({
                    key: table.name,
                    label: table.name,
                    desc: `${table.rows === -1 ? "..." : table.rows >= 0 ? table.rows.toLocaleString() : "-"} 行`,
                    tone: "table" as const,
                }));
        }

        return [];
    }, [explorerTree, selectedDatabase, slashMenuDB, slashMenuFilter, slashMenuType]);

    const slashMenuTotalPages = Math.max(1, Math.ceil(slashMenuItems.length / SLASH_PAGE_SIZE));
    const slashMenuPageSafe = Math.min(slashMenuPage, slashMenuTotalPages - 1);
    const pagedSlashMenuItems = useMemo(
        () => slashMenuItems.slice(slashMenuPageSafe * SLASH_PAGE_SIZE, (slashMenuPageSafe + 1) * SLASH_PAGE_SIZE),
        [slashMenuItems, slashMenuPageSafe],
    );

    const handleSendChatMessage = useCallback(async (rawMessage?: string) => {
        const message = (rawMessage ?? chatInput).trim();
        if (!message || !selectedConnection) {
            return;
        }

        const effectiveDatabase = chatContextDatabase || selectedDatabase;
        const effectiveTables = chatContextTables.length > 0 ? chatContextTables : selectedTable ? [selectedTable] : [];
        const selectedTableText = effectiveTables.join(", ");
        const contextualMessage = [
            effectiveDatabase ? `当前数据库：${effectiveDatabase}` : "",
            selectedTableText ? `限定数据表：${selectedTableText}` : "",
            message,
        ]
            .filter(Boolean)
            .join("\n");

        const nextUserMessage: ChatEntry = {
            id: browserGeneratedID(),
            role: "user",
            content: message,
        };
        const nextHistory: ChatMessage[] = [...chatMessages, nextUserMessage].slice(-8).map((item) => ({
            role: item.role,
            content: item.content,
        }));

        setChatMessages((current) => [...current, nextUserMessage]);
        setChatInput("");
        setIsRunningChat(true);

        try {
            const response = (await ChatWithDatabase({
                connectionId: selectedConnection.id,
                database: effectiveDatabase,
                selectedTable: selectedTableText,
                message: contextualMessage,
                history: nextHistory,
                displayMode: chatDisplayMode,
            })) as ChatDatabaseResponse;

            if (response.sql && !response.requiresConfirm) {
                await executeChatSQL(response.sql, response.displayMode as ChatDisplayMode, response.reply, contextualMessage, response.reasoning, 0);
                return;
            }

            const assistantMessage: ChatEntry = {
                id: browserGeneratedID(),
                role: "assistant",
                content: response.reply || "AI 已完成本轮分析。",
                sql: response.sql,
                reasoning: response.reasoning,
                displayMode: (response.displayMode as ChatDisplayMode) || chatDisplayMode,
            };
            setChatMessages((current) => [...current, assistantMessage]);

            if (response.sql && response.requiresConfirm) {
                setChatPendingAction({
                    reply: response.reply,
                    sql: response.sql,
                    analysis: response.analysis,
                    displayMode: (response.displayMode as ChatDisplayMode) || "summary",
                    reasoning: response.reasoning,
                    userMessage: contextualMessage,
                });
            }
        } catch (error) {
            const messageText = getErrorMessage(error);
            setChatMessages((current) => [
                ...current,
                {
                    id: browserGeneratedID(),
                    role: "assistant",
                    content: `处理失败：${messageText}`,
                },
            ]);
        } finally {
            setIsRunningChat(false);
        }
    }, [chatInput, chatMessages, chatDisplayMode, selectedConnection, selectedDatabase, selectedTable, chatContextDatabase, chatContextTables]);

    const handleCopyText = useCallback(async (text: string, label?: string) => {
        try {
            await copyText(text);
            pushToast("success", "已复制", label ? `${label} 已复制到剪贴板` : "内容已复制到剪贴板");
        } catch {
            pushToast("error", "复制失败", "请稍后重试");
        }
    }, [pushToast]);

    const handleCopyUserMessage = useCallback((item: ChatEntry) => {
        handleCopyText(item.content, "消息");
    }, [handleCopyText]);

    const handleEditUserMessage = useCallback((item: ChatEntry) => {
        setChatInput(item.content);
        const textarea = document.querySelector(".chat-composer textarea") as HTMLTextAreaElement;
        if (textarea) {
            textarea.focus();
            textarea.selectionStart = item.content.length;
            textarea.selectionEnd = item.content.length;
        }
    }, []);

    const handleCopyChatMessage = useCallback(async (item: ChatEntry) => {
        let text = "";
        if (item.role === "assistant") {
            const parts: string[] = [item.content];
            if (item.sql) parts.push(`\n--- SQL ---\n${item.sql}`);
            if (item.result) {
                parts.push(`\n--- 查询结果 (${item.result.statementType || "SELECT"} | ${item.result.rows.length} 行 | ${item.result.durationMs}ms) ---`);
                const header = (item.result.columns ?? []).join("\t");
                const rows = item.result.rows.slice(0, 20).map((r: Record<string, string>) => (item.result?.columns ?? []).map((c: string) => r[c] ?? "").join("\t"));
                parts.push([header, ...rows].join("\n"));
                if (item.result.rows.length > 20) {
                    parts.push(`\n... 共 ${item.result.rows.length} 行，仅展示前 20 行 ...`);
                }
            }
            text = parts.join("\n\n");
        } else {
            text = item.content;
        }
        await handleCopyText(text, item.role === "assistant" ? "对话" : "消息");
    }, [handleCopyText]);

    const handleCopyChatResult = useCallback(async (item: ChatEntry) => {
        if (!item.result) return;
        const cols = item.result.columns ?? [];
        const header = cols.join("\t");
        const rows = item.result.rows.slice(0, 50).map((r: Record<string, string>) => cols.map((c: string) => r[c] ?? "").join("\t"));
        const lines = [`查询类型：${item.result.statementType || "SELECT"}`, `耗时：${item.result.durationMs} ms`, `行数：${item.result.rows.length}`, "", header, ...rows];
        if (item.result.rows.length > 50) {
            lines.push("", `... 共 ${item.result.rows.length} 行，仅展示前 50 行 ...`);
        }
        await handleCopyText(lines.join("\n"), "查询结果");
    }, [handleCopyText]);

    const executeChatSQL = useCallback(async (
        statement: string,
        displayMode: ChatDisplayMode,
        replyPrefix = "",
        userMessage = "",
        previousReason = "",
        repairAttempt = 0,
    ) => {
        if (!selectedConnection) {
            return;
        }

        const effectiveDatabase = chatContextDatabase || selectedDatabase;
        const selectedTableText = chatContextTables.length > 0 ? chatContextTables.join(", ") : selectedTable;

        try {
            const result = (await ExecuteQuery({
                connectionId: selectedConnection.id,
                database: effectiveDatabase,
                sql: statement,
                page: 1,
                pageSize: displayMode === "table" ? previewPageSize : queryPageSize,
            })) as QueryResult;

            setQueryResult(result);
            setLastExecutedSQL(statement);
            setQueryPage(1);
            setPreviewContext(null);
            setSQLAnalysis(result.analysis);
            setQueryErrorDetail("");

            setChatMessages((current) => [
                ...current,
                {
                    id: browserGeneratedID(),
                    role: "assistant",
                    content:
                        displayMode === "table"
                            ? `${replyPrefix || "已执行 SQL。"} 已为你展示结果表格。`
                            : `${replyPrefix || "已执行 SQL。"} ${summarizeChatResult(result)} 耗时 ${result.durationMs} ms。`,
                    sql: statement,
                    result,
                    reasoning: previousReason,
                    displayMode,
                },
            ]);
            await loadHistory(selectedConnection.id);
        } catch (error) {
            const message = getErrorMessage(error);
            if (repairAttempt < 2) {
                try {
                    const repairHistory: ChatMessage[] = chatMessages.slice(-8).map((item) => ({
                        role: item.role,
                        content: item.content,
                    }));
                    const repair = (await RepairChatSQL({
                        connectionId: selectedConnection.id,
                        database: effectiveDatabase,
                        selectedTable: selectedTableText,
                        message: userMessage || statement,
                        attemptedSql: statement,
                        errorMessage: message,
                        previousReason: previousReason,
                        history: repairHistory,
                        displayMode,
                    })) as ChatDatabaseResponse;

                    setChatMessages((current) => [
                        ...current,
                        {
                            id: browserGeneratedID(),
                            role: "assistant",
                            content: repair.reply || `上一条 SQL 执行失败，我已根据报错继续修正。`,
                            sql: repair.sql || statement,
                            reasoning: repair.reasoning,
                        },
                    ]);

                    const repairedSQL = repair.sql?.trim() ?? "";
                    if (repairedSQL && repairedSQL !== statement.trim()) {
                        if (repair.requiresConfirm) {
                            setChatPendingAction({
                                reply: repair.reply,
                                sql: repairedSQL,
                                analysis: repair.analysis,
                                displayMode: (repair.displayMode as ChatDisplayMode) || displayMode,
                                reasoning: repair.reasoning,
                                userMessage: userMessage || statement,
                            });
                            return;
                        }

                        await executeChatSQL(
                            repairedSQL,
                            (repair.displayMode as ChatDisplayMode) || displayMode,
                            repair.reply || replyPrefix,
                            userMessage || statement,
                            repair.reasoning,
                            repairAttempt + 1,
                        );
                        return;
                    }

                    if (repair.mode === "ask" || !repairedSQL) {
                        return;
                    }
                } catch (repairError) {
                    const repairMessage = getErrorMessage(repairError);
                    setChatMessages((current) => [
                        ...current,
                        {
                            id: browserGeneratedID(),
                            role: "assistant",
                            content: `SQL 执行失败：${message}\n继续修正时又失败：${repairMessage}`,
                            sql: statement,
                        },
                    ]);
                    return;
                }
            }

            setChatMessages((current) => [
                ...current,
                {
                    id: browserGeneratedID(),
                    role: "assistant",
                    content: `SQL 执行失败：${message}`,
                    sql: statement,
                },
            ]);
        } finally {
            setChatPendingAction(null);
        }
    }, [selectedConnection, selectedDatabase, selectedTable, chatContextDatabase, chatContextTables, queryPageSize, previewPageSize, chatMessages, setQueryResult, setLastExecutedSQL, setQueryPage, setPreviewContext, setSQLAnalysis, setQueryErrorDetail, loadHistory]);

    const handleChatInputChange = useCallback((value: string, cursorPos?: number) => {
        setChatInput(value);
        const pos = cursorPos ?? value.length;
        const textBeforeCursor = value.substring(0, pos);
        const lastSlash = textBeforeCursor.lastIndexOf("/");
        const charBefore = lastSlash > 0 ? textBeforeCursor[lastSlash - 1] : "";

        if (lastSlash >= 0 && (lastSlash === 0 || /\s/.test(charBefore))) {
            const afterSlash = textBeforeCursor.substring(lastSlash + 1);
            const lowerAfter = afterSlash.toLowerCase();

            const commandWithFilter = SLASH_COMMANDS.find((c) =>
                lowerAfter === c.key || lowerAfter.startsWith(c.key + " ")
            );

            if (commandWithFilter) {
                setSlashMenuStart(lastSlash);
                const filterText = lowerAfter.startsWith(commandWithFilter.key + " ")
                    ? lowerAfter.substring(commandWithFilter.key.length + 1).trim()
                    : "";
                if (commandWithFilter.key === "database") {
                    setSlashMenuType("database");
                } else {
                    setSlashMenuType("table");
                }
                setSlashMenuFilter(filterText);
                setSlashMenuOpen(true);
                setSlashMenuPage(0);
                return;
            }

            if (!afterSlash.includes(" ")) {
                setSlashMenuStart(lastSlash);

                const exactMatch = SLASH_COMMANDS.find((c) => c.key === lowerAfter);
                if (exactMatch) {
                    if (exactMatch.key === "database") {
                        setSlashMenuType("database");
                    } else {
                        setSlashMenuType("table");
                    }
                    setSlashMenuFilter("");
                    setSlashMenuOpen(true);
                    setSlashMenuPage(0);
                    return;
                }

                const matchingCmds = SLASH_COMMANDS.filter((c) => c.key.startsWith(lowerAfter));
                if (matchingCmds.length === 1) {
                    if (matchingCmds[0].key === "database") {
                        setSlashMenuType("database");
                    } else {
                        setSlashMenuType("table");
                    }
                    setSlashMenuFilter("");
                } else if (slashMenuOpen && (slashMenuType === "database" || slashMenuType === "table")) {
                    setSlashMenuFilter(lowerAfter);
                } else {
                    setSlashMenuType("command");
                    setSlashMenuFilter(lowerAfter);
                }
                setSlashMenuOpen(true);
                setSlashMenuPage(0);
                return;
            }
        }
        setSlashMenuOpen(false);
    }, [slashMenuOpen, slashMenuType]);

    const handleSlashSelect = useCallback((item: string) => {
        if (slashMenuType === "command") {
            const before = chatInput.substring(0, slashMenuStart);
            const newText = before + "/" + item + " ";
            setChatInput(newText);
            if (item === "database") {
                setSlashMenuType("database");
                setSlashMenuFilter("");
            } else if (item === "table") {
                setSlashMenuType("table");
                setSlashMenuFilter("");
            }
            setSlashMenuOpen(true);
            setSlashMenuPage(0);
            setSlashMenuDB("");
        } else if (slashMenuType === "database") {
            const baseText = stripSlashCommand(chatInput, slashMenuStart);
            setChatInput(baseText ? `${baseText} ` : "");
            handleSelectDatabase(item);
            setSlashMenuOpen(false);
            setSlashMenuDB(item);
        } else if (slashMenuType === "table") {
            const baseText = stripSlashCommand(chatInput, slashMenuStart);
            setChatInput(baseText ? `${baseText} ` : "");
            if (item.includes(".")) {
                const [databaseName, tableName] = item.split(".", 2);
                handleSelectDatabase(databaseName);
                setChatContextTables((current) => appendUnique(current.filter((name) => name !== tableName), tableName));
                setSlashMenuDB(databaseName);
            } else {
                setChatContextTables((current) => appendUnique(current, item));
            }
            setSlashMenuOpen(false);
        }
    }, [slashMenuType, chatInput, slashMenuStart, handleSelectDatabase]);

    const handleChatDrop = useCallback((payload: ChatDropPayload) => {
        if (payload.kind === "database") {
            handleSelectDatabase(payload.database);
            return;
        }

        if (!payload.table) {
            return;
        }

        const tableName = payload.table;

        setChatContextDatabase(payload.database);
        setChatContextTables((current) => (chatContextDatabase && chatContextDatabase !== payload.database ? [tableName] : appendUnique(current, tableName)));
    }, [handleSelectDatabase, chatContextDatabase]);

    return {
        chatDisplayMode,
        setChatDisplayMode,
        chatInput,
        setChatInput,
        chatMessages,
        setChatMessages,
        chatPendingAction,
        setChatPendingAction,
        chatContextDatabase,
        setChatContextDatabase,
        chatContextTables,
        setChatContextTables,
        chatDropActive,
        setChatDropActive,
        slashMenuOpen,
        setSlashMenuOpen,
        slashMenuType,
        setSlashMenuType,
        slashMenuFilter,
        setSlashMenuFilter,
        slashMenuPage,
        setSlashMenuPage,
        slashMenuDB,
        setSlashMenuDB,
        slashMenuStart,
        setSlashMenuStart,
        slashMenuActiveIndex,
        setSlashMenuActiveIndex,
        isRunningChat,
        setIsRunningChat,
        slashMenuItems,
        slashMenuTotalPages,
        slashMenuPageSafe,
        pagedSlashMenuItems,
        handleSendChatMessage,
        handleCopyText,
        handleCopyUserMessage,
        handleEditUserMessage,
        handleCopyChatMessage,
        handleCopyChatResult,
        executeChatSQL,
        handleChatInputChange,
        handleSlashSelect,
        handleChatDrop,
    };
}
