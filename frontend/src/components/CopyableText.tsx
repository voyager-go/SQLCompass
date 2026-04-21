import { useRef, useState } from "react";

export function CopyableText({
    value,
    helperText = "点击复制完整名称",
    onCopied,
}: {
    value: string;
    helperText?: string;
    onCopied: (value: string) => void;
}) {
    const closeTimerRef = useRef<number | null>(null);
    const openTimerRef = useRef<number | null>(null);
    const labelRef = useRef<HTMLSpanElement | null>(null);
    const [open, setOpen] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

    function clearCloseTimer() {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }

    function clearOpenTimer() {
        if (openTimerRef.current !== null) {
            window.clearTimeout(openTimerRef.current);
            openTimerRef.current = null;
        }
    }

    function openTooltip() {
        clearCloseTimer();
        setOpen(true);
    }

    function closeTooltip() {
        clearOpenTimer();
        clearCloseTimer();
        closeTimerRef.current = window.setTimeout(() => setOpen(false), 140);
    }

    function updateTooltipPosition(clientX: number, clientY: number) {
        const tooltipWidth = 320;
        const padding = 18;
        const maxX = Math.max(padding, window.innerWidth - tooltipWidth - padding);
        setTooltipPosition({
            x: Math.min(clientX + 14, maxX),
            y: Math.max(18, clientY + 18),
        });
    }

    function shouldShowTooltip() {
        const element = labelRef.current;
        if (!element) {
            return false;
        }

        return element.scrollWidth > element.clientWidth || helperText.trim().length > 0;
    }

    return (
        <div
            className="copyable-text"
            onMouseEnter={(event) => {
                updateTooltipPosition(event.clientX, event.clientY);
                clearOpenTimer();
                openTimerRef.current = window.setTimeout(() => {
                    if (shouldShowTooltip()) {
                        openTooltip();
                    }
                }, 220);
            }}
            onMouseLeave={closeTooltip}
            onMouseMove={(event) => updateTooltipPosition(event.clientX, event.clientY)}
            onContextMenu={() => {
                clearOpenTimer();
                clearCloseTimer();
                setOpen(false);
            }}
        >
            <span ref={labelRef} className="copyable-text__label">{value}</span>
            <div
                className={`copyable-text__tooltip${open ? " copyable-text__tooltip--open" : ""}`}
                style={{
                    left: tooltipPosition.x,
                    top: tooltipPosition.y,
                }}
                onMouseEnter={clearCloseTimer}
                onMouseLeave={closeTooltip}
            >
                <strong>{value}</strong>
                <span>{helperText}</span>
            </div>
        </div>
    );
}
