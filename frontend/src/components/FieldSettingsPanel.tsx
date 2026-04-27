import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { isIntegerType, isTimestampType, isStringType } from "../lib/utils";

const DEFAULT_CHARSET = "utf8mb4";
const DEFAULT_COLLATION = "utf8mb4_general_ci";

interface FieldSettingsPanelProps {
    visible: boolean;
    fieldType: string;
    isMySQL: boolean;
    unsigned: boolean;
    autoIncrement: boolean;
    defaultValue: string;
    onUpdate: string;
    charset: string;
    collation: string;
    onToggleUnsigned: () => void;
    onToggleAutoIncrement: () => void;
    onChangeDefaultValue: (value: string) => void;
    onToggleOnUpdate: (checked: boolean) => void;
    onChangeCharset: (value: string) => void;
    onChangeCollation: (value: string) => void;
    onClose: () => void;
}

export function FieldSettingsPanel({
    visible,
    fieldType,
    isMySQL,
    unsigned,
    autoIncrement,
    defaultValue,
    onUpdate,
    charset,
    collation,
    onToggleUnsigned,
    onToggleAutoIncrement,
    onChangeDefaultValue,
    onToggleOnUpdate,
    onChangeCharset,
    onChangeCollation,
    onClose,
}: FieldSettingsPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!visible) return;

        function handleClickOutside(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        }

        function handleEsc(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEsc);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEsc);
        };
    }, [visible, onClose]);

    const showUnsigned = isMySQL && isIntegerType(fieldType);
    const showNowButton = isTimestampType(fieldType);
    const showAutoUpdate = isMySQL && isTimestampType(fieldType) && (fieldType.toLowerCase() === "timestamp" || fieldType.toLowerCase() === "datetime");
    const showCharset = isStringType(fieldType);
    const showCollation = isStringType(fieldType);

    if (!visible) return null;

    return createPortal(
        <div
            ref={panelRef}
            className="field-settings-panel"
            style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 50,
                minWidth: 280,
                background: "var(--surface-1)",
                border: "1px solid var(--border-soft)",
                borderRadius: 10,
                boxShadow: "0 6px 24px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.06)",
                padding: 12,
                marginTop: 4,
                fontSize: 12.5,
                color: "var(--text-primary)",
            }}
        >
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10, color: "var(--text-secondary)" }}>
                字段设置
            </div>

            {/* 无符号 */}
            {showUnsigned ? (
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", cursor: "pointer" }}>
                    <span>无符号</span>
                    <input type="checkbox" checked={unsigned} onChange={onToggleUnsigned} />
                </label>
            ) : null}

            {/* 自增 */}
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", cursor: "pointer" }}>
                <span>自增</span>
                <input type="checkbox" checked={autoIncrement} onChange={onToggleAutoIncrement} />
            </label>

            {/* 默认值 */}
            <div style={{ padding: "5px 0" }} key={`dv-${fieldType}`}>
                <span style={{ display: "block", marginBottom: 3, color: "var(--text-secondary)" }}>默认值</span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                        value={defaultValue}
                        onChange={(e) => onChangeDefaultValue(e.target.value)}
                        placeholder="默认值"
                        autoComplete="off"
                        autoCapitalize="none"
                        style={{
                            flex: 1,
                            padding: "4px 7px",
                            border: "1px solid var(--border-soft)",
                            borderRadius: 6,
                            background: "var(--input-bg)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            outline: "none",
                        }}
                    />
                    {showNowButton ? (
                        <button
                            type="button"
                            className="mini-ai-button"
                            title="填充 CURRENT_TIMESTAMP"
                            onClick={() => onChangeDefaultValue("CURRENT_TIMESTAMP")}
                            style={{ flexShrink: 0 }}
                        >
                            NOW
                        </button>
                    ) : null}
                </div>
            </div>

            {/* 自动更新 */}
            {showAutoUpdate ? (
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", cursor: "pointer" }}>
                    <span>自动更新</span>
                    <input type="checkbox" checked={onUpdate === "CURRENT_TIMESTAMP"} onChange={(e) => onToggleOnUpdate(e.target.checked)} />
                </label>
            ) : null}

            {/* 字符集 */}
            {showCharset ? (
                <div style={{ padding: "5px 0" }}>
                    <span style={{ display: "block", marginBottom: 3, color: "var(--text-secondary)" }}>字符集</span>
                    <select
                        value={charset || DEFAULT_CHARSET}
                        onChange={(e) => onChangeCharset(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "4px 7px",
                            border: "1px solid var(--border-soft)",
                            borderRadius: 6,
                            background: "var(--input-bg)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            outline: "none",
                        }}
                    >
                        <option value="utf8mb4">utf8mb4</option>
                        <option value="utf8">utf8</option>
                        <option value="latin1">latin1</option>
                        <option value="gbk">gbk</option>
                        <option value="ascii">ascii</option>
                    </select>
                </div>
            ) : null}

            {/* 排序规则 */}
            {showCollation ? (
                <div style={{ padding: "5px 0" }}>
                    <span style={{ display: "block", marginBottom: 3, color: "var(--text-secondary)" }}>排序规则</span>
                    <select
                        value={collation || DEFAULT_COLLATION}
                        onChange={(e) => onChangeCollation(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "4px 7px",
                            border: "1px solid var(--border-soft)",
                            borderRadius: 6,
                            background: "var(--input-bg)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            outline: "none",
                        }}
                    >
                        <option value="utf8mb4_general_ci">utf8mb4_general_ci</option>
                        <option value="utf8mb4_unicode_ci">utf8mb4_unicode_ci</option>
                        <option value="utf8mb4_bin">utf8mb4_bin</option>
                        <option value="utf8_general_ci">utf8_general_ci</option>
                        <option value="utf8_unicode_ci">utf8_unicode_ci</option>
                        <option value="latin1_swedish_ci">latin1_swedish_ci</option>
                        <option value="gbk_chinese_ci">gbk_chinese_ci</option>
                        <option value="binary">binary</option>
                    </select>
                </div>
            ) : null}

            {!showUnsigned && !showAutoUpdate && !showCharset && !showCollation ? (
                <div style={{ padding: "8px 0", color: "var(--text-tertiary)", fontStyle: "italic", fontSize: 11.5 }}>
                    当前字段类型无额外设置项
                </div>
            ) : null}
        </div>,
        document.body,
    );
}
