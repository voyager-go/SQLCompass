type NoticeTone = "success" | "error" | "info";

type Toast = {
    id: string;
    tone: NoticeTone;
    title: string;
    message: string;
};

export function FloatingToast({ toast }: { toast: Toast | null }) {
    if (!toast) {
        return null;
    }

    return (
        <div className="floating-toast">
            <div className={`toast toast--${toast.tone}`}>
                <strong>{toast.title}</strong>
                <span>{toast.message}</span>
            </div>
        </div>
    );
}
