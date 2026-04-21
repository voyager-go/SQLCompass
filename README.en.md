# SQLCompass

Lightweight desktop database client supporting MySQL, PostgreSQL, SQLite, ClickHouse, MongoDB, Redis and more.

---

## Features

- **Multi-Database**: Unified management for various database connections
- **SQL Editor**: Monaco Editor with syntax highlighting, completion, formatting
- **AI Assistant**: Natural language to SQL, SQL optimization, field comments
- **Table Designer**: Visual DDL design with live preview
- **Data Import/Export**: CSV, Excel, SQL formats
- **Themes**: Light/dark mode switch
- **Query History**: Auto-save with quick recall

---

## Requirements

- Go 1.21+
- Node.js 18+
- macOS / Windows / Linux

## Development

```bash
# Install dependencies
cd frontend
npm install

# Web preview (browser)
./start.sh web

# Desktop app
./start.sh desktop
```

## Build

```bash
# Build frontend
cd frontend
npm run build

# Build desktop app
wails build
```

## AI Configuration

Configure via environment variables or in-app settings:

```bash
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_MODEL_NAME=deepseek-ai/DeepSeek-V3.2
```

## Tech Stack

- **Backend**: Go + Wails v2
- **Frontend**: React 18 + TypeScript
- **Editor**: Monaco Editor
- **Build**: Vite

## License

[MIT](LICENSE)
