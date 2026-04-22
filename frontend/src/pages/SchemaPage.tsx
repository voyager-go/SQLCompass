import { useState, useRef, useEffect } from "react";
import { NoticeBanner } from "../components/NoticeBanner";
import { TypeCombobox } from "../components/TypeCombobox";
import type { TableDetail, SchemaDraftField } from "../types/runtime";
import type { SchemaDraftIndex } from "../lib/utils";
import { getIndexTypeOptions } from "../lib/utils";
import { highlightSQL } from "../lib/sqlHighlight";

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
    lines.push("    // TODO: generate getters and setters");
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
    handleAddField: () => void;
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
    handleSaveFields: () => Promise<void>;
    isSavingFields: boolean;
    handleSaveIndexes: () => Promise<void>;
    isSavingIndexes: boolean;
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
    handleSaveFields,
    isSavingFields,
    handleSaveIndexes,
    isSavingIndexes,
}: SchemaPageProps) {
    const indexTypeOptions = getIndexTypeOptions(activeEngine);
    const [runningAiDiagnose, setRunningAiDiagnose] = useState(false);
    const [aiDiagnostics, setAiDiagnostics] = useState<{ title: string; detail: string }[] | null>(null);
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const [modelCodeModal, setModelCodeModal] = useState<{ open: boolean; title: string; code: string }>({ open: false, title: "", code: "" });

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
                    <button type="button" className="ghost-button" onClick={handleAddField} disabled={!tableDetail}>
                        新增字段
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setRenameModalOpen(true)} disabled={!tableDetail}>
                        重命名表
                    </button>
                    <button type="button" className="ghost-button" onClick={handleCopyDDL} disabled={!tableDetail}>
                        复制 DDL
                    </button>
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
                            <table className="schema-table">
                                <thead>
                                    <tr>
                                        <th>字段名</th>
                                        <th>类型</th>
                                        <th>可空</th>
                                        <th>默认值</th>
                                        <th>主键</th>
                                        <th>自增</th>
                                        <th>注释</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {schemaDraftFields.map((field, index) => (
                                        <tr key={field.id}>
                                            <td>
                                                <input
                                                    value={field.name}
                                                    onChange={(event) => updateDraftField(index, "name", event.target.value)}
                                                    onBlur={(event) => applyFieldSuggestion(index, event.target.value)}
                                                />
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
                                            <td>
                                                <input value={field.defaultValue} onChange={(event) => updateDraftField(index, "defaultValue", event.target.value)} />
                                            </td>
                                            <td>
                                                <label className="checkbox-cell">
                                                    <input type="checkbox" checked={field.primary} onChange={(event) => updateDraftField(index, "primary", event.target.checked)} />
                                                </label>
                                            </td>
                                            <td>
                                                <label className="checkbox-cell">
                                                    <input type="checkbox" checked={field.autoIncrement} onChange={(event) => updateDraftField(index, "autoIncrement", event.target.checked)} />
                                                </label>
                                            </td>
                                            <td>
                                                <div className="comment-editor">
                                                    <input value={field.comment} onChange={(event) => updateDraftField(index, "comment", event.target.value)} />
                                                    {field.needsAiComment ? (
                                                        <button type="button" className="mini-ai-button" onClick={() => handleGenerateFieldComment(index)} disabled={field.aiLoading}>
                                                            {field.aiLoading ? "生成中" : "AI"}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td>
                                                <button type="button" className="icon-btn icon-btn--delete" title="删除字段" onClick={() => handleDeleteDraftField(index)}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                    </svg>
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
                            <table className="schema-table">
                                <thead>
                                    <tr>
                                        <th>索引名</th>
                                        <th>字段</th>
                                        <th>唯一</th>
                                        {indexTypeOptions.length > 0 ? <th>类型</th> : null}
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {schemaDraftIndexes.length === 0 ? (
                                        <tr>
                                            <td colSpan={indexTypeOptions.length > 0 ? 5 : 4} style={{ textAlign: "center", color: "#999" }}>暂无索引，点击上方「新增索引」添加</td>
                                        </tr>
                                    ) : (
                                        schemaDraftIndexes.map((idx, index) => (
                                            <tr key={idx.id}>
                                                <td>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        <input
                                                            value={idx.name}
                                                            onChange={(event) => updateDraftIndex(index, "name", event.target.value)}
                                                            placeholder="索引名"
                                                            style={{ flex: 1, minWidth: 60 }}
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
                                                            disabled={!aiConfigured || !idx.columns.length}
                                                        >
                                                            AI
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>
                                                    <input
                                                        value={idx.columns.join(",")}
                                                        onChange={(event) => updateDraftIndex(index, "columns", event.target.value.split(",").map((c) => c.trim()).filter(Boolean))}
                                                        placeholder="字段1,字段2"
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
                            <input value={renameTableName} onChange={(event) => setRenameTableName(event.target.value)} />
                        </label>
                        <div className="toolbar-actions toolbar-actions--end">
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
                        <div className="toolbar-actions toolbar-actions--end" style={{ marginTop: 16 }}>
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
                                    await navigator.clipboard.writeText(modelCodeModal.code);
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
