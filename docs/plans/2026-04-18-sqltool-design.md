# SQLTool Studio Design

## Product Goal

Build a desktop database client that keeps the daily path fast:

- connection management
- database and table browsing
- schema editing
- DDL preview before execution
- SQL formatting and history
- AI-assisted SQL and schema planning
- import and export for structure and data

The product intentionally avoids building a full low-frequency admin suite. Foreign keys, views, triggers, and stored procedures are not part of the main v1 flow.

## Platform Shape

- Desktop shell: Wails
- Backend: Go
- Frontend: React + TypeScript
- Editor strategy: Monaco in the query studio phase
- Storage: local desktop config plus secure secret storage for AI credentials

This keeps the backend strong for driver and execution logic while letting the interface stay modern and polished.

## Supported Engines

### Relational engines

These should share the richest workflow:

- MySQL
- MariaDB
- PostgreSQL
- SQLite
- ClickHouse

Core behavior:

- schema browser
- visual field editor
- DDL preview
- SQL history
- prompt-to-SQL with schema grounding
- import/export for SQL, CSV, Excel, and JSON where practical

### Non-relational engines

- MongoDB
- Redis

These should be supported with adapted UIs instead of being forced into a table-designer metaphor.

MongoDB:

- database and collection explorer
- query and aggregation workbench
- JSON, CSV, and Excel import/export
- AI prompt-to-query and structure-aware suggestions

Redis:

- key browser
- command workbench
- safe destructive command handling
- export support for key snapshots and result data

## AI Capability Design

The AI system has three user-facing jobs:

1. Beautify and correct SQL.
2. Generate SQL from prompts.
3. Translate natural-language structural requests into reviewed change plans.

Safety rules:

- AI never executes directly.
- AI outputs always enter a preview step.
- high-risk changes require a destructive confirmation dialog
- live metadata should be fetched before generating schema-aware SQL

Recommended initial provider shape:

- provider URL and model are configurable in-app
- API key is stored locally and securely
- environment variables remain available for development

## Import and Export

Needed capabilities:

- schema-only export
- data-only export
- schema-plus-data export
- CSV import
- Excel import
- CSV export
- Excel export
- direct export from query result grids

The transfer workflow should always show a summary before a write operation.

## UI Modules

- Connections
- Explorer
- Schema Lab
- Query Studio
- AI Copilot
- Transfer Center
- Settings

The shell should keep the main layout stable:

- left navigation rail
- primary content canvas
- contextual drawer or panel for AI and previews

## Delivery Phases

### Phase 1

Ship the MySQL-first experience with reusable abstractions:

- Wails shell
- polished React workspace
- connection management
- schema browser
- field editor
- DDL preview
- SQL formatting
- history
- AI settings
- prompt-to-SQL
- CSV, Excel, and SQL transfer jobs

### Phase 2

Extend the relational driver layer:

- MariaDB
- PostgreSQL
- SQLite
- ClickHouse

### Phase 3

Add adapted query-first workflows:

- MongoDB
- Redis

## Technical Guidance

- Define a driver capability matrix early.
- Keep statement generation server-side.
- Keep secrets out of source control.
- Make every destructive flow preview-first.
- Prefer reusable UI primitives because the app will grow quickly once query studio and transfer center land.
