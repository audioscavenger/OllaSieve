# 03: Cap ledger

**What to build:** SQLite tables for cap tracking: `providers` (id, tier, type, base_url, api_key_env, priority, created_at), `caps` (provider_id, unit, limit_val, window, current_usage, reset_at, updated_at), `usage_events` (id, provider_id, model, tokens_in, tokens_out, cost_usd, status, latency_ms, switched_from, ts), `provider_state` (provider_id, status, cooldown_until, consecutive_failures, last_error), `daily_summary` (provider_id, date, requests, tokens_in, tokens_out, cost_usd). CRUD operations: record usage event, check if any cap exceeded (mixed units, most-restrictive-wins), manage provider state transitions (healthy → exhausted → cooldown), handle cap resets by window (day/week/month).

**Blocked by:** 01 (Project scaffolding & plugin registry)

**Status:** done

- [x] All 5 tables created with correct schema
- [x] Record usage event: insert into usage_events, update caps.current_usage, update daily_summary
- [x] Check caps: return whether any cap for a provider is exceeded (>= threshold), handling mixed units
- [x] Provider state transitions: healthy → exhausted (with cooldown_until), exhausted → healthy (on reset), cooldown countdown
- [x] Cap reset: when window expires, reset current_usage to 0 and update reset_at
- [x] Most-restrictive-wins: if a provider has multiple caps, exhaust when ANY is hit
- [x] Direct unit tests for all CRUD operations and state transitions