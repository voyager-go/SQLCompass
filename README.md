# SQLCompass

轻量级桌面数据库客户端，支持 MySQL、PostgreSQL、SQLite、ClickHouse、MongoDB、Redis 等主流数据库。

---

## 功能特性

- **多数据库支持**：统一管理多种数据库连接
- **SQL 编辑器**：Monaco Editor，支持语法高亮、补全、格式化
- **AI 助手**：自然语言生成 SQL、SQL 优化、字段注释
- **表设计器**：可视化 DDL 设计，实时预览
- **数据导入导出**：CSV、Excel、SQL 格式
- **主题定制**：明暗主题切换
- **查询历史**：自动保存，快速复用

---

## 环境要求

- Go 1.21+
- Node.js 18+
- macOS / Windows / Linux

## 开始开发

```bash
# 安装前端依赖
cd frontend
npm install

# Web 预览（浏览器）
./start.sh web

# 桌面应用
./start.sh desktop
```

## 构建

```bash
# 构建前端
cd frontend
npm run build

# 构建桌面应用
wails build
```

## AI 配置

通过环境变量或应用内设置配置：

```bash
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_MODEL_NAME=deepseek-ai/DeepSeek-V3.2
```

## 技术栈

- **后端**: Go + Wails v2
- **前端**: React 18 + TypeScript
- **编辑器**: Monaco Editor
- **构建**: Vite

## License

[MIT](LICENSE)
