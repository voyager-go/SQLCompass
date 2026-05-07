import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isIntegerType, isTimestampType, isStringType } from "../lib/utils";

const DEFAULT_CHARSET = "utf8mb4";
const DEFAULT_COLLATION = "utf8mb4_general_ci";
const PANEL_WIDTH = 304;
const VIEWPORT_PADDING = 12;
const ANCHOR_GAP = 8;

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
    anchorEl?: HTMLElement | null;
    onToggleUnsigned: () => void;
    onToggleAutoIncrement: () => void;
    onChangeDefaultValue: (value: string) => void;
    onToggleOnUpdate: (checked: boolean) => void;
    onChangeCharset: (value: string) => void;
    onChangeCollation: (value: string) => void;
    onClose: () => void;
}

function calculatePanelPosition(anchor: HTMLElement, panelHeight = 260) {
    const rect = anchor.getBoundingClientRect();
    const maxLeft = window.innerWidth - VIEWPORT_PADDING - PANEL_WIDTH;
    let left = rect.left;
    if (left + PANEL_WIDTH > window.innerWidth - VIEWPORT_PADDING) {
        left = rect.right - PANEL_WIDTH;
    }
    left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

    let top = rect.bottom + ANCHOR_GAP;
    if (top + panelHeight > window.innerHeight - VIEWPORT_PADDING) {
        top = rect.top - panelHeight - ANCHOR_GAP;
    }

    return {
        top: Math.max(VIEWPORT_PADDING, top),
        left,
    };
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
    anchorEl,
    onToggleUnsigned,
    onToggleAutoIncrement,
    onChangeDefaultValue,
    onToggleOnUpdate,
    onChangeCharset,
    onChangeCollation,
    onClose,
}: FieldSettingsPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useLayoutEffect(() => {
        if (!visible || !anchorEl) return;
        const anchor = anchorEl;

        function updatePosition() {
            const height = panelRef.current?.offsetHeight ?? 260;
            setPos(calculatePanelPosition(anchor, height));
        }

        updatePosition();
        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);
        return () => {
            window.removeEventListener("scroll", updatePosition, true);
            window.removeEventListener("resize", updatePosition);
        };
    }, [visible, anchorEl]);

    useEffect(() => {
        if (!visible) setPos(null);
    }, [visible]);

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

    if (!visible || !anchorEl) return null;

    const panelPosition = pos ?? calculatePanelPosition(anchorEl);
    const fieldTypeLabel = fieldType.trim() || "未选择类型";

    return createPortal(
        <div
            ref={panelRef}
            className="field-settings-panel"
            style={{
                top: panelPosition.top,
                left: panelPosition.left,
            }}
        >
            <div className="field-settings-panel__header">
                <div>
                    <div className="field-settings-panel__eyebrow">字段设置</div>
                    <div className="field-settings-panel__type">{fieldTypeLabel}</div>
                </div>
            </div>

            {showUnsigned ? (
                <label className="field-settings-panel__row">
                    <span>无符号</span>
                    <input className="field-settings-panel__toggle" type="checkbox" checked={unsigned} onChange={onToggleUnsigned} />
                </label>
            ) : null}

            {isIntegerType(fieldType) ? (
                <label className="field-settings-panel__row">
                    <span>自增</span>
                    <input className="field-settings-panel__toggle" type="checkbox" checked={autoIncrement} onChange={onToggleAutoIncrement} />
                </label>
            ) : null}

            <div className="field-settings-panel__field" key={`dv-${fieldType}`}>
                <span>默认值</span>
                <div className="field-settings-panel__input-row">
                    <input
                        className="field-settings-panel__input"
                        value={defaultValue}
                        onChange={(e) => onChangeDefaultValue(e.target.value)}
                        placeholder="默认值"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                    />
                    {showNowButton ? (
                        <button
                            type="button"
                            className="field-settings-panel__token-button"
                            title="填充 CURRENT_TIMESTAMP"
                            onClick={() => onChangeDefaultValue("CURRENT_TIMESTAMP")}
                        >
                            NOW
                        </button>
                    ) : null}
                </div>
            </div>

            {showAutoUpdate ? (
                <label className="field-settings-panel__row">
                    <span>自动更新</span>
                    <input className="field-settings-panel__toggle" type="checkbox" checked={onUpdate === "CURRENT_TIMESTAMP"} onChange={(e) => onToggleOnUpdate(e.target.checked)} />
                </label>
            ) : null}

            {showCharset ? (
                <div className="field-settings-panel__field">
                    <span>字符集</span>
                    <select
                        className="field-settings-panel__select"
                        value={charset || DEFAULT_CHARSET}
                        onChange={(e) => onChangeCharset(e.target.value)}
                    >
                        <option value="utf8mb4">utf8mb4</option>
                        <option value="utf8">utf8</option>
                        <option value="latin1">latin1</option>
                        <option value="gbk">gbk</option>
                        <option value="ascii">ascii</option>
                    </select>
                </div>
            ) : null}

            {showCollation ? (
                <div className="field-settings-panel__field">
                    <span>排序规则</span>
                    <select
                        className="field-settings-panel__select"
                        value={collation || DEFAULT_COLLATION}
                        onChange={(e) => onChangeCollation(e.target.value)}
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
                <div className="field-settings-panel__empty">
                    无更多类型专属设置
                </div>
            ) : null}
        </div>,
        document.body,
    );
}
