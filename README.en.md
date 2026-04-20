# SQLPilot 🚀

<p align="center">
  <strong>轻量级桌面数据库客户端 | Lightweight Desktop Database Client</strong>
</p>

<p align="center">
  🌐 <a href="README.md">简体中文</a> | <a href="README.en.md">English</a>
</p>

---

## 🌟 Why SQLPilot?

### Minimalism Without Compromise

Most database tools on the market are bloated with features you'll never use, forcing you to pay the price of hundreds of megabytes in memory usage. **SQLPilot's philosophy: keep only the core features developers truly need, making every operation silky smooth.**

We believe great developer tools should be: **lightweight, fast, and distraction-free**.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🪶 **Ultra Lightweight** | Built with Wails, uses only 1/10 the memory of traditional Electron apps |
| 🔌 **Multi-Database Support** | One-stop management for MySQL, MariaDB, PostgreSQL, SQLite, ClickHouse, MongoDB, Redis |
| 🤖 **AI Smart Assistant** | Natural language to SQL, SQL optimization, intelligent field comments, chat with database |
| 🎨 **Table Designer** | Visual schema design, DDL live preview, intelligent field type hints |
| 📝 **Pro Editor** | Integrated Monaco Editor with syntax highlighting, IntelliSense, SQL formatting |
| 📊 **Data Import/Export** | CSV, Excel, SQL format support, one-click data migration |
| 🎯 **Custom Themes** | Multiple built-in color schemes, fully customizable with live preview |
| 📜 **Query History** | Auto-save all queries, quick recall and reuse |

---

## 🚀 Quick Start

### Requirements

- Go 1.21+
- Node.js 18+
- macOS / Windows / Linux

### Install Dependencies

```bash
cd frontend
npm install
```

### Development Mode

```bash
# Web preview (browser)
./start.sh web

# Desktop app
./start.sh desktop
```

### Build

```bash
cd frontend
npm run build

# Build desktop app
wails build
```

---

## 🛠️ Tech Stack

- **Backend**: Go + Wails v2
- **Frontend**: React 18 + TypeScript
- **Editor**: Monaco Editor
- **UI Components**: Custom component library
- **Build**: Vite

---

## 💡 Motivation

> "Most database tools today are packed with advanced features rarely used in daily development, yet they demand huge memory costs. I believe developers need a database tool that is **simple, efficient, and always within reach**. It doesn't need fancy design—it just needs to get the job done quickly and accurately when you need it."
> 
> —— SQLPilot Creator

SQLPilot was born out of frustration with existing tools:
- ❌ Slow startup, high memory usage
- ❌ Complex interfaces, steep learning curve
- ❌ Redundant features, 90% never used
- ❌ Sluggish response, breaks flow

We wanted to build a database tool that is: **open and use, finish and go**.

---

## 📸 Feature Preview

### Connection Management
Clean group management, multiple database engine support, one-click connection test.

### SQL Editor
Professional SQL editing experience powered by Monaco Editor:
- Syntax highlighting and error detection
- Intelligent code completion
- SQL formatting and beautification
- Auto-saved query history

### AI Assistant
- 📝 **SQL Generation**: Describe requirements in natural language, get SQL automatically
- 🔧 **SQL Optimization**: Analyze execution plans, get optimization suggestions
- 💬 **Smart Chat**: Chat with your database, gain data insights
- 🏷️ **Field Comments**: AI generates intelligent field comments, improving code readability

### Table Designer
Visually design table schemas, preview DDL in real-time, intelligent field type recommendations.

### Theme Customization
From dark to light, minimal to vibrant—create your own development environment.

---

## 🔧 AI Configuration

During development, configure AI via environment variables or in-app settings:

```bash
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_MODEL_NAME=deepseek-ai/DeepSeek-V3.2
```

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ for developers who value simplicity
</p>
