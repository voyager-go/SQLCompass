import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { NoticeBanner } from "../components/NoticeBanner";
import { TypeCombobox } from "../components/TypeCombobox";
import { FieldSettingsPanel } from "../components/FieldSettingsPanel";
import { MultiSelectCombobox } from "../components/MultiSelectCombobox";
import { IndexFieldSelector } from "../components/IndexFieldSelector";
import type { TableDetail, SchemaDraftField } from "../types/runtime";
import type { SchemaDraftIndex } from "../lib/utils";
import type { AlterPreviewState } from "../hooks/useSchema";
import { getIndexTypeOptions, isIntegerType, isTimestampType } from "../lib/utils";
import { highlightSQL } from "../lib/sqlHighlight";
import { useResizableColumns, useDragReorder } from "../hooks/useTableInteraction";

type NoticeTone = "success" | "error" | "info";

type ModelTarget = "go_struct" | "go_gorm" | "ts_interface" | "php_laravel" | "python_pydantic" | "java_jpa" | "rust_serde";

const modelOptions: { value: ModelTarget; label: string }[] = [
    { value: "go_struct", label: "Go Struct" },
    { value: "go_gorm", label: "Go GORM" },
    { value: "ts_interface", label: "TypeScript Interface" },
    { value: "php_laravel", label: "PHP Laravel Model" },
    { value: "python_pydantic", label: "Python Pydantic" },
    { value: "java_jpa", label: "Java JPA" },
    { value: "rust_serde", label: "Rust Struct (serde)" },
];

function toPascalCase(str: string): string {
    return str.replace(/(?:^|_)([a-zA-Z])/g, (_, ch) => ch.toUpperCase()).replace(/_/g, "");
}

function toCamelCase(str: string): string {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (ch) => "_" + ch.toLowerCase()).replace(/^_/, "");
}

function toSingular(str: string): string {
    if (str.endsWith("ies")) return str.slice(0, -3) + "y";
    if (str.endsWith("es") && (str.endsWith("ches") || str.endsWith("shes") || str.endsWith("sses"))) return str.slice(0, -2);
    if (str.endsWith("s") && !str.endsWith("ss")) return str.slice(0, -1);
    return str;
}

/* ── 类型映射 ── */

function mapSqlTypeToGo(sqlType: string, nullable: boolean): string {
    const t = sqlType.toLowerCase();
    let base = "string";
    if (t.includes("tinyint(1)") || t.includes("bool")) base = "bool";
    else if (t.includes("tinyint")) base = "int8";
    else if (t.includes("smallint")) base = "int16";
    else if (t.includes("mediumint")) base = "int32";
    else if (t.includes("bigint")) base = "int64";
    else if (t.includes("int")) base = "int64";
    else if (t.includes("float")) base = "float32";
    else if (t.includes("double") || t.includes("real")) base = "float64";
    else if (t.includes("decimal") || t.includes("numeric")) base = "float64";
    else if (t.includes("datetime") || t.includes("timestamp")) base = "time.Time";
    else if (t.includes("date")) base = "time.Time";
    else if (t.includes("time") && !t.includes("datetime")) base = "time.Time";
    else if (t.includes("year")) base = "int";
    else if (t.includes("json")) base = "string";
    else if (t.includes("blob") || t.includes("binary")) base = "[]byte";
    else if (t.includes("text") || t.includes("char") || t.includes("varchar")) base = "string";
    return nullable ? (base.startsWith("[]") || base === "time.Time" ? `*${base}` : `*${base}`) : base;
}

function mapSqlTypeToTS(sqlType: string): string {
    const t = sqlType.toLowerCase();
    if (t.includes("bool") || t.includes("tinyint(1)")) return "boolean";
    if (t.includes("int") || t.includes("float") || t.includes("double") || t.includes("decimal") || t.includes("real") || t.includes("numeric")) return "number";
    if (t.includes("json")) return "Record<string, any>";
    if (t.includes("blob") || t.includes("binary")) return "Blob";
    return "string";
}

function mapSqlTypeToPHP(sqlType: string): string {
    const t = sqlType.toLowerCase();
    if (t.includes("bool") || t.includes("tinyint(1)")) return "boolean";
    if (t.includes("int") || t.includes("year")) return "integer";
    if (t.includes("float") || t.includes("double") || t.includes("decimal") || t.includes("real") || t.includes("numeric")) return "float";
    if (t.includes("datetime") || t.includes("timestamp")) return "datetime";
    if (t.includes("date")) return "date";
    if (t.includes("json")) return "array";
    return "string";
}

function mapSqlTypeToPython(sqlType: string): string {
    const t = sqlType.toLowerCase();
    if (t.includes("bool") || t.includes("tinyint(1)")) return "bool";
    if (t.includes("int") || t.includes("year")) return "int";
    if (t.includes("float") || t.includes("double") || t.includes("decimal") || t.includes("real") || t.includes("numeric")) return "float";
    if (t.includes("datetime") || t.includes("timestamp")) return "datetime";
    if (t.includes("date")) return "date";
    if (t.includes("time")) return "time";
    if (t.includes("json")) return "dict";
    if (t.includes("blob") || t.includes("binary")) return "bytes";
    return "str";
}

function mapSqlTypeToJava(sqlType: string): string {
    const t = sqlType.toLowerCase();
    if (t.includes("bool") || t.includes("tinyint(1)")) return "Boolean";
    if (t.includes("bigint")) return "Long";
    if (t.includes("int")) return "Integer";
    if (t.includes("float")) return "Float";
    if (t.includes("double") || t.includes("real")) return "Double";
    if (t.includes("decimal") || t.includes("numeric")) return "BigDecimal";
    if (t.includes("datetime") || t.includes("timestamp")) return "Date";
    if (t.includes("date")) return "Date";
    if (t.includes("time")) return "Time";
    if (t.includes("json")) return "String";
    if (t.includes("blob") || t.includes("binary")) return "byte[]";
    if (t.includes("text") || t.includes("char") || t.includes("varchar")) return "String";
    return "String";
}

function mapSqlTypeToRust(sqlType: string): string {
    const t = sqlType.toLowerCase();
    if (t.includes("bool") || t.includes("tinyint(1)")) return "bool";
    if (t.includes("tinyint")) return "i8";
    if (t.includes("smallint")) return "i16";
    if (t.includes("mediumint")) return "i32";
    if (t.includes("bigint")) return "i64";
    if (t.includes("int")) return "i32";
    if (t.includes("float")) return "f32";
    if (t.includes("double") || t.includes("real")) return "f64";
    if (t.includes("decimal") || t.includes("numeric")) return "f64";
    if (t.includes("datetime") || t.includes("timestamp") || t.includes("date") || t.includes("time")) return "String";
    if (t.includes("year")) return "i32";
    if (t.includes("json")) return "serde_json::Value";
    if (t.includes("blob") || t.includes("binary")) return "Vec<u8>";
    if (t.includes("text") || t.includes("char") || t.includes("varchar")) return "String";
    return "String";
}

/* ── 生成器 ── */

function generateGoStruct(tableName: string, fields: SchemaDraftField[], gorm: boolean): string {
    const className = toPascalCase(toSingular(tableName));
    const lines: string[] = [];
    if (fields.some((f) => /datetime|timestamp|date|time/.test(f.type.toLowerCase()))) {
        lines.push(`import "time"`, "");
    }
    lines.push(`type ${className} struct {`);
    for (const f of fields) {
        const goType = mapSqlTypeToGo(f.type, f.nullable);
        const jsonTag = `json:"${toCamelCase(f.name)}"`;
        const gormTag = gorm
            ? `gorm:"column:${f.name}${f.primary ? ";primaryKey" : ""}${f.autoIncrement ? ";autoIncrement" : ""}"`
            : "";
        const tag = gorm ? `${gormTag} ${jsonTag}` : jsonTag;
        const comment = f.comment ? ` // ${f.comment}` : "";
        lines.push(`\t${toPascalCase(f.name)} ${goType} \`${tag}\`${comment}`);
    }
    lines.push("}");
    return lines.join("\n");
}

function generateTSInterface(tableName: string, fields: SchemaDraftField[]): string {
    const className = toPascalCase(toSingular(tableName));
    const lines: string[] = [`interface ${className} {`];
    for (const f of fields) {
        const tsType = mapSqlTypeToTS(f.type);
        const optional = f.nullable ? "?" : "";
        const comment = f.comment ? ` // ${f.comment}` : "";
        lines.push(`    ${toCamelCase(f.name)}${optional}: ${tsType};${comment}`);
    }
    lines.push("}");
    return lines.join("\n");
}

function generatePHPLaravel(tableName: string, fields: SchemaDraftField[]): string {
    const className = toPascalCase(toSingular(tableName));
    const fillable = fields.filter((f) => !f.autoIncrement).map((f) => `'${f.name}'`).join(", ");
    const casts: string[] = [];
    for (const f of fields) {
        const cast = mapSqlTypeToPHP(f.type);
        if (cast !== "string") {
            casts.push(`        '${f.name}' => '${cast}'`);
        }
    }
    const docProps = fields
        .map((f) => {
            const phpType = f.nullable ? `${mapSqlTypeToPHP(f.type)}|null` : mapSqlTypeToPHP(f.type);
            return ` * @property ${phpType} $${f.name} ${f.comment || ""}`;
        })
        .join("\n");

    return `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;

/**
${docProps}
 */
class ${className} extends Model
{
    use HasFactory;

    protected $table = '${tableName}';
    protected $fillable = [${fillable}];
${casts.length > 0 ? `    protected $casts = [\n${casts.join(",\n")}\n    ];` : "    // protected $casts = [];"}
}`;
}

function generatePythonPydantic(tableName: string, fields: SchemaDraftField[]): string {
    const className = toPascalCase(toSingular(tableName));
    const lines: string[] = ["from pydantic import BaseModel", "from typing import Optional", "from datetime import datetime, date, time", "", `class ${className}(BaseModel):`];
    for (const f of fields) {
        const pyType = mapSqlTypeToPython(f.type);
        const typeStr = f.nullable ? `Optional[${pyType}]` : pyType;
        const defaultVal = f.nullable ? " = None" : "";
        const comment = f.comment ? `  # ${f.comment}` : "";
        lines.push(`    ${toSnakeCase(f.name)}: ${typeStr}${defaultVal}${comment}`);
    }
    return lines.join("\n");
}

function generateJavaJPA(tableName: string, fields: SchemaDraftField[]): string {
    const className = toPascalCase(toSingular(tableName));
    const lines: string[] = [
        "import javax.persistence.*;",
        "import java.util.Date;",
        "import java.math.BigDecimal;",
        "",
        `@Entity`,
        `@Table(name = "${tableName}")`,
        `public class ${className} {`,
    ];
    for (const f of fields) {
        const javaType = mapSqlTypeToJava(f.type);
        const comment = f.comment ? `    // ${f.comment}\n` : "";
        if (f.primary) {
            lines.push(`${comment}    @Id`);
            if (f.autoIncrement) {
                lines.push(`    @GeneratedValue(strategy = GenerationType.IDENTITY)`);
            }
        }
        lines.push(`    @Column(name = "${f.name}"${f.nullable ? "" : ", nullable = false"})`);
        lines.push(`    private ${javaType} ${toCamelCase(f.name)};`);
        lines.push("");
    }
    for (const f of fields) {
        const javaType = mapSqlTypeToJava(f.type);
        const fieldName = toCamelCase(f.name);
        const pascalName = toPascalCase(f.name);
        lines.push("");
        lines.push(`    public ${javaType} get${pascalName}() {`);
        lines.push(`        return this.${fieldName};`);
        lines.push("    }");
        lines.push("");
        lines.push(`    public void set${pascalName}(${javaType} ${fieldName}) {`);
        lines.push(`        this.${fieldName} = ${fieldName};`);
        lines.push("    }");
    }
    lines.push("}");
    return lines.join("\n");
}

function generateRustSerde(tableName: string, fields: SchemaDraftField[]): string {
    const className = toPascalCase(toSingular(tableName));
    const lines: string[] = ["use serde::{Deserialize, Serialize};", "", `#[derive(Debug, Clone, Serialize, Deserialize)]`, `pub struct ${className} {`];
    for (const f of fields) {
        const rustType = mapSqlTypeToRust(f.type);
        const optional = f.nullable ? `Option<${rustType}>` : rustType;
        const serdeTag = `#[serde(rename = "${f.name}")]`;
        const comment = f.comment ? ` // ${f.comment}` : "";
        lines.push(`    ${serdeTag}`);
        lines.push(`    pub ${toSnakeCase(f.name)}: ${optional},${comment}`);
    }
    lines.push("}");
    return lines.join("\n");
}

function generateModelCode(target: ModelTarget, tableName: string, fields: SchemaDraftField[]): string {
    switch (target) {
        case "go_struct":
            return generateGoStruct(tableName, fields, false);
        case "go_gorm":
            return generateGoStruct(tableName, fields, true);
        case "ts_interface":
            return generateTSInterface(tableName, fields);
        case "php_laravel":
            return generatePHPLaravel(tableName, fields);
        case "python_pydantic":
            return generatePythonPydantic(tableName, fields);
        case "java_jpa":
            return generateJavaJPA(tableName, fields);
        case "rust_serde":
            return generateRustSerde(tableName, fields);
        default:
            return "";
    }
}

interface SchemaPageProps {
    selectedTable: string;
    tableDetail: TableDetail | null;
    schemaNotice: { tone: NoticeTone; message: string } | null;
    schemaDraftFields: SchemaDraftField[];
    fieldTypeOptions: string[];
    activeEngine: string;
    updateDraftField: <K extends keyof SchemaDraftField>(index: number, key: K, value: SchemaDraftField[K]) => void;
    applyFieldSuggestion: (index: number, fieldName: string) => Promise<void>;
    handleGenerateFieldComment: (index: number) => Promise<void>;
    handleDeleteDraftField: (index: number) => void;
    handleAddField: (afterIndex?: number) => void;
    setRenameModalOpen: (v: boolean) => void;
    handleExportDDL: () => Promise<void>;
    isExporting: boolean;
    handleCopyDDL: () => void;
    currentAlterSQL: string;
    renameModalOpen: boolean;
    renameTableName: string;
    setRenameTableName: (v: string) => void;
    handleRenameTable: () => Promise<void>;
    isRenamingTable: boolean;
    schemaDraftIndexes: SchemaDraftIndex[];
    handleAddIndex: () => void;
    handleDeleteDraftIndex: (index: number) => void;
    updateDraftIndex: <K extends keyof SchemaDraftIndex>(index: number, key: K, value: SchemaDraftIndex[K]) => void;
    handleGenerateIndexName: (index: number, tableName: string) => Promise<void>;
    aiConfigured: boolean;
    alterPreview: AlterPreviewState;
    setAlterPreview: React.Dispatch<React.SetStateAction<AlterPreviewState>>;
    handleSaveFields: () => Promise<void>;
    handleConfirmAlterPreview: () => Promise<void>;
    isSavingFields: boolean;
    handleSaveIndexes: () => Promise<void>;
    isSavingIndexes: boolean;
    pushToast: (tone: NoticeTone, title: string, message: string) => void;
    onOpenPartitionPage?: () => void;
}

export function SchemaPage({
    selectedTable,
    tableDetail,
    schemaNotice,
    schemaDraftFields,
    fieldTypeOptions,
    activeEngine,
    updateDraftField,
    applyFieldSuggestion,
    handleGenerateFieldComment,
    handleDeleteDraftField,
    handleAddField,
    setRenameModalOpen,
    handleExportDDL,
    isExporting,
    handleCopyDDL,
    currentAlterSQL,
    renameModalOpen,
    renameTableName,
    setRenameTableName,
    handleRenameTable,
    isRenamingTable,
    schemaDraftIndexes,
    handleAddIndex,
    handleDeleteDraftIndex,
    updateDraftIndex,
    handleGenerateIndexName,
    aiConfigured,
    alterPreview,
    setAlterPreview,
    handleSaveFields,
    handleConfirmAlterPreview,
    isSavingFields,
    handleSaveIndexes,
    isSavingIndexes,
    pushToast,
    onOpenPartitionPage,
}: SchemaPageProps) {
    const indexTypeOptions = getIndexTypeOptions(activeEngine);
    const isMySQL = activeEngine === "mysql" || activeEngine === "mariadb";
    const fieldNames = schemaDraftFields.map((f) => f.name).filter(Boolean);
    const [runningAiDiagnose, setRunningAiDiagnose] = useState(false);
    const [aiDiagnostics, setAiDiagnostics] = useState<{ title: string; detail: string }[] | null>(null);
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const [modelCodeModal, setModelCodeModal] = useState<{ open: boolean; title: string; code: string }>({ open: false, title: "", code: "" });
    // 字段设置面板状态
    const [settingsFieldIndex, setSettingsFieldIndex] = useState<number | null>(null);
    const [settingsAnchorEl, setSettingsAnchorEl] = useState<HTMLButtonElement | null>(null);
    // 主键勾选后自增提示框状态
    const [pkAutoIncrPrompt, setPkAutoIncrPrompt] = useState<{ index: number; target: HTMLElement } | null>(null);

    // 列宽可调
    const fieldColResizer = useResizableColumns();
    const indexColResizer = useResizableColumns();
    // 行拖拽排序
    const fieldDrag = useDragReorder(schemaDraftFields, (reordered) => {
        reordered.forEach((f, i) => updateDraftField(i, "id", f.id));
    });
    const indexDrag = useDragReorder(schemaDraftIndexes, (reordered) => {
        reordered.forEach((idx, i) => updateDraftIndex(i, "id", idx.id));
    });

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
                setModelMenuOpen(false);
            }
        }
        if (modelMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [modelMenuOpen]);

    async function handleAIDiagnose() {
        if (!tableDetail || !aiConfigured) return;
        setRunningAiDiagnose(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 800));
            setAiDiagnostics(tableDetail.indexDiagnostics.map((d) => ({ title: d.title, detail: d.detail })));
        } finally {
            setRunningAiDiagnose(false);
        }
    }

    return (
        <section className="page-panel page-panel--wide">
            <div className="page-headline">
                <div>
                    <h2>表设计</h2>
                    <p>{selectedTable ? `当前表：${selectedTable}` : "请先从左侧点击某张表，再进入这里查看结构。"}</p>
                </div>
                <div className="toolbar-actions">
                    <button type="button" className="ghost-button" onClick={() => handleAddField()} disabled={!tableDetail}>
                        新增字段
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setRenameModalOpen(true)} disabled={!tableDetail}>
                        重命名表
                    </button>
                    <button type="button" className="ghost-button" onClick={handleCopyDDL} disabled={!tableDetail}>
                        复制 DDL
                    </button>
                    {onOpenPartitionPage ? (
                        <button type="button" className="ghost-button" onClick={onOpenPartitionPage} disabled={!tableDetail}>
                            分区管理
                        </button>
                    ) : null}
                    <div ref={modelMenuRef} style={{ position: "relative" }}>
                        <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setModelMenuOpen((v) => !v)}
                            disabled={!tableDetail || schemaDraftFields.length === 0}
                        >
                            生成模型 ▼
                        </button>
                        {modelMenuOpen ? (
                            <div
                                className="context-menu"
                                style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", minWidth: 200 }}
                            >
                                {modelOptions.map((opt) => (
                                    <div
                                        key={opt.value}
                                        className="context-menu__item"
                                        onClick={() => {
                                            setModelMenuOpen(false);
                                            const code = generateModelCode(opt.value, selectedTable, schemaDraftFields);
                                            setModelCodeModal({ open: true, title: opt.label, code });
                                        }}
                                    >
                                        {opt.label}
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <NoticeBanner notice={schemaNotice} />

            {!tableDetail ? (
                <div className="empty-block">左侧点开数据库后，单击某张表先查看前 30 行数据；需要改结构时再切到这里。</div>
            ) : (
                <div className="schema-layout">
                    <div className="detail-card schema-form-card">
                        <div className="section-title">
                            <div>
                                <h3>字段结构</h3>
                            </div>
                            <div className="toolbar-actions">
                                <button type="button" className="primary-button" onClick={handleSaveFields} disabled={!tableDetail || isSavingFields}>
                                    {isSavingFields ? "保存中..." : "保存"}
                                </button>
                            </div>
                        </div>
                        <div className="schema-table-shell">
                            <table className="schema-table schema-table--fields" style={fieldColResizer.getTableStyle()}>
                                <thead>
                                    <tr>
                                        <th style={fieldColResizer.getColumnStyle(0)}>字段名<button className="col-resize-handle" onMouseDown={(e) => fieldColResizer.handleResizeStart(0, e)} /></th>
                                        <th style={fieldColResizer.getColumnStyle(1)}>类型<button className="col-resize-handle" onMouseDown={(e) => fieldColResizer.handleResizeStart(1, e)} /></th>
                                        <th style={fieldColResizer.getColumnStyle(2)}>可空<button className="col-resize-handle" onMouseDown={(e) => fieldColResizer.handleResizeStart(2, e)} /></th>
                                        <th style={fieldColResizer.getColumnStyle(3)}>主键<button className="col-resize-handle" onMouseDown={(e) => fieldColResizer.handleResizeStart(3, e)} /></th>
                                        <th style={fieldColResizer.getColumnStyle(4)}>注释<button className="col-resize-handle" onMouseDown={(e) => fieldColResizer.handleResizeStart(4, e)} /></th>
                                        <th style={{ ...fieldColResizer.getColumnStyle(5), width: 80 }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {schemaDraftFields.map((field, index) => (
                                        <tr
                                            key={field.id}
                                            className={`drag-row${fieldDrag.dragIndex === index ? " drag-row--dragging" : ""}${fieldDrag.dropTargetIndex === index && fieldDrag.dragIndex !== null && fieldDrag.dragIndex < index ? " drag-row--over-below" : ""}${fieldDrag.dropTargetIndex === index && fieldDrag.dragIndex !== null && fieldDrag.dragIndex > index ? " drag-row--over-above" : ""}`}
                                            draggable
                                            onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(index)); fieldDrag.handleDragStart(index, e); }}
                                            onDragOver={(e) => fieldDrag.handleDragOver(index, e)}
                                            onDragLeave={() => fieldDrag.handleDragLeave()}
                                            onDrop={(e) => fieldDrag.handleDrop(index, e)}
                                            onDragEnd={() => fieldDrag.handleDragEnd()}
                                            style={{ position: "relative" }}
                                        >
                                            <td>
                                                <div style={{ display: "flex", alignItems: "center" }}>
                                                    <span className="row-drag-handle" title="拖拽排序">
                                                        <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><circle cx="2.5" cy="1.5" r="1.5"/><circle cx="7.5" cy="1.5" r="1.5"/><circle cx="2.5" cy="6" r="1.5"/><circle cx="7.5" cy="6" r="1.5"/><circle cx="2.5" cy="10.5" r="1.5"/><circle cx="7.5" cy="10.5" r="1.5"/></svg>
                                                    </span>
                                                    <input
                                                        value={field.name}
                                                        onChange={(event) => updateDraftField(index, "name", event.target.value)}
                                                        onBlur={(event) => applyFieldSuggestion(index, event.target.value)}
                                                        autoCapitalize="none"
                                                        autoComplete="off"
                                                        spellCheck={false}
                                                    />
                                                </div>
                                            </td>
                                            <td>
                                                <TypeCombobox
                                                    options={fieldTypeOptions}
                                                    value={field.type}
                                                    onChange={(value) => updateDraftField(index, "type", value)}
                                                />
                                            </td>
                                            <td>
                                                <label className="checkbox-cell">
                                                    <input type="checkbox" checked={field.nullable} onChange={(event) => updateDraftField(index, "nullable", event.target.checked)} />
                                                </label>
                                            </td>
                                            <td style={{ position: "relative" }}>
                                                <label className="checkbox-cell">
                                                    <input
                                                        type="checkbox"
                                                        checked={field.primary}
                                                        onChange={(event) => {
                                                            const checked = event.target.checked;
                                                            updateDraftField(index, "primary", checked);
                                                            if (checked && !field.autoIncrement && !isIntegerType(field.type)) {
                                                                const target = (event.currentTarget as HTMLElement).closest("td") as HTMLElement;
                                                                setPkAutoIncrPrompt({ index, target });
                                                            }
                                                            if (!checked) {
                                                                updateDraftField(index, "autoIncrement", false);
                                                            }
                                                        }}
                                                    />
                                                </label>
                                                {pkAutoIncrPrompt?.index === index ? createPortal(
                                                    <div
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{
                                                            position: "absolute",
                                                            top: "100%",
                                                            left: 0,
                                                            zIndex: 60,
                                                            background: "var(--surface-1)",
                                                            border: "1px solid var(--border-soft)",
                                                            borderRadius: 8,
                                                            boxShadow: "0 4px 16px rgba(0,0,0,.12)",
                                                            padding: "8px 10px",
                                                            fontSize: 11.5,
                                                            whiteSpace: "nowrap",
                                                            marginTop: 2,
                                                        }}
                                                    >
                                                        <div style={{ marginBottom: 4, color: "var(--text-primary)" }}>是否同时设为自增？</div>
                                                        <div style={{ display: "flex", gap: 4 }}>
                                                            <button type="button" className="ghost-button" style={{ fontSize: 11, padding: "2px 8px", height: "auto" }} onClick={() => { updateDraftField(index, "autoIncrement", true); setPkAutoIncrPrompt(null); }}>是，自增</button>
                                                            <button type="button" className="ghost-button" style={{ fontSize: 11, padding: "2px 8px", height: "auto" }} onClick={() => setPkAutoIncrPrompt(null)}>不需要</button>
                                                        </div>
                                                    </div>,
                                                    pkAutoIncrPrompt.target,
                                                ) : null}
                                            </td>
                                            <td>
                                                <div className="comment-editor">
                                                    <input value={field.comment} onChange={(event) => updateDraftField(index, "comment", event.target.value)} autoComplete="off" />
                                                    {aiConfigured ? (
                                                        <button type="button" className="mini-ai-button" onClick={() => handleGenerateFieldComment(index)} disabled={field.aiLoading}>
                                                            {field.aiLoading ? "..." : "AI"}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td style={{ display: "flex", gap: 4, alignItems: "center", position: "relative" }}>
                                                <button
                                                    type="button"
                                                    className="icon-btn icon-btn--settings"
                                                    title="字段设置"
                                                    aria-expanded={settingsFieldIndex === index}
                                                    onClick={(event) => {
                                                        if (settingsFieldIndex === index) {
                                                            setSettingsFieldIndex(null);
                                                            setSettingsAnchorEl(null);
                                                            return;
                                                        }
                                                        setSettingsFieldIndex(index);
                                                        setSettingsAnchorEl(event.currentTarget);
                                                    }}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <circle cx="12" cy="12" r="3"></circle>
                                                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"></path>
                                                    </svg>
                                                </button>
                                                <FieldSettingsPanel
                                                    visible={settingsFieldIndex === index}
                                                    fieldType={field.type}
                                                    isMySQL={isMySQL}
                                                    unsigned={field.unsigned || false}
                                                    autoIncrement={field.autoIncrement || false}
                                                    defaultValue={field.defaultValue}
                                                    onUpdate={field.onUpdate || ""}
                                                    charset={field.charset || "utf8mb4"}
                                                    collation={field.collation || "utf8mb4_general_ci"}
                                                    anchorEl={settingsFieldIndex === index ? settingsAnchorEl : null}
                                                    onToggleUnsigned={() => updateDraftField(index, "unsigned", !(field.unsigned || false))}
                                                    onToggleAutoIncrement={() => updateDraftField(index, "autoIncrement", !(field.autoIncrement || false))}
                                                    onChangeDefaultValue={(val) => updateDraftField(index, "defaultValue", val)}
                                                    onToggleOnUpdate={(checked) => updateDraftField(index, "onUpdate", checked ? "CURRENT_TIMESTAMP" : "")}
                                                    onChangeCharset={(val) => updateDraftField(index, "charset", val)}
                                                    onChangeCollation={(val) => updateDraftField(index, "collation", val)}
                                                    onClose={() => {
                                                        setSettingsFieldIndex(null);
                                                        setSettingsAnchorEl(null);
                                                    }}
                                                />
                                                <button type="button" className="icon-btn icon-btn--add" title="在下方插入字段" onClick={() => handleAddField(index)}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                </button>
                                                <button type="button" className="icon-btn icon-btn--delete" title="删除字段" onClick={() => handleDeleteDraftField(index)}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="section-title" style={{ marginTop: 24 }}>
                            <div>
                                <h3>索引结构</h3>
                            </div>
                            <div className="toolbar-actions">
                                <button type="button" className="ghost-button" onClick={handleAddIndex} disabled={!tableDetail}>
                                    新增索引
                                </button>
                                <button type="button" className="primary-button" onClick={handleSaveIndexes} disabled={!tableDetail || isSavingIndexes}>
                                    {isSavingIndexes ? "保存中..." : "保存"}
                                </button>
                            </div>
                        </div>
                        <div className="schema-table-shell">
                            <table className="schema-table schema-table--indexes" style={indexColResizer.getTableStyle()}>
                                <thead>
                                    <tr>
                                        <th style={indexColResizer.getColumnStyle(0)}>索引名<button className="col-resize-handle" onMouseDown={(e) => indexColResizer.handleResizeStart(0, e)} /></th>
                                        <th style={indexColResizer.getColumnStyle(1)}>字段<button className="col-resize-handle" onMouseDown={(e) => indexColResizer.handleResizeStart(1, e)} /></th>
                                        <th style={indexColResizer.getColumnStyle(2)}>唯一<button className="col-resize-handle" onMouseDown={(e) => indexColResizer.handleResizeStart(2, e)} /></th>
                                        {indexTypeOptions.length > 0 ? <th style={indexColResizer.getColumnStyle(3)}>类型<button className="col-resize-handle" onMouseDown={(e) => indexColResizer.handleResizeStart(3, e)} /></th> : null}
                                        <th style={{ ...indexColResizer.getColumnStyle(indexTypeOptions.length > 0 ? 4 : 3), width: 48 }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {schemaDraftIndexes.length === 0 ? (
                                        <tr>
                                            <td colSpan={indexTypeOptions.length > 0 ? 5 : 4} style={{ textAlign: "center", color: "#999" }}>暂无索引，点击上方「新增索引」添加</td>
                                        </tr>
                                    ) : (
                                        schemaDraftIndexes.map((idx, index) => (
                                            <tr
                                                key={idx.id}
                                                className={`drag-row${indexDrag.dragIndex === index ? " drag-row--dragging" : ""}${indexDrag.dropTargetIndex === index && indexDrag.dragIndex !== null && indexDrag.dragIndex < index ? " drag-row--over-below" : ""}${indexDrag.dropTargetIndex === index && indexDrag.dragIndex !== null && indexDrag.dragIndex > index ? " drag-row--over-above" : ""}`}
                                                draggable
                                                onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(index)); indexDrag.handleDragStart(index, e); }}
                                                onDragOver={(e) => indexDrag.handleDragOver(index, e)}
                                                onDragLeave={() => indexDrag.handleDragLeave()}
                                                onDrop={(e) => indexDrag.handleDrop(index, e)}
                                                onDragEnd={() => indexDrag.handleDragEnd()}
                                            >
                                                <td>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        <span className="row-drag-handle" title="拖拽排序">
                                                            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><circle cx="2.5" cy="1.5" r="1.5"/><circle cx="7.5" cy="1.5" r="1.5"/><circle cx="2.5" cy="6" r="1.5"/><circle cx="7.5" cy="6" r="1.5"/><circle cx="2.5" cy="10.5" r="1.5"/><circle cx="7.5" cy="10.5" r="1.5"/></svg>
                                                        </span>
                                                        <input
                                                            value={idx.name}
                                                            onChange={(event) => updateDraftIndex(index, "name", event.target.value)}
                                                            placeholder="索引名"
                                                            style={{ flex: 1, minWidth: 0 }}
                                                            autoCapitalize="none"
                                                        />
                                                        <button
                                                            type="button"
                                                            className="mini-ai-button"
                                                            title={aiConfigured ? "AI 生成索引名" : "尚未配置 AI"}
                                                            onClick={() => {
                                                                if (!aiConfigured) {
                                                                    return;
                                                                }
                                                                if (idx.columns.length === 0) {
                                                                    return;
                                                                }
                                                                handleGenerateIndexName(index, selectedTable);
                                                            }}
                                                            disabled={!aiConfigured || !idx.columns.length || idx.aiLoading}
                                                        >
                                                            {idx.aiLoading ? "..." : "AI"}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>
                                                    <IndexFieldSelector
                                                        options={fieldNames}
                                                        value={idx.columns}
                                                        onChange={(val) => updateDraftIndex(index, "columns", val)}
                                                        placeholder="选择字段"
                                                    />
                                                </td>
                                                <td>
                                                    <label className="checkbox-cell">
                                                        <input type="checkbox" checked={idx.unique} onChange={(event) => updateDraftIndex(index, "unique", event.target.checked)} />
                                                    </label>
                                                </td>
                                                {indexTypeOptions.length > 0 ? (
                                                    <td>
                                                        <select
                                                            value={idx.indexType}
                                                            onChange={(event) => updateDraftIndex(index, "indexType", event.target.value)}
                                                        >
                                                            {indexTypeOptions.map((type) => (
                                                                <option key={type} value={type}>
                                                                    {type}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                ) : null}
                                                <td>
                                                    <button type="button" className="icon-btn icon-btn--delete" title="删除索引" onClick={() => handleDeleteDraftIndex(index)}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="3 6 5 6 21 6"></polyline>
                                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="section-title" style={{ marginTop: 24 }}>
                            <div>
                                <h3>DDL 语句</h3>
                            </div>
                            <div className="toolbar-actions">
                                <button type="button" className="ghost-button" onClick={handleCopyDDL}>
                                    复制 DDL
                                </button>
                                <button type="button" className="ghost-button" onClick={handleExportDDL} disabled={isExporting}>
                                    {isExporting ? "导出中..." : "导出 SQL"}
                                </button>
                            </div>
                        </div>
                        <div className="code-block code-block--wide code-block--tall">
                            <pre dangerouslySetInnerHTML={{ __html: highlightSQL(tableDetail.ddl) }} />
                        </div>
                    </div>

                    <div className="schema-detail-grid">
                        <div className="detail-card schema-detail-card">
                            <div className="section-title">
                                <div>
                                    <h3>索引诊断</h3>
                                </div>
                                {aiConfigured ? (
                                    <button
                                        type="button"
                                        className="mini-ai-button"
                                        onClick={handleAIDiagnose}
                                        disabled={runningAiDiagnose}
                                    >
                                        {runningAiDiagnose ? "诊断中..." : "AI 诊断"}
                                    </button>
                                ) : null}
                            </div>
                            {aiDiagnostics ? (
                                <ul className="diagnostic-list">
                                    {aiDiagnostics.map((item, i) => (
                                        <li key={`${item.title}-${i}`}>
                                            <strong>{item.title}</strong>
                                            <span>{item.detail}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="diagnostic-empty">
                                    {aiConfigured ? "点击右上角「AI 诊断」查看索引诊断结果。" : "配置 AI 后可使用智能索引诊断功能。"}
                                </div>
                            )}
                        </div>

                        <div className="detail-card schema-detail-card">
                            <div className="section-title">
                                <div>
                                    <h3>结构变更预览 SQL</h3>
                                </div>
                            </div>
                            {currentAlterSQL.trim() ? (
                                <div className="code-block code-block--wide schema-alter-block">
                                    <pre dangerouslySetInnerHTML={{ __html: highlightSQL(currentAlterSQL) }} />
                                </div>
                            ) : (
                                <div className="diagnostic-empty">暂无结构变更。</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {renameModalOpen ? (
                <div className="modal-backdrop" onClick={() => setRenameModalOpen(false)}>
                    <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>重命名表</h3>
                                <p>这个操作不常用，所以收进右上角按钮里。</p>
                            </div>
                        </div>
                        <label className="field">
                            <span>新表名</span>
                            <input value={renameTableName} onChange={(event) => setRenameTableName(event.target.value)} autoCapitalize="none" />
                        </label>
                        <div className="toolbar-actions" style={{ justifyContent: "flex-end", width: "100%", gap: 8 }}>
                            <button type="button" className="ghost-button" onClick={() => setRenameModalOpen(false)}>
                                取消
                            </button>
                            <button type="button" className="primary-button" onClick={handleRenameTable} disabled={isRenamingTable}>
                                {isRenamingTable ? "处理中..." : "确认重命名"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {alterPreview ? (
                <div className="modal-backdrop" onClick={() => setAlterPreview(null)}>
                    <div className="modal-card modal-card--wide alter-preview-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="section-title">
                            <div>
                                <h3>{alterPreview.title}</h3>
                                <p>确认无误后再执行，避免误改表结构。</p>
                            </div>
                        </div>
                        <div className="code-block code-block--wide alter-preview-modal__sql">
                            <pre dangerouslySetInnerHTML={{ __html: highlightSQL(alterPreview.sql) }} />
                        </div>
                        {alterPreview.error ? (
                            <div className="alter-preview-modal__error" role="alert">
                                <div className="alter-preview-modal__error-head">
                                    <span>执行失败</span>
                                    <button type="button" className="mini-ghost-button" onClick={() => pushToast("info", "字段更新失败", alterPreview.error || "未获取到错误详情")}>
                                        查看详情
                                    </button>
                                </div>
                                <pre>{alterPreview.error}</pre>
                            </div>
                        ) : null}
                        <div className="toolbar-actions" style={{ justifyContent: "flex-end", width: "100%" }}>
                            <button type="button" className="ghost-button" onClick={() => setAlterPreview(null)} disabled={isSavingFields || isSavingIndexes}>
                                取消
                            </button>
                            <button type="button" className="primary-button" onClick={handleConfirmAlterPreview} disabled={isSavingFields || isSavingIndexes}>
                                {isSavingFields || isSavingIndexes ? "执行中..." : alterPreview.error ? "再次执行" : "确认执行"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {modelCodeModal.open ? (
                <div className="modal-backdrop" onClick={() => setModelCodeModal({ open: false, title: "", code: "" })}>
                    <div className="modal-card modal-card--wide" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 720 }}>
                        <div className="section-title">
                            <div>
                                <h3>{modelCodeModal.title}</h3>
                                <p>基于当前表结构生成的代码，可直接复制使用。</p>
                            </div>
                        </div>
                        <div className="code-block code-block--wide code-block--tall" style={{ maxHeight: 480 }}>
                            <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}><code>{modelCodeModal.code}</code></pre>
                        </div>
                        <div className="toolbar-actions" style={{ marginTop: 16, justifyContent: "flex-end", width: "100%" }}>
                            <button
                                type="button"
                                className="ghost-button"
                                onClick={() => setModelCodeModal({ open: false, title: "", code: "" })}
                            >
                                关闭
                            </button>
                            <button
                                type="button"
                                className="primary-button"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(modelCodeModal.code);
                                        pushToast("success", "复制成功", "代码已复制到剪贴板");
                                    } catch {
                                        pushToast("error", "复制失败", "请稍后重试");
                                    }
                                }}
                            >
                                复制代码
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
