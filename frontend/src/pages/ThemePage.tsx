import type { ChangeEvent } from "react";

type ThemeMode = "light" | "dark" | "custom";

type CustomTheme = {
    navFontSize: number;
    resultFontSize: number;
    fontColor: string;
    accentColor: string;
    backgroundColor: string;
    backgroundImage: string | null;
};

type ToastTone = "success" | "error" | "info";

export function ThemePage({
    themeMode,
    setThemeMode,
    customTheme,
    setCustomTheme,
    pushToast,
}: {
    themeMode: ThemeMode;
    setThemeMode: (mode: ThemeMode) => void;
    customTheme: CustomTheme;
    setCustomTheme: (updater: (current: CustomTheme) => CustomTheme) => void;
    pushToast: (tone: ToastTone, title: string, message: string) => void;
}) {
    const handleSaveTheme = () => {
        window.localStorage.setItem("sql-compass-custom-theme", JSON.stringify(customTheme));
        pushToast("success", "主题已保存", "自定义主题设置已保存到本地");
    };

    const handleResetTheme = () => {
        const defaultTheme = { navFontSize: 14, resultFontSize: 14, fontColor: "#1f2937", accentColor: "#3b82f6", backgroundColor: "#f8fcfb", backgroundImage: null };
        setCustomTheme(() => defaultTheme);
        window.localStorage.setItem("sql-compass-custom-theme", JSON.stringify(defaultTheme));
        pushToast("success", "主题已重置", "已恢复默认设置");
    };

    const backgroundPresets = [
        { name: "淡青", value: "#e8f4f8" },
        { name: "暖灰", value: "#f5f5f0" },
        { name: "淡紫", value: "#f3f0f7" },
        { name: "薄荷", value: "#f0f7f4" },
        { name: "浅蓝", value: "#f0f4f8" },
        { name: "米白", value: "#faf8f5" },
        { name: "淡粉", value: "#f8f0f5" },
    ];

    const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            setCustomTheme((current) => ({ ...current, backgroundImage: e.target?.result as string }));
        };
        reader.readAsDataURL(file);
    };

    const handleClearBackground = () => {
        setCustomTheme((current) => ({ ...current, backgroundImage: null }));
    };

    const getPreviewBackgroundColor = () => {
        if (themeMode === "dark") return "#0b1220";
        if (themeMode === "light") return "#f8fcfb";
        return customTheme.backgroundColor;
    };

    const getPreviewTextColor = () => {
        if (themeMode === "dark") return "#e6edf7";
        if (themeMode === "light") return "#1f2937";
        return customTheme.fontColor;
    };

    const livePreviewStyle: React.CSSProperties = {
        fontSize: `${customTheme.resultFontSize}px`,
        color: getPreviewTextColor(),
        backgroundColor: getPreviewBackgroundColor(),
        ...(themeMode === "custom" && customTheme.backgroundImage
            ? { backgroundImage: `url(${customTheme.backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" }
            : {}),
    };

    return (
        <section className="page-panel page-panel--full">
            <div className="theme-toolbar">
                <div className="toolbar-actions">
                    <button type="button" className="ghost-button" onClick={handleResetTheme}>重置</button>
                    <button type="button" className="primary-button" onClick={handleSaveTheme}>保存</button>
                </div>
            </div>

            <div className="theme-workspace">
                <div className="theme-controls">
                    <div className="theme-section">
                        <div className="theme-section-title">
                            <h4>主题模式</h4>
                        </div>
                        <div className="theme-mode-grid">
                            <button type="button" className={`theme-mode-card${themeMode === "light" ? " theme-mode-card--active" : ""}`} onClick={() => setThemeMode("light")}>
                                <div className="theme-mode-preview theme-mode-preview--light"></div>
                                <span>浅色模式</span>
                            </button>
                            <button type="button" className={`theme-mode-card${themeMode === "dark" ? " theme-mode-card--active" : ""}`} onClick={() => setThemeMode("dark")}>
                                <div className="theme-mode-preview theme-mode-preview--dark"></div>
                                <span>暗黑模式</span>
                            </button>
                            <button type="button" className={`theme-mode-card${themeMode === "custom" ? " theme-mode-card--active" : ""}`} onClick={() => setThemeMode("custom")}>
                                <div className="theme-mode-preview theme-mode-preview--custom"></div>
                                <span>自定义</span>
                            </button>
                        </div>
                    </div>

                    {themeMode === "custom" && (
                        <>
                            <div className="theme-section">
                                <div className="theme-section-title">
                                    <h4>字体 & 颜色</h4>
                                    <p>拖动滑块或选择颜色即可实时预览效果</p>
                                </div>
                                <div className="theme-control-list">
                                    <label className="theme-slider-item">
                                        <div className="theme-label-row">
                                            <span className="theme-label-text">导航字体</span>
                                            <span className="theme-value-badge">{customTheme.navFontSize}px</span>
                                        </div>
                                        <input type="range" min="12" max="20" step="1" value={customTheme.navFontSize} onChange={(e) => setCustomTheme((c) => ({ ...c, navFontSize: Number(e.target.value) }))} />
                                    </label>
                                    <label className="theme-slider-item">
                                        <div className="theme-label-row">
                                            <span className="theme-label-text">结果字体</span>
                                            <span className="theme-value-badge">{customTheme.resultFontSize}px</span>
                                        </div>
                                        <input type="range" min="12" max="20" step="1" value={customTheme.resultFontSize} onChange={(e) => setCustomTheme((c) => ({ ...c, resultFontSize: Number(e.target.value) }))} />
                                    </label>
                                    <div className="theme-color-pair">
                                        <label className="theme-color-item">
                                            <span className="theme-label-text">字体颜色</span>
                                            <div className="color-swatch-row">
                                                <input type="color" value={customTheme.fontColor} onChange={(e) => setCustomTheme((c) => ({ ...c, fontColor: e.target.value }))} className="color-swatch-input" />
                                                <code className="color-hex-code">{customTheme.fontColor}</code>
                                            </div>
                                        </label>
                                        <label className="theme-color-item">
                                            <span className="theme-label-text">强调色</span>
                                            <div className="color-swatch-row">
                                                <input type="color" value={customTheme.accentColor} onChange={(e) => setCustomTheme((c) => ({ ...c, accentColor: e.target.value }))} className="color-swatch-input" />
                                                <code className="color-hex-code">{customTheme.accentColor}</code>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="theme-section">
                                <div className="theme-section-title">
                                    <h4>背景颜色</h4>
                                    <p>选择预设或自定义背景色</p>
                                </div>
                                <div className="bg-color-presets">
                                    {backgroundPresets.map((preset) => (
                                        <button
                                            key={preset.value}
                                            type="button"
                                            className={`bg-color-preset${customTheme.backgroundColor === preset.value ? " bg-color-preset--active" : ""}`}
                                            style={{ backgroundColor: preset.value }}
                                            onClick={() => setCustomTheme((c) => ({ ...c, backgroundColor: preset.value }))}
                                            title={preset.name}
                                        >
                                            <span className="bg-color-preset__name">{preset.name}</span>
                                        </button>
                                    ))}
                                    <div className="bg-color-custom">
                                        <input
                                            type="color"
                                            value={customTheme.backgroundColor}
                                            onChange={(e) => setCustomTheme((c) => ({ ...c, backgroundColor: e.target.value }))}
                                            className="bg-color-input"
                                            title="自定义背景色"
                                        />
                                        <code className="bg-color-hex">{customTheme.backgroundColor}</code>
                                    </div>
                                </div>
                            </div>

                            <div className="theme-section">
                                <div className="theme-section-title">
                                    <h4>背景图片</h4>
                                </div>
                                <div className="background-upload-compact">
                                    {customTheme.backgroundImage ? (
                                        <div className="bg-thumb-wrap">
                                            <img src={customTheme.backgroundImage} alt="BG" className="bg-thumb-img" />
                                            <button type="button" className="text-button text-button--danger text-button--sm" onClick={handleClearBackground}>移除</button>
                                        </div>
                                    ) : (
                                        <label className="bg-upload-btn">
                                            <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                                            上传背景图
                                        </label>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="theme-preview-panel" style={livePreviewStyle}>
                    <div className="theme-preview-inner">
                        <div className="preview-mock-sidebar" style={{
                            background: themeMode === "dark" ? "rgba(20, 25, 35, 0.6)" : "rgba(245, 248, 252, 0.6)",
                        }}>
                            <div className="preview-brand">
                                <strong style={{ fontSize: `${Math.max(12, customTheme.navFontSize - 2)}px` }}>SQLCompass</strong>
                                <span style={{ fontSize: `${Math.max(10, customTheme.navFontSize - 4)}px`, opacity: 0.6 }}>数据库客户端</span>
                            </div>
                            {["连接管理", "SQL 查询", "历史记录", "表设计", "AI 设置"].map((item) => (
                                <div key={item} className="preview-nav-item" style={{
                                    backgroundColor: item === "连接管理"
                                        ? (themeMode === "dark" ? "rgba(59, 130, 246, 0.15)" : `color-mix(in srgb, ${customTheme.accentColor} 10%)`)
                                        : "transparent",
                                    borderLeftColor: item === "连接管理" ? (themeMode === "dark" ? "#3b82f6" : customTheme.accentColor) : "transparent",
                                    color: item === "连接管理" ? (themeMode === "dark" ? "#3b82f6" : customTheme.accentColor) : undefined,
                                    fontSize: `${customTheme.navFontSize - 1}px`,
                                }}>
                                    {item}
                                </div>
                            ))}
                        </div>
                        <div className="preview-mock-content">
                            <div className="preview-mock-header">
                                <strong style={{ fontSize: `${customTheme.resultFontSize + 2}px` }}>连接列表</strong>
                            </div>
                            <div className="preview-mock-cards">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="preview-mock-card" style={{
                                        background: themeMode === "dark" ? "rgba(30, 35, 45, 0.7)" : "rgba(255, 255, 255, 0.7)",
                                        borderColor: themeMode === "dark" ? "rgba(255, 255, 255, 0.1)" : `color-mix(in srgb, ${customTheme.fontColor} 15%)`,
                                        borderRadius: 14,
                                        padding: "16px 18px",
                                    }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <strong style={{ fontSize: `${customTheme.resultFontSize}px`, color: getPreviewTextColor() }}>MySQL-Docker-{i}</strong>
                                            <span className="preview-badge" style={{ backgroundColor: themeMode === "dark" ? "rgba(59, 130, 246, 0.15)" : `color-mix(in srgb, ${customTheme.accentColor} 12%)`, color: themeMode === "dark" ? "#3b82f6" : customTheme.accentColor, fontSize: `${Math.max(11, customTheme.resultFontSize - 3)}px` }}>运行中</span>
                                        </div>
                                        <div style={{ marginTop: 6, fontSize: `${Math.max(11, customTheme.resultFontSize - 2)}px`, opacity: 0.55 }}>127.0.0.1:3306 / docker_db_{i}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="preview-mock-editor" style={{
                                background: themeMode === "dark" ? "rgba(20, 25, 35, 0.5)" : "rgba(255, 255, 255, 0.5)",
                                borderColor: themeMode === "dark" ? "rgba(255, 255, 255, 0.1)" : `color-mix(in srgb, ${customTheme.fontColor} 12%)`,
                            }}>
                                <div style={{ fontFamily: "monospace", fontSize: `${Math.max(11, customTheme.resultFontSize - 2)}px`, lineHeight: 1.7 }}>
                                    <span style={{ color: themeMode === "dark" ? "#7aa2ff" : `color-mix(in srgb, ${customTheme.accentColor} 70%)` }}>SELECT</span>{" "}
                                    <span>*</span>{" "}
                                    <span style={{ color: themeMode === "dark" ? "#7aa2ff" : `color-mix(in srgb, ${customTheme.accentColor} 70%)` }}>FROM</span>{" "}
                                    <span>users</span>{" "}
                                    <span style={{ color: themeMode === "dark" ? "#7aa2ff" : `color-mix(in srgb, ${customTheme.accentColor} 70%)` }}>WHERE</span>{" "}
                                    <span>status</span> = <span style={{ color: themeMode === "dark" ? "#85d6a5" : "#059669" }}>&apos;active&apos;</span>{" "}
                                    <span style={{ color: themeMode === "dark" ? "#7aa2ff" : `color-mix(in srgb, ${customTheme.accentColor} 70%)` }}>LIMIT</span>{" "}
                                    <span>50</span>;
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
