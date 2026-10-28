# Changelog

## Unreleased

- #01 Project scaffolding & plugin registry (done)
- #02 Provider client adapter (done)
- #03 Cap ledger (done)
- #04 OllaSurf core proxy (done)
- #05 OllaSurf automated switching (done)
- #06 OllaClass classifier (done)
- #07 OllaSurf-OllaClass integration (done)

Features:
- Config loading + env overrides + SQLite WAL + plugin registry
- Two Express servers (OllaSurf :11400, OllaClass :11401) + health endpoints
- Provider adapter interface (Mock + Real) with usage parsing (OpenAI + Ollama)
- Cap ledger: 5-table schema, CRUD, predictive/reactive switching, state transitions
- Proxy endpoints: `/v1/chat/completions`, `/v1/models`, `/v1/systemone`
- Automated provider switching (97% predictive, 429 reactive, tier fallback)
- Jev-style prompt wrapping for tev1 classifier

## 0.1.0 (2026-10-28)

Initial release: project scaffolding (#01).
