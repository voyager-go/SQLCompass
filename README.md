# SQLPilot 🚀

<p align="center">
  <strong>轻量级桌面数据库客户端 | Lightweight Desktop Database Client</strong>
</p>

<p align="center">
  🌐 <a href="README.md">简体中文</a> | <a href="README.en.md">English</a>
</p>

---

## 🌟 为什么选择 SQLPilot？

### 极简而不简单

市面上大多数数据库工具功能臃肿，80% 的功能你永远不会用到，却要为此承担数百兆的内存占用。**SQLPilot 的设计理念是：只保留开发者真正需要的核心功能，让每一次操作都如丝般顺滑。**

我们相信，优秀的开发工具应该是：**轻量、快速、无干扰**。

---

## ✨ 核心亮点

| 特性 | 描述 |
|------|------|
| 🪶 **极致轻量** | 基于 Wails 构建，内存占用仅为传统 Electron 应用的 1/10 |
| 🔌 **多数据库支持** | MySQL、MariaDB、PostgreSQL、SQLite、ClickHouse、MongoDB、Redis 一站式管理 |
| 🤖 **AI 智能助手** | 自然语言生成 SQL、SQL 优化建议、智能字段注释、与数据库对话 |
| 🎨 **表设计器** | 可视化表结构设计，DDL 实时预览，字段类型智能提示 |
| 📝 **专业编辑器** | 集成 Monaco Editor，语法高亮、智能补全、SQL 格式化 |
| 📊 **数据导入导出** | 支持 CSV、Excel、SQL 格式，一键完成数据迁移 |
| 🎯 **个性化主题** | 内置多种配色方案，支持完全自定义，实时预览效果 |
| 📜 **查询历史** | 自动保存所有查询记录，支持快速回溯与复用 |

---

## 🚀 快速开始

### 环境要求

- Go 1.21+
- Node.js 18+
- macOS / Windows / Linux

### 安装依赖

```bash
cd frontend
npm install
```

### 开发模式

```bash
# Web 预览（浏览器）
./start.sh web

# 桌面应用
./start.sh desktop
```

### 构建

```bash
cd frontend
npm run build

# 构建桌面应用
wails build
```

---

## 🛠️ 技术栈

- **后端**: Go + Wails v2
- **前端**: React 18 + TypeScript
- **编辑器**: Monaco Editor
- **UI 组件**: 自定义组件库
- **构建**: Vite

---

## 💡 开发初衷

> "目前市面上的数据库工具功能繁杂，许多高级功能在日常开发中极少使用，却要为此付出巨大的内存代价。我认为，开发人员真正需要的数据库工具应该是**简洁、高效、触手可及**的。它不需要繁复的设计，只需要在你需要的时候，快速、准确地完成工作。"
> 
> —— SQLPilot 作者

SQLPilot 的诞生源于对现有工具的不满：
- ❌ 启动慢、占用内存高
- ❌ 界面复杂，学习成本高
- ❌ 功能冗余，90% 用不上
- ❌ 响应迟钝，打断心流

我们希望打造一款：**打开即用、用完即走**的数据库工具。

---

## 📸 功能预览

### 连接管理
简洁的分组管理，支持多种数据库引擎，一键测试连接。

### SQL 编辑器
基于 Monaco Editor，提供专业的 SQL 编辑体验：
- 语法高亮与错误提示
- 智能代码补全
- SQL 格式化与美化
- 查询历史自动保存

### AI 助手
- 📝 **SQL 生成**: 用自然语言描述需求，自动生成 SQL
- 🔧 **SQL 优化**: 分析执行计划，给出优化建议
- 💬 **智能对话**: 与数据库对话，获取数据分析洞察
- 🏷️ **字段注释**: AI 智能生成字段注释，提升代码可读性

### 表设计器
可视化设计表结构，实时预览 DDL，支持字段类型智能推荐。

### 主题定制
从深色到浅色，从简约到 vibrant，打造专属于你的开发环境。

---

## 🔧 AI 配置

在项目开发阶段，可通过环境变量或应用内设置页面配置 AI：

```bash
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_MODEL_NAME=deepseek-ai/DeepSeek-V3.2
```

---

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ for developers who value simplicity
</p>
