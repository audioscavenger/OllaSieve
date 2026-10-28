# 01: Project scaffolding & plugin registry

**What to build:** Set up the Node project structure: config loading (JSON + env), SQLite setup (better-sqlite3, WAL mode), plugin registry skeleton, two Express servers (OllaSurf on :11400, OllaClass on :11401), health endpoints on both. App boots, config parses and validates, SQLite DB created with schema. Plugin registry loads plugins from config's `plugins` array; each plugin exports `{ name, version, init(app, config, ledger) }`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Config file (`ollasieve.config.json`) loads and validates against schema
- [ ] Env var overrides applied (secrets referenced by name, never stored in config)
- [ ] SQLite DB created with WAL mode enabled
- [ ] Plugin registry loads plugins from config array
- [ ] OllaSurf server starts on :11400, health endpoint returns 200
- [ ] OllaClass server starts on :11401, health endpoint returns 200
- [ ] Both servers optional and independently activatable via config flags