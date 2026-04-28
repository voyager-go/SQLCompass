# SQLCompass

一款面向 DBA 和后端开发者的桌面数据库客户端，深度支持 MySQL / PostgreSQL / SQLite / ClickHouse / MongoDB / Redis 等主流数据库。

[English](./README.en.md)

![工作台](./docs/preview/connection.png)

---

## 核心功能

### 多数据库统一管理
集中管理所有数据库连接，自动识别数据库类型，连接状态一目了然。

### AI 智能助手
用自然语言描述需求，AI 自动生成 SQL。支持 SQL 美化、字段注释生成。执行前强制预览，确认后再操作，保障数据安全。

| 功能 | 说明 |
|------|------|
| 自然语言 → SQL | 描述业务需求，AI 生成对应查询 |
| SQL 美化 | 一键格式化杂乱 SQL |
| 字段注释生成 | AI 分析字段命名，自动生成注释 |

![AI 对话](./docs/preview/chat_1.png)

![AI 对话](./docs/preview/chat_2.png)

![AI 对话](./docs/preview/chat_3.png)

### 查询数据
智能SQL补全，简单优雅的SQL编辑器，支持事务，支持导入、导出，支持数据库、数据表的筛选等。

![查询表数据](./docs/preview/table_select.png)

### 可视化表设计器
拖拽式 DDL 设计，实时预览生成语句，支持字段类型、索引、外键、字符集等完整配置。

![表设计](./docs/preview/table_design.png)

### 数据导入导出
支持 CSV、Excel、SQL 格式的批量导入导出，提供智能数据填充功能。

| 导入 | 导出 |
|------|------|
| CSV / Excel / SQL 文件导入 | 查询结果导出为 CSV / Excel / SQL |
| 智能数据填充（自动识别主键、序号等） | 普通填充（直接写入） |

![智能填充](./docs/preview/intelligent_data_filling_1.png)
![智能填充](./docs/preview/intelligent_data_filling_2.png)
![常规填充](./docs/preview/common_data_filling_1.png)

### 查询历史
每次查询自动保存，支持快速回溯。

![查询历史](./docs/preview/workbench_sql_history.png)

### 其他功能
- **查询历史**：每次查询自动保存，支持快速回溯
- **双主题**：明色 / 暗色主题一键切换
- **DDL 预览**：所有结构变更执行前先预览 SQL
- **安全防护**：危险操作（UPDATE/DELETE）强制二次确认

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | **Go + Wails v2** |
| 前端 | React 18 + TypeScript + Vite |
| SQL 编辑器 | Monaco Editor |
| 数据库驱动 | go-sql-driver/mysql、pgx、go-sqlite3、clickhouse-go、mongo-driver、go-redis |

---

## 环境要求

- **Go** 1.21+
- **Node.js** 18+
- **npm** 或 **pnpm**
- macOS / Windows / Linux

---

## 快速开始

### 安装依赖

```bash
# 前端依赖
cd frontend && npm install

# Wails CLI（如果没有）
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### 开发模式

```bash
# Web 浏览器预览（无需编译桌面应用）
./start.sh web

# 桌面应用（热重载）
./start.sh desktop
```

### 构建

```bash
# 构建前端资源
cd frontend && npm run build

# 构建桌面应用
wails build
```

构建产物位于 `build/bin/` 目录。

---

## AI 配置

支持接入 SiliconFlow API 或其他兼容 OpenAI 接口的大模型服务。

### 方式一：环境变量

```bash
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_MODEL_NAME=deepseek-ai/DeepSeek-V3.2
```

### 方式二：应用内设置

启动应用后，点击左下角 **设置 → AI** 填写 API Key、接口地址和模型名称。

---

## 支持的数据库

| 数据库 | 连接管理 | SQL 查询 | 表设计器 | AI 生成 | 导入导出 |
|--------|:--------:|:--------:|:--------:|:--------:|:--------:|
| MySQL | ✅ | ✅ | ✅ | ✅ | ✅ |
| PostgreSQL | ✅ | ✅ | ✅ | ✅ | — |
| SQLite | ✅ | ✅ | ✅ | ✅ | — |
| ClickHouse | ✅ | ✅ | — | ✅ | — |
| MongoDB | ✅ | ✅ | — | ✅ | ✅ |
| Redis | ✅ | ✅ | — | — | — |

> ✅ = 完全支持，— = 暂不支持

---

## 目录结构

```
SQLTool/
├── app.go               # Wails 应用入口
├── main.go              # 程序主入口
├── wails.json           # Wails 构建配置
├── internal/            # Go 后端代码
│   ├── ai/              # AI 推理逻辑
│   ├── database/        # 数据库驱动封装
│   ├── history/          # 查询历史
│   ├── impexp/          # 导入导出
│   └── schema/          # 表设计 DDL 构建
├── frontend/            # React 前端
│   └── src/
│       ├── components/  # 可复用组件
│       ├── hooks/       # React Hooks
│       ├── pages/       # 页面组件
│       └── lib/         # 工具函数
└── docs/                # 文档和截图
```

---

## License

[MIT](./LICENSE)
