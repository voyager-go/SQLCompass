import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { TableField } from "../types/runtime";

export interface FillTableModalProps {
    open: boolean;
    fields: TableField[];
    onClose: () => void;
    onConfirm: (mappings: Record<string, string>, count: number) => void;
    isFilling: boolean;
}

interface FakeTypeGroup {
    label: string;
    types: { value: string; label: string }[];
}

const fakeTypeGroups: FakeTypeGroup[] = [
    {
        label: "自动识别",
        types: [{ value: "auto", label: "自动识别（根据字段类型）" }],
    },
    {
        label: "基础数值",
        types: [
            { value: "integer", label: "整数" },
            { value: "decimal", label: "小数" },
            { value: "boolean", label: "布尔值" },
            { value: "age", label: "年龄" },
            { value: "price", label: "价格" },
            { value: "stock", label: "库存数量" },
            { value: "rating", label: "评分（1-5）" },
            { value: "percentage", label: "百分比" },
        ],
    },
    {
        label: "姓名",
        types: [
            { value: "chinese_name", label: "中文姓名" },
            { value: "english_name", label: "英文姓名" },
        ],
    },
    {
        label: "联系信息",
        types: [
            { value: "email", label: "邮箱地址" },
            { value: "mobile", label: "手机号" },
            { value: "phone", label: "固定电话" },
            { value: "id_card", label: "身份证号" },
        ],
    },
    {
        label: "地址与公司",
        types: [
            { value: "address", label: "地址" },
            { value: "company", label: "公司名称" },
            { value: "job_title", label: "职位" },
        ],
    },
    {
        label: "文本与描述",
        types: [
            { value: "description", label: "产品描述" },
            { value: "lorem_text", label: "随机文本" },
            { value: "product_name", label: "产品名称" },
            { value: "color", label: "颜色" },
        ],
    },
    {
        label: "网络相关",
        types: [
            { value: "url", label: "网址" },
            { value: "ip_address", label: "IP 地址" },
            { value: "uuid", label: "UUID" },
        ],
    },
    {
        label: "业务标识",
        types: [
            { value: "order_sn", label: "订单编号" },
            { value: "trade_no", label: "交易流水号" },
            { value: "serial_no", label: "序列号" },
        ],
    },
    {
        label: "时间",
        types: [
            { value: "date", label: "日期" },
            { value: "datetime", label: "日期时间" },
            { value: "time", label: "时间" },
            { value: "year", label: "年份" },
            { value: "timestamp", label: "时间戳" },
        ],
    },
    {
        label: "枚举",
        types: [
            { value: "yes_no", label: "是/否" },
            { value: "gender", label: "性别" },
            { value: "status", label: "状态" },
            { value: "order_status", label: "订单状态" },
            { value: "pay_method", label: "支付方式" },
        ],
    },
];

function getDefaultFakeType(fieldType: string): string {
    const t = fieldType.toLowerCase();
    if (t.includes("tinyint")) return "boolean";
    if (t.includes("int")) return "integer";
    if (t.includes("float") || t.includes("double") || t.includes("decimal") || t.includes("real") || t.includes("numeric")) return "decimal";
    if (t.includes("bool")) return "boolean";
    if (t.includes("datetime") || t.includes("timestamp")) return "datetime";
    if (t.includes("date")) return "date";
    if (t.includes("time") && !t.includes("datetime")) return "time";
    if (t.includes("year")) return "year";
    if (t.includes("text") || t.includes("char") || t.includes("string") || t.includes("varchar")) return "lorem_text";
    if (t.includes("uuid")) return "uuid";
    if (t.includes("json")) return "description";
    return "auto";
}

function FakeTypeDropdown({
    value,
    onChange,
    groups,
}: {
    value: string;
    onChange: (value: string) => void;
    groups: FakeTypeGroup[];
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const wrapRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    const allOptions = groups.flatMap((g) => g.types);
    const selectedLabel = allOptions.find((t) => t.value === value)?.label ?? value;

    const filteredGroups = groups
        .map((g) => ({
            ...g,
            types: g.types.filter((t) => t.label.toLowerCase().includes(query.toLowerCase())),
        }))
        .filter((g) => g.types.length > 0);

    useEffect(() => {
        if (open && wrapRef.current) {
            const rect = wrapRef.current.getBoundingClientRect();
            setPos({
                top: rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
                width: rect.width,
            });
        } else {
            setPos(null);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function update() {
            if (wrapRef.current) {
                const rect = wrapRef.current.getBoundingClientRect();
                setPos({
                    top: rect.bottom + window.scrollY + 4,
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
                setQuery("");
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    const dropdownEl =
        open && pos ? (
            <div
                className="combobox-dropdown combobox-dropdown--portal"
                style={{
                    position: "absolute",
                    top: pos.top,
                    left: pos.left,
                    width: pos.width,
                    maxHeight: 280,
                    overflowY: "auto",
                }}
            >
                <div
                    style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid var(--border-soft)",
                        position: "sticky",
                        top: 0,
                        background: "var(--surface-overlay)",
                        zIndex: 1,
                    }}
                >
                    <input
                        type="text"
                        placeholder="搜索类型..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "4px 8px",
                            fontSize: 12,
                            borderRadius: 4,
                            border: "1px solid var(--border-soft)",
                            background: "var(--input-bg)",
                            color: "var(--text-primary)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                </div>
                {filteredGroups.map((group) => (
                    <div key={group.label}>
                        <div
                            style={{
                                padding: "4px 10px",
                                fontSize: 11,
                                fontWeight: 600,
                                color: "var(--text-secondary)",
                                background: "var(--surface-2)",
                            }}
                        >
                            {group.label}
                        </div>
                        {group.types.map((t) => (
                            <div
                                key={t.value}
                                className={`combobox-option${t.value === value ? " combobox-option--active" : ""}`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    onChange(t.value);
                                    setOpen(false);
                                    setQuery("");
                                }}
                            >
                                {t.label}
                            </div>
                        ))}
                    </div>
                ))}
                {filteredGroups.length === 0 ? (
                    <div style={{ padding: "10px", fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>
                        无匹配类型
                    </div>
                ) : null}
            </div>
        ) : null;

    return (
        <>
            <div className="combobox-wrap" ref={wrapRef} style={{ width: "100%" }}>
                <input
                    className="combobox-input"
                    value={selectedLabel}
                    readOnly
                    onClick={() => setOpen((v) => !v)}
                    style={{ cursor: "pointer" }}
                />
            </div>
            {dropdownEl ? createPortal(dropdownEl, document.body) : null}
        </>
    );
}

export function FillTableModal({ open, fields, onClose, onConfirm, isFilling }: FillTableModalProps) {
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [count, setCount] = useState(100);

    useEffect(() => {
        if (open) {
            const init: Record<string, string> = {};
            fields.forEach((f) => {
                if (!f.autoIncrement) {
                    init[f.name] = getDefaultFakeType(f.type);
                }
            });
            setMappings(init);
            setCount(100);
        }
    }, [open, fields]);

    if (!open) return null;

    const fillableFields = fields.filter((f) => !f.autoIncrement);

    function updateMapping(fieldName: string, value: string) {
        setMappings((prev) => ({ ...prev, [fieldName]: value }));
    }

    function handleConfirm() {
        onConfirm(mappings, count);
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-card modal-card--wide" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
                <div className="section-title">
                    <div>
                        <h3>常规填充</h3>
                        <p>为每个字段选择要填充的数据类型，系统将据此生成模拟数据。</p>
                    </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                        <span style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>填充行数</span>
                        <input
                            type="number"
                            value={count}
                            min={1}
                            max={10000}
                            onChange={(e) => setCount(Math.max(1, Math.min(10000, parseInt(e.target.value) || 1)))}
                            style={{ width: 100, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-soft)", fontSize: 13 }}
                        />
                    </label>
                </div>

                <div className="schema-table-shell" style={{ maxHeight: 420, overflowY: "auto", marginBottom: 16 }}>
                    <table className="schema-table">
                        <thead>
                            <tr>
                                <th style={{ width: 140 }}>字段名</th>
                                <th style={{ width: 120 }}>字段类型</th>
                                <th style={{ width: 200 }}>注释</th>
                                <th>填充类型</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fillableFields.map((field) => (
                                <tr key={field.name}>
                                    <td style={{ fontWeight: 500 }}>{field.name}</td>
                                    <td><code style={{ fontSize: 11.5, color: "var(--text-secondary)", background: "var(--surface-2)", padding: "1px 5px", borderRadius: 4 }}>{field.type}</code></td>
                                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{field.comment || "—"}</td>
                                    <td>
                                        <FakeTypeDropdown
                                            value={mappings[field.name] || "auto"}
                                            onChange={(v) => updateMapping(field.name, v)}
                                            groups={fakeTypeGroups}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {fillableFields.length === 0 ? (
                    <div className="empty-block" style={{ marginBottom: 16 }}>没有可填充的字段（可能全是自增字段）。</div>
                ) : null}

                <div className="toolbar-actions toolbar-actions--end">
                    <button type="button" className="ghost-button" onClick={onClose} disabled={isFilling}>
                        取消
                    </button>
                    <button type="button" className="primary-button" onClick={handleConfirm} disabled={isFilling || fillableFields.length === 0}>
                        {isFilling ? "填充中..." : "开始填充"}
                    </button>
                </div>
            </div>
        </div>
    );
}
