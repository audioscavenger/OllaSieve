# 10: OpenCode integration

**Status:** done

- [x] `opencode.jsonc`: `ollasurf` provider at `http://127.0.0.1:11400/v1`, models auto/trivial/research/implement/hard
- [x] `openchamber-providers.json`: only OllaSurf (sole provider), default ollasurf
- [x] `docs/opencode-integration.md`: startup order (OllaSieve first via `npm start`, then OpenCode)
- [x] `classifier-endpoint.json`: points at OllaClass `http://127.0.0.1:11401/v1/systemone` (optional)
- [x] `tools/validate-opencode-config.js`: config validation script
- [x] End-to-end: OpenChamber Auto → `ollasurf/auto` → OllaSurf classifies via OllaClass → routes tier → provider → response (validated by config + unit tests; live run requires OpenCode + Ollama)
