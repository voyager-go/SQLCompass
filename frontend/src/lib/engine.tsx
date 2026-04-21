export const engineLabels: Record<string, string> = {
    mysql: "MySQL",
    mariadb: "MariaDB",
    postgresql: "PostgreSQL",
    sqlite: "SQLite",
    clickhouse: "ClickHouse",
    mongodb: "MongoDB",
    redis: "Redis",
};

export function EngineIcon({ engine, size = 18 }: { engine: string; size?: number }) {
    const s = size;
    const icons: Record<string, JSX.Element> = {
        mysql: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#00758F"/>
                <path d="M7 8c.5 0 1 .2 1.4.6.4.4.6.9.6 1.4 0 .5-.2 1-.6 1.4-.4.4-.9.6-1.4.6s-1-.2-1.4-.6c-.4-.4-.6-.9-.6-1.4 0-.5.2-1 .6-1.4.4-.4.9-.6 1.4-.6z" fill="#fff"/>
                <path d="M12 6c.8 0 1.5.3 2.1.9.6.6.9 1.3.9 2.1 0 .8-.3 1.5-.9 2.1-.6.6-1.3.9-2.1.9-.8 0-1.5-.3-2.1-.9-.6-.6-.9-1.3-.9-2.1 0-.8.3-1.5.9-2.1.6-.6 1.3-.9 2.1-.9z" fill="#F29111"/>
                <path d="M17 9c.5 0 1 .2 1.4.6.4.4.6.9.6 1.4 0 .5-.2 1-.6 1.4-.4.4-.9.6-1.4.6s-1-.2-1.4-.6c-.4-.4-.6-.9-.6-1.4 0-.5.2-1 .6-1.4.4-.4.9-.6 1.4-.6z" fill="#fff"/>
                <path d="M8 14c.4 0 .8.2 1.1.5.3.3.5.7.5 1.1 0 .4-.2.8-.5 1.1-.3.3-.7.5-1.1.5-.4 0-.8-.2-1.1-.5-.3-.3-.5-.7-.5-1.1 0-.4.2-.8.5-1.1.3-.3.7-.5 1.1-.5z" fill="#fff"/>
                <path d="M16 14c.4 0 .8.2 1.1.5.3.3.5.7.5 1.1 0 .4-.2.8-.5 1.1-.3.3-.7.5-1.1.5-.4 0-.8-.2-1.1-.5-.3-.3-.5-.7-.5-1.1 0-.4.2-.8.5-1.1.3-.3.7-.5 1.1-.5z" fill="#F29111"/>
                <path d="M12 16c.3 0 .6.1.8.3.2.2.3.5.3.8 0 .3-.1.6-.3.8-.2.2-.5.3-.8.3-.3 0-.6-.1-.8-.3-.2-.2-.3-.5-.3-.8 0-.3.1-.6.3-.8.2-.2.5-.3.8-.3z" fill="#fff"/>
            </svg>
        ),
        mariadb: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#003545"/>
                <circle cx="12" cy="12" r="8" fill="#1F6FB6"/>
                <path d="M12 5c-2 3-3 6-3 9s1 5.5 3 8c2-2.5 3-5 3-8s-1-6-3-9z" fill="#C49A6C"/>
                <path d="M9 8c.5 1.5 1 3.5 1 6s-.5 4.5-1 6" stroke="#003545" strokeWidth="0.8" fill="none"/>
                <path d="M15 8c-.5 1.5-1 3.5-1 6s.5 4.5 1 6" stroke="#003545" strokeWidth="0.8" fill="none"/>
            </svg>
        ),
        postgresql: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#336791"/>
                <path d="M12 4c-4.4 0-8 3.6-8 8s3.6 8 8 8c1.7 0 3.2-.5 4.5-1.4-1-1.5-1.8-3.2-2.3-4.8-.5-1.6-.7-3.2-.7-4.8 0-1.6.2-3.2.7-4.8.5-1.6 1.3-3.3 2.3-4.8C15.2 4.5 13.7 4 12 4z" fill="#fff"/>
                <path d="M16.5 4.6c-1 1.5-1.8 3.2-2.3 4.8-.5 1.6-.7 3.2-.7 4.8 0 1.6.2 3.2.7 4.8.5 1.6 1.3 3.3 2.3 4.8 2.3-1.6 3.8-4.2 3.8-7.2s-1.5-5.6-3.8-7.2z" fill="#336791"/>
                <circle cx="14" cy="10" r="1.5" fill="#336791"/>
                <path d="M7 6l-2-2M17 6l2-2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
        ),
        sqlite: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" fill="#003B57"/>
                <path d="M7 7h10" stroke="#44A8B3" strokeWidth="2" strokeLinecap="round"/>
                <path d="M7 11h7" stroke="#44A8B3" strokeWidth="2" strokeLinecap="round"/>
                <path d="M7 15h4" stroke="#44A8B3" strokeWidth="2" strokeLinecap="round"/>
                <path d="M15 13l4-4v10l-4-4" fill="#0F80CC"/>
            </svg>
        ),
        clickhouse: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="2" fill="#FFCC00"/>
                <rect x="5" y="5" width="4" height="14" rx="1" fill="#000"/>
                <rect x="11" y="9" width="4" height="10" rx="1" fill="#000"/>
                <rect x="17" y="13" width="3" height="6" rx="1" fill="#000"/>
            </svg>
        ),
        mongodb: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M12 2c-1.5 4-2 7.5-2 10.5s.8 6.5 2 9c1.2-2.5 2-5.5 2-9S13.5 6 12 2z" fill="#4FA94D"/>
                <path d="M12 2v19.5" stroke="#3E7B3D" strokeWidth="1"/>
                <path d="M9.5 5c.5 1.5.8 3.3.8 5.3 0 2-.3 4-.8 5.8" stroke="#70BF6E" strokeWidth="1" fill="none" strokeLinecap="round"/>
                <path d="M14.5 5c-.5 1.5-.8 3.3-.8 5.3 0 2 .3 4 .8 5.8" stroke="#70BF6E" strokeWidth="1" fill="none" strokeLinecap="round"/>
            </svg>
        ),
        redis: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <ellipse cx="12" cy="6" rx="8" ry="3" fill="#DC382D"/>
                <path d="M4 6v4c0 1.7 3.6 3 8 3s8-1.3 8-3V6" fill="#A82A26"/>
                <path d="M4 10v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4" fill="#DC382D"/>
                <path d="M4 14v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4" fill="#A82A26"/>
                <path d="M8 5c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5zM16 5c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5z" fill="#fff"/>
                <path d="M10 9c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5zM14 9c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5z" fill="#fff"/>
                <path d="M9 13c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5zM15 13c-.3 0-.5.2-.5.5s.2.5.5.5.5-.2.5-.5-.2-.5-.5-.5z" fill="#fff"/>
            </svg>
        ),
    };
    return icons[engine] || (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8" stroke="#9CA3AF" strokeWidth="1.5" fill="none"/>
            <circle cx="12" cy="12" r="3" fill="#9CA3AF"/>
        </svg>
    );
}

export function defaultPortForEngine(engine: string): number {
    switch (engine) {
        case "mysql":
        case "mariadb":
            return 3306;
        case "postgresql":
            return 5432;
        case "clickhouse":
            return 8123;
        case "mongodb":
            return 27017;
        case "redis":
            return 6379;
        default:
            return 0;
    }
}
