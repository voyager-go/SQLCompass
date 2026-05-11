import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface IndexFieldSelectorProps {
    options: string[];
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
}

export function IndexFieldSelector({ options, value, onChange, placeholder }: IndexFieldSelectorProps) {
    const [open, setOpen] = useState(false);
    const [searchText, setSearchText] = useState("");
    const wrapRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

    const filtered = options.filter(
        (opt) => opt.toLowerCase().includes(searchText.toLowerCase()),
    );

    const checkedSet = new Set(value);

    function toggleOption(opt: string) {
        if (checkedSet.has(opt)) {
            onChange(value.filter((v) => v !== opt));
        } else {
            onChange([...value, opt]);
        }
    }

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            if (
                wrapRef.current && !wrapRef.current.contains(target)
                && popoverRef.current && !popoverRef.current.contains(target)
            ) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    useEffect(() => {
        if (open && wrapRef.current) {
            const rect = wrapRef.current.getBoundingClientRect();
            const viewportBottom = window.innerHeight;
            const dropdownHeight = Math.min(filtered.length * 32 + 50, 220);
            const spaceBelow = viewportBottom - rect.bottom - 4;
            const fitBelow = spaceBelow >= dropdownHeight || rect.top < dropdownHeight + 8;

            setDropdownPos({
                top: fitBelow ? rect.bottom + window.scrollY + 2 : rect.top + window.scrollY - dropdownHeight - 2,
                left: rect.left + window.scrollX,
                width: rect.width,
                maxHeight: dropdownHeight,
            });
        } else {
            setDropdownPos(null);
            setSearchText("");
        }
    }, [open, filtered.length]);

    useEffect(() => {
        if (!open) return;
        function update() {
            if (wrapRef.current) {
                const rect = wrapRef.current.getBoundingClientRect();
                setDropdownPos((prev) => prev ? { ...prev, left: rect.left + window.scrollX, width: rect.width } : null);
            }
        }
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [open]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Escape") {
                setOpen(false);
            }
        },
        [],
    );

    const dropdownEl =
        open && dropdownPos ? (
            createPortal(
                <div
                    ref={popoverRef}
                    className="index-field-selector__popover"
                    style={{
                        position: "absolute",
                        top: dropdownPos.top,
                        left: dropdownPos.left,
                        width: dropdownPos.width,
                        maxHeight: dropdownPos.maxHeight,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {filtered.length === 0 ? (
                        <div className="index-field-selector__empty">无匹配字段</div>
                    ) : (
                        filtered.map((opt) => (
                            <label key={opt} className="index-field-selector__option">
                                <input
                                    type="checkbox"
                                    checked={checkedSet.has(opt)}
                                    onChange={() => toggleOption(opt)}
                                />
                                <span>{opt}</span>
                            </label>
                        ))
                    )}
                </div>,
                document.body,
            )
        ) : null;

    return (
        <>
            <div
                className="combobox-wrap combobox-wrap--multi index-field-selector"
                ref={wrapRef}
            >
                <div className="multiselect-input index-field-selector__trigger" onClick={() => setOpen(true)}>
                    {value.length > 0 ? (
                        value.map((item) => (
                            <span key={item} className="multiselect-tag">
                                {item}
                                <button type="button" onClick={(e) => { e.stopPropagation(); toggleOption(item); }}>&times;</button>
                            </span>))
                    ) : null}
                    <input
                        value={searchText}
                        placeholder={value.length > 0 ? "" : (placeholder ?? "选择字段")}
                        onFocus={() => setOpen(true)}
                        onChange={(e) => { setSearchText(e.target.value); setOpen(true); }}
                        onKeyDown={handleKeyDown}
                    />
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`index-field-selector__arrow${open ? " index-field-selector__arrow--open" : ""}`}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </div>
            {dropdownEl}
        </>
    );
}
