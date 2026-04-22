const SQL_KEYWORDS = [
    "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "NULL", "IS", "IN", "EXISTS",
    "BETWEEN", "LIKE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
    "CREATE", "TABLE", "INDEX", "UNIQUE", "PRIMARY", "KEY", "FOREIGN", "REFERENCES",
    "ALTER", "DROP", "ADD", "COLUMN", "CONSTRAINT", "DEFAULT", "AUTO_INCREMENT",
    "IF", "ELSE", "WHEN", "THEN", "CASE", "END", "AS", "ON", "JOIN", "LEFT",
    "RIGHT", "INNER", "OUTER", "CROSS", "UNION", "ALL", "DISTINCT", "GROUP",
    "BY", "ORDER", "HAVING", "LIMIT", "OFFSET", "ASC", "DESC", "TRUNCATE",
    "SHOW", "DESCRIBE", "EXPLAIN", "USE", "DATABASE", "ENGINE", "CHARSET",
    "COLLATE", "COMMENT", "VARCHAR", "INT", "BIGINT", "TINYINT", "SMALLINT",
    "MEDIUMINT", "DECIMAL", "NUMERIC", "FLOAT", "DOUBLE", "REAL", "DATE",
    "TIME", "DATETIME", "TIMESTAMP", "YEAR", "CHAR", "TEXT", "BLOB", "JSON",
    "ENUM", "BOOLEAN", "SERIAL", "INT2", "INT4", "INT8", "FLOAT4", "FLOAT8",
    "BOOL", "BYTEA", "TIMESTAMPTZ", "UUID", "ARRAY", "BTREE", "HASH", "GIN",
    "GIST", "SPGIST", "BRIN", "FULLTEXT", "SPATIAL", "USING",
];

const kwSet = new Set(SQL_KEYWORDS);

export function highlightSQL(sql: string): string {
    if (!sql) return "";
    const tokens = tokenize(sql);
    return tokens
        .map((t) => {
            if (t.type === "comment") return `<span class="sh-cmt">${escapeHtml(t.value)}</span>`;
            if (t.type === "string") return `<span class="sh-str">${escapeHtml(t.value)}</span>`;
            if (t.type === "number") return `<span class="sh-num">${escapeHtml(t.value)}</span>`;
            if (t.type === "keyword") return `<span class="sh-kw">${escapeHtml(t.value)}</span>`;
            return escapeHtml(t.value);
        })
        .join("");
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function tokenize(sql: string) {
    const tokens: { type: string; value: string }[] = [];
    let i = 0;
    while (i < sql.length) {
        const ch = sql[i];
        if (ch === "-" && sql[i + 1] === "-") {
            let end = i + 2;
            while (end < sql.length && sql[end] !== "\n") end++;
            tokens.push({ type: "comment", value: sql.slice(i, end) });
            i = end;
            continue;
        }
        if (ch === "/" && sql[i + 1] === "*") {
            let end = i + 2;
            while (end < sql.length - 1 && !(sql[end] === "*" && sql[end + 1] === "/")) end++;
            end += 2;
            tokens.push({ type: "comment", value: sql.slice(i, end) });
            i = end;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === "`") {
            const quote = ch;
            let end = i + 1;
            while (end < sql.length && sql[end] !== quote) {
                if (sql[end] === "\\") end++;
                end++;
            }
            if (end < sql.length) end++;
            tokens.push({ type: "string", value: sql.slice(i, end) });
            i = end;
            continue;
        }
        if (/\d/.test(ch)) {
            let end = i + 1;
            while (end < sql.length && (/\d/.test(sql[end]) || sql[end] === ".")) end++;
            tokens.push({ type: "number", value: sql.slice(i, end) });
            i = end;
            continue;
        }
        if (/[a-zA-Z_]/.test(ch)) {
            let end = i + 1;
            while (end < sql.length && /[a-zA-Z0-9_]/.test(sql[end])) end++;
            const word = sql.slice(i, end);
            const upper = word.toUpperCase();
            tokens.push({ type: kwSet.has(upper) ? "keyword" : "word", value: word });
            i = end;
            continue;
        }
        tokens.push({ type: "other", value: ch });
        i++;
    }
    return tokens;
}
