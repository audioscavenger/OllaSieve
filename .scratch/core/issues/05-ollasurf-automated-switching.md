# 05: OllaSurf automated switching

**What to build:** Add intelligence to OllaSurf: predictive switch when any cap reaches 97% (configurable per provider), reactive 429 recovery (retry current request on next provider with 3s cooldown), model matching on switch (prefer same model family → capability match → any available), tier fallback (free → paid → local Ollama). Mark provider as exhausted with cooldown_until = reset_at. Log every switch in usage_events (switched_from field).

**Blocked by:** 04 (OllaSurf core proxy)

**Status:** in-progress

- [ ] Predictive: when cap usage >= 97%, mark provider exhausted, route next request to next provider
- [ ] Reactive: on 429 from upstream, mark provider exhausted, retry current request on next provider (one attempt, 3s cooldown)
- [ ] Model matching: on switch, prefer same model family; fallback to capability match (context window, vision, tools); then any available
- [ ] Tier fallback: free tier exhausted → try paid tier → try local tier (Ollama)
- [ ] Ollama warm-up: first request to local tier triggers model load; dashboard shows "warming up"
- [ ] Switch logged in usage_events with switched_from field
- [ ] Per-provider configurable threshold (default 0.97)
- [ ] Test: provider A at 97% → request routes to provider B
- [ ] Test: 429 from provider A → request retried on provider B