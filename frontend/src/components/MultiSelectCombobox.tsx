import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface MultiSelectProps {
    options: string[];
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
}

export function MultiSelectCombobox({ options, value, onChange, placeholder }: MultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    const filtered = options.filter(
        (opt) => opt.toLowerCase().includes(inputValue.toLowerCase()) && !value.includes(opt),
    );

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    useEffect(() => {
        if (open && wrapRef.current) {
            const rect = wrapRef.current.getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + window.scrollY + 2,
                left: rect.left + window.scrollX,
                width: rect.width,
            });
        } else {
            setDropdownPos(null);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function update() {
            if (wrapRef.current) {
                const rect = wrapRef.current.getBoundingClientRect();
                setDropdownPos({
                    top: rect.bottom + window.scrollY + 2,
                    left: rect.left + window.scrollX,
                    width: rect.width,
                });
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
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (open && filtered[activeIndex]) {
                    onChange([...value, filtered[activeIndex]]);
                    setInputValue("");
                    setActiveIndex(0);
                    setOpen(true);
                }
            } else if (e.key === "Escape") {
                setOpen(false);
            }
        },
        [open, filtered, activeIndex, value, onChange],
    );

    function removeItem(item: string) {
        onChange(value.filter((v) => v !== item));
    }

    const dropdownEl =
        open && filtered.length > 0 && dropdownPos ? (
            <div
                className="combobox-dropdown combobox-dropdown--portal"
                style={{ position: "absolute", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
            >
                {filtered.map((opt, idx) => (
                    <div
                        key={opt}
                        className={`combobox-option${idx === activeIndex ? " combobox-option--active" : ""}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            onChange([...value, opt]);
                            setInputValue("");
                            setActiveIndex(0);
                        }}
                    >
                        {opt}
                    </div>
                ))}
            </div>
        ) : null;

    return (
        <>
            <div className="combobox-wrap combobox-wrap--multi" ref={wrapRef}>
                <div className="multiselect-input">
                    {value.length > 0 ? (
                        value.map((item) => (
                            <span key={item} className="multiselect-tag">
                                {item}
                                <button type="button" onClick={(e) => { e.stopPropagation(); removeItem(item); }}>&times;</button>
                            </span>
                        ))
                    ) : null}
                    <input
                        value={inputValue}
                        placeholder={value.length > 0 ? "" : (placeholder ?? "选择字段")}
                        onFocus={() => { setOpen(true); setActiveIndex(0); }}
                        onChange={(e) => { setInputValue(e.target.value); setOpen(true); setActiveIndex(0); }}
                        onKeyDown={handleKeyDown}
                    />
                </div>
            </div>
            {dropdownEl ? createPortal(dropdownEl, document.body) : null}
        </>
    );
}
