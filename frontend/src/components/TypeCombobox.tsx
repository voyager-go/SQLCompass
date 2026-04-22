import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

interface TypeComboboxProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export function TypeCombobox({ options, value, onChange, placeholder }: TypeComboboxProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const [activeIndex, setActiveIndex] = useState(0);
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const filtered = options.filter((opt) =>
        opt.toLowerCase().includes(inputValue.toLowerCase())
    );

    useEffect(() => {
        setInputValue(value);
    }, [value]);

    /* Sync dropdown position when opening */
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

    /* Recalculate on scroll/resize so portal stays aligned */
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

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
                setOpen(false);
                /* Commit current input to parent when clicking away */
                if (inputValue !== value) {
                    onChange(inputValue);
                }
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open, inputValue, value, onChange]);

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
                    onChange(filtered[activeIndex]);
                    setInputValue(filtered[activeIndex]);
                    setOpen(false);
                } else {
                    onChange(inputValue);
                    setOpen(false);
                }
            } else if (e.key === "Escape") {
                setOpen(false);
                setInputValue(value);
            }
        },
        [open, filtered, activeIndex, inputValue, value, onChange]
    );

    function handleBlur() {
        setOpen(false);
        if (inputValue !== value) {
            onChange(inputValue);
        }
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
                            onChange(opt);
                            setInputValue(opt);
                            setOpen(false);
                        }}
                    >
                        {opt}
                    </div>
                ))}
            </div>
        ) : null;

    return (
        <>
            <div className="combobox-wrap" ref={wrapRef}>
                <input
                    ref={inputRef}
                    className="combobox-input"
                    value={inputValue}
                    placeholder={placeholder}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        setOpen(true);
                        setActiveIndex(0);
                    }}
                    onFocus={() => {
                        setOpen(true);
                        setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                />
            </div>
            {dropdownEl ? createPortal(dropdownEl, document.body) : null}
        </>
    );
}
