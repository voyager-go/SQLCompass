import { useEffect, useRef, useState, useCallback } from "react";

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
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const filtered = options.filter((opt) =>
        opt.toLowerCase().includes(inputValue.toLowerCase())
    );

    useEffect(() => {
        setInputValue(value);
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
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

    return (
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
            />
            {open && filtered.length > 0 ? (
                <div className="combobox-dropdown">
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
            ) : null}
        </div>
    );
}
