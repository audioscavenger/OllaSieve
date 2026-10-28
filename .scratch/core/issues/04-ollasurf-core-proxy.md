# 04: OllaSurf core proxy

**What to build:** Transparent OpenAI-compatible proxy on :11400. Receive `POST /v1/chat/completions` with a virtual model name (e.g., `ollasurf/trivial`), resolve to tier + best available provider, forward via adapter, parse usage from response, track in ledger, return response. Virtual models registered: `auto`, `trivial`, `research`, `implement`, `hard`. Initially resolve to first available provider in tier (no switching). `auto` resolves to a default tier (implement) until OllaClass integration (#07) is done.

**Blocked by:** 02 (Provider client adapter), 03 (Cap ledger)

**Status:** in-progress

- [ ] `POST /v1/chat/completions` accepts virtual model names and returns provider response
- [ ] Model resolution: virtual model → tier → first available (non-exhausted) provider in priority order
- [ ] Request forwarded via adapter with correct URL, headers, body
- [ ] Usage parsed from response and recorded in ledger
- [ ] Provider state checked before routing (skip exhausted providers)
- [ ] Response returned to client with original status code and body
- [ ] `GET /v1/models` lists virtual models
- [ ] Integration test: send request with `ollasurf/trivial`, verify response + ledger entry