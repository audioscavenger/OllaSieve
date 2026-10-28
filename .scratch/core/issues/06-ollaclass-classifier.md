# 06: OllaClass classifier

**What to build:** Stateless classifier service on :11401. Expose `/v1/systemone` endpoint. Accept raw prompt + optional context (action, conversation excerpt). Wrap into Jev-style JSON payload with `state` (prompt + action) and `questions` (intent_category choice with 4 criteria + is_clear noul). POST to tev1 on port 11433. Parse response: extract `choice`, `probabilities`, `confidence`, `noul`, `usage`. Return normalized `{ category, confidence, is_clear, probabilities, usage }`. Map `hard_reasoning` → `hard` for OpenChamber compatibility. Confidence gating: if confidence < 0.6 or is_clear < 0.5, return fallback category (configurable, default `implement`) with `low_confidence: true`. Warm-up request on startup to handle tev1 session quirk.

**Blocked by:** 01 (Project scaffolding & plugin registry)

**Status:** in-progress

- [ ] `POST /v1/systemone` accepts `{ prompt, action? }` and returns normalized classification
- [ ] Jev-style wrapping: builds correct payload with state + questions (4 criteria + is_clear)
- [ ] tev1 call: POST to `http://127.0.0.1:11433/v1/systemone` with wrapped payload
- [ ] Response parsing: extract choice, probabilities, confidence, noul, usage
- [ ] Category mapping: hard_reasoning → hard
- [ ] Confidence gating: threshold 0.6, is_clear threshold 0.5, fallback category on low confidence
- [ ] Warm-up: send test request on startup; retry once on first-request failure
- [ ] Mock tev1 tests: canned responses, prompt wrapping verification, confidence threshold, fallback
- [ ] Real tev1 integration test: classify a sample prompt, verify category + confidence