# Changelog

## Bugs
- `npm install` fails on Node 24: better-sqlite3 ^11.0.0 has no Node 24 prebuilt binary (v11 predates it), and the node-gyp fallback needs Python (absent here). Bumped to ^12.11.1, which ships a Node 24 win32-x64 prebuild; no code changes, suite green, `npm audit` clean. Recorded as ADR 0003.
- npm 11 gates third-party install-script execution behind an approval list, so better-sqlite3's build could be silently skipped. The approval is now committed in `package.json` (`allowScripts`), and README documents `npm install-scripts approve better-sqlite3` as the recovery step if it is ever lost.

## Ideas

## Unreleased

* Moved the issue tracker from local markdown under `.scratch/` to Gitea issues managed with the `tea` CLI: `AGENTS.md` and `docs/agents/` now point at the Gitea tracker, with close reasons (`Reason: completed` / `Reason: not planned` / `Reason: wontfix`) recorded via `tea comments` before `tea issues close`.
* Added the repo house style to `AGENTS.md`: no em dashes in prose; machine-wide file, encoding, and line-ending rules live in the global `~/.config/opencode/AGENTS.md`.
* Config loading + env overrides + SQLite WAL + plugin registry
* Two Express servers (OllaSurf :11400, OllaClass :11401) + health endpoints
* Provider adapter interface with usage parsing (OpenAI + Ollama)
* Cap ledger: 5-table schema, CRUD, predictive/reactive switching
* Proxy endpoints: /v1/chat/completions, /v1/models, /v1/systemone
* Automated provider switching (97% predictive, 429 reactive, tier fallback)
* OllaClass classifier with Jev-style tev1 wrapping
* OllaSurf-OllaClass integration for ollasurf/auto routing
* Real Ollama integration tests (skip gracefully if :11434 unreachable)
* OpenCode integration config: opencode.jsonc, openchamber-providers.json, classifier-endpoint.json
* README Observability section: how to capture console logs (`tee`), curl checks for `/health`, `/api/requests`, `/api/providers`, `/api/plugins`, and notes on what is not yet exposed (no `provider_state` API; `/dashboard` is a stub)
* New per-request logging via `src/request-log.js` middleware on both OllaSurf and OllaClass apps: one line per request (`METHOD url -> STATUS (Xms)`), success via console.log, client errors via console.warn, server errors via console.error. Previously successful requests were silent. README updated to reflect that requests now produce console output.
* Added `npm run start -- --debug` (CLI args via new `src/cli.js`: `--debug` / `--help`) to activate deep debug logging: OllaSurf traces incoming chat completion prompts, and OllaClass traces classification requests, Jev-wrapped tev1 payloads, tev1 replies, and normalized replies sent back to OllaSurf.
* Completed the per-request logging core (ticket #01): tagged logger factory (service name -> log/warn/error) in `src/logger.js`, one-line-per-request middleware in `src/request-log.js` mounted before all routes on OllaSurf and OllaClass, severity mapping 2xx/3xx -> log, 4xx -> warn, 5xx -> error; every route (health, proxy, models, dashboard, api) covered.
* Fixed the dead OllaSurf proxy wiring (ticket #02): populated `surf.tiers` in `ollasieve.config.json`, passed the CapLedger facade into the apps and plugin registry, built `switchConfig` from `config.surf`, made `executeWithSwitching` iterate provider attempts with failover and last-error reporting, and pointed `/api/requests` at the ledger's `getRequestLog`. Proxied requests now return real upstream responses and usage events are recorded; suite green (45/45) and lint clean.
* Locked the module system for the current phase as CommonJS (ADR 0005): kept `require`/`module.exports`, deferred ESM migration, and noted Fastify or Hono as the fallback framework swap if the Express 4 async error-handling gap ever becomes operational.

## Released
