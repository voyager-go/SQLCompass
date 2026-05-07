import { useCallback, useRef, useState } from "react";

interface ResizeState {
    columnIndex: number;
    startX: number;
    startWidth: number;
    widths: number[];
}

export function useResizableColumns(initialWidths?: number[]) {
    const [widths, setWidths] = useState<number[]>(initialWidths || []);
    const resizeRef = useRef<ResizeState | null>(null);

    function handleResizeStart(columnIndex: number, e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        const th = (e.target as HTMLElement).closest("th");
        if (!th) return;

        const currentWidths = widths.length > 0 ? widths : Array.from(th.parentElement!.children).map((child) => (child as HTMLElement).offsetWidth);

        resizeRef.current = {
            columnIndex,
            startX: e.clientX,
            startWidth: currentWidths[columnIndex],
            widths: [...currentWidths],
        };

        document.addEventListener("mousemove", handleResizeMove);
        document.addEventListener("mouseup", handleResizeEnd);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }

    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!resizeRef.current) return;
        const { columnIndex, startX, startWidth, widths: w } = resizeRef.current;
        const delta = e.clientX - startX;
        const newWidths = [...w];
        newWidths[columnIndex] = Math.max(50, startWidth + delta);
        setWidths(newWidths);
    }, []);

    const handleResizeEnd = useCallback(() => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", handleResizeMove);
        document.removeEventListener("mouseup", handleResizeEnd);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    }, [handleResizeMove]);

    function getColumnStyle(index: number): React.CSSProperties {
        if (widths.length > 0 && widths[index] > 0) {
            return { width: widths[index], minWidth: 40 };
        }
        return {};
    }

    function getTableStyle(): React.CSSProperties {
        if (widths.length > 0) {
            return { tableLayout: "auto" } as React.CSSProperties;
        }
        return {};
    }

    function resetWidths() {
        setWidths([]);
    }

    return {
        widths,
        handleResizeStart,
        getColumnStyle,
        getTableStyle,
        resetWidths,
    };
}

/* ── Drag-to-reorder ── */

export function useDragReorder<T>(items: T[], setItems: (items: T[]) => void) {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

    function handleDragStart(index: number, e: React.DragEvent) {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = "move";
        // Use empty image to avoid default ghost
        const img = new Image();
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";
        e.dataTransfer.setDragImage(img, 0, 0);
    }

    function handleDragOver(index: number, e: React.DragEvent) {
        e.preventDefault();
        if (dragIndex === null || index === dragIndex || index === dragIndex + 1) return;
        e.dataTransfer.dropEffect = "move";
        setDropTargetIndex(index);
    }

    function handleDragLeave() {
        setDropTargetIndex(null);
    }

    function handleDrop(targetIndex: number, e: React.DragEvent) {
        e.preventDefault();
        if (dragIndex === null || dragIndex === targetIndex) {
            setDragIndex(null);
            setDropTargetIndex(null);
            return;
        }

        const newItems = [...items];
        const [moved] = newItems.splice(dragIndex, 1);
        newItems.splice(targetIndex, 0, moved);
        setItems(newItems);

        setDragIndex(null);
        setDropTargetIndex(null);
    }

    function handleDragEnd() {
        setDragIndex(null);
        setDropTargetIndex(null);
    }

    return {
        dragIndex,
        dropTargetIndex,
        handleDragStart,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleDragEnd,
    };
}
