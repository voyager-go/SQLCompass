type NoticeTone = "success" | "error" | "info";

type Notice = {
    tone: NoticeTone;
    message: string;
};

export function NoticeBanner({ notice }: { notice: Notice | null }) {
    if (!notice) {
        return null;
    }

    const iconMap: Record<NoticeTone, string> = {
        success: "✓",
        error: "!",
        info: "ℹ",
    };

    return (
        <div className={`notice-banner notice-banner--${notice.tone}`}>
            <span className="notice-banner__icon">{iconMap[notice.tone]}</span>
            <span className="notice-banner__text">{notice.message}</span>
        </div>
    );
}
