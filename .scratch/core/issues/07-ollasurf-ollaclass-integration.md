# 07: OllaSurf ↔ OllaClass integration

**What to build:** OllaSurf calls OllaClass internally when a request uses `ollasurf/auto`. OllaSurf sends the prompt to OllaClass (`POST :11401/v1/systemone`), receives `{ category, confidence, is_clear, ... }`, maps category to tier/model, and routes through the normal proxy flow. Trigger OllaClass warm-up on OllaSurf startup. If OllaClass is unavailable, fall back to a default category (configurable).

**Blocked by:** 04 (OllaSurf core proxy), 06 (OllaClass classifier)

**Status:** done

- [x] `ollasurf/auto` request → OllaSurf calls OllaClass → gets category → routes to correct tier
- [x] Category-to-tier mapping: trivial/research → free tier, implement → free tier (or configured), hard → free or paid tier based on config
- [x] OllaClass warm-up triggered on OllaSurf startup (fire-and-forget, retry on failure)
- [x] If OllaClass unavailable: fall back to default category (configurable, default `implement`)
- [x] OllaClass low_confidence flag propagated to dashboard/request log
- [x] End-to-end test: `ollasurf/auto` request with mocked OllaClass → correct tier selected → response returned