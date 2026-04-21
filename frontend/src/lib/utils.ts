export function formatDateTime(value: string): string {
    try {
        return new Intl.DateTimeFormat("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value));
    } catch {
        return value;
    }
}

export async function copyText(value: string): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
        document.execCommand("copy");
    } finally {
        document.body.removeChild(textarea);
    }
}

export function isTextLikeType(type: string): boolean {
    return /(text|blob|json|longtext|mediumtext|tinytext)/i.test(type);
}

export function formatCellPreview(value: string, type: string): string {
    if (!isTextLikeType(type)) {
        return value;
    }

    const normalized = (value || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= 48) {
        return normalized;
    }
    return `${normalized.slice(0, 48)}...`;
}

export function editorInputType(type: string): "text" | "date" | "time" | "datetime-local" {
    if (/^date$/i.test(type)) {
        return "date";
    }
    if (/^time/i.test(type)) {
        return "time";
    }
    if (/(datetime|timestamp)/i.test(type)) {
        return "datetime-local";
    }
    return "text";
}

export function toEditorValue(value: string, type: string): string {
    const normalized = value ?? "";
    if (editorInputType(type) === "datetime-local") {
        return normalized.replace(" ", "T").slice(0, 16);
    }
    return normalized;
}

export function fromEditorValue(value: string, type: string): string {
    if (editorInputType(type) === "datetime-local") {
        return value ? value.replace("T", " ") : "";
    }
    return value;
}

export function escapeHTML(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
