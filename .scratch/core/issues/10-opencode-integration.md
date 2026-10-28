# 10: OpenCode integration

**What to build:** Configure OpenCode to use OllaSurf as its sole provider. Update OpenCode config (opencode.jsonc) to define `ollasurf` provider pointing at `http://127.0.0.1:11400/v1` with virtual models. Update OpenChamber's provider list to include only OllaSurf. Update startup cmd/env to launch OllaSieve before OpenCode. Configure OpenChamber's classifier-endpoint.json to point at OllaClass (optional). Verify end-to-end: OpenChamber → OpenCode → OllaSurf → provider.

**Blocked by:** 07 (OllaSurf ↔ OllaClass integration)

**Status:** ready-for-agent

- [ ] OpenCode config: `ollasurf` provider with baseURL `http://127.0.0.1:11400/v1`, models: auto, trivial, research, implement, hard
- [ ] OpenChamber provider list: only OllaSurf (remove direct provider entries or leave as fallback)
- [ ] Startup cmd updated: launch OllaSieve (both servers) before OpenCode
- [ ] OpenChamber classifier-endpoint.json optionally pointed at OllaClass (`http://127.0.0.1:11401/v1/systemone`)
- [ ] End-to-end verified: OpenChamber Auto mode → picks `ollasurf/*` → OpenCode → OllaSurf → real provider → response
- [ ] `ollasurf/auto` path verified: OpenChamber sends `ollasurf/auto` → OllaSurf classifies via OllaClass → routes to tier → response