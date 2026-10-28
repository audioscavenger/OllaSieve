# OllaSieve v1 — Core Implementation

Status: ready-for-agent

## Problem Statement

OpenCode and OpenChamber expose many free-tier providers (OpenCode, OpenRouter, Gemini, Copilot, Vercel, Anthropic, etc.), each with daily/weekly/monthly usage caps. Sub-agents spawned from any project consume these caps unpredictably. When a cap is hit mid-run, the agent gets a hard `429` and the user must recover manually. There is no global, project-agnostic mechanism to monitor cap consumption across providers, automatically switch to the next available provider before the cap is hit, or fall back to local GPU-backed Ollama models. OpenChamber's built-in Auto mode classifies messages into 4 categories and picks models, but it operates at the message level and has no visibility into cap usage across providers. The user wants a single proxy that sits behind OpenCode, tracks caps predictively, switches automatically, and optionally classifies prompts locally via a small decision model (tev1).

## Solution

Build OllaSieve as a headless Node.js proxy with two optional servers (OllaSurf on :11400, OllaClass on :11401), a shared SQLite cap ledger, an embedded web dashboard, and a plugin registry. OllaSurf becomes the sole provider in OpenChamber — OpenCode talks only to OllaSurf, which routes to the real providers based on cap headroom and priority tiers. OllaClass wraps a local tev1 decision model into an OpenChamber-compatible `/v1/systemone` classifier endpoint. Both servers are optional and independently activatable via config.

## User Stories

1. As a user, I want all sub-agents across all projects to use free-tier providers through a single proxy, so that cap consumption is tracked globally.
2. As a user, I want OllaSurf to track usage per provider in real time by parsing response payloads, so that I always know how much free capacity remains.
3. As a user, I want OllaSurf to switch to the next provider before a cap is hit (at ~97% usage), so that I never get a mid-run 429.
4. As a user, I want OllaSurf to recover automatically from a 429 by retrying on the next provider, so that I don't have to intervene manually.
5. As a user, I want providers organized into priority tiers (free → paid OpenRouter → local Ollama), so that free capacity is exhausted before spending money or GPU time.
6. As a user, I want model matching on switch (prefer same model family, then capability match), so that a DeepSeek request falls to a DeepSeek model on another provider, not a random one.
7. As a user, I want to set a dollar cap on the paid tier from the dashboard, so that I don't accidentally exhaust my OpenRouter account.
8. As a user, I want to boost the paid cap from the dashboard (editable input + quick +$5 button), so that I can finish work without editing config files.
9. As a user, I want a web dashboard showing per-provider progress bars, health status, request log, and plugin status, so that I can monitor everything at a glance.
10. As a user, I want the dashboard to show a countdown to each provider's cap reset, so that I know when capacity will return.
11. As a user, I want to run OllaClass as a local classifier (tev1-backed) instead of paying for Jev/OpenRouter classification, so that I save on classification costs.
12. As a user, I want OllaClass to expose a `/v1/systemone` endpoint compatible with OpenChamber's custom classifier setting, so that I can swap it in without changing OpenChamber's code.
13. As a user, I want OllaSurf to expose virtual models (`ollasurf/auto`, `ollasurf/trivial`, `ollasurf/research`, `ollasurf/implement`, `ollasurf/hard`), so that OpenChamber's Auto mode keeps working with OllaSurf as the sole provider.
14. As a user, I want `ollasurf/auto` to classify prompts internally via OllaClass and route to the right tier, so that I get a fully self-contained path without OpenChamber's Auto.
15. As a user, I want OllaSurf to fall back to local Ollama (qwen models) only when all API providers are exhausted, so that GPU time is used as a last resort.
16. As a user, I want Ollama model selection based on request complexity (trivial → small model, hard → large model), so that simple tasks don't waste VRAM on a 30B model.
17. As a user, I want usage history retained forever by default with a dashboard purge option (7/30/90/365 days), so that I can analyze trends over time.
18. As a user, I want both OllaSurf and OllaClass to be independently activatable via config, so that I can run just the classifier or just the proxy if I want.
19. As a user, I want the system to work on localhost without auth tokens for v1, so that setup is frictionless.
20. As a user, I want to hear/see when Ollama is warming up (first request triggers model load), so that I'm not confused by slow first responses.

## Implementation Decisions

### Architecture

- Single Node.js process hosting two optional Express HTTP servers (OllaSurf :11400, OllaClass :11401). Both servers share a single SQLite database (WAL mode) and a plugin registry.
- Plugin registry: each plugin exports `{ name, version, init(app, config, ledger) }`. Plugins register routes and dashboard widgets. Loaded from config's `plugins` array. OllaSurf and OllaClass are the first two plugins.
- Config: `ollasieve.config.json` (JSON, schema-validated) + env var overrides for secrets. Secrets are referenced by env var name in config, never stored in the file.

### OllaSurf (Cap Monitoring + Automated Switching)

- Transparent OpenAI-compatible proxy. No protocol conversion (OpenChamber/OpenCode handle that). Forwards request body as-is, parses response usage, tracks caps.
- Sits behind OpenCode as the sole provider in OpenChamber. OpenCode configures one provider (`ollasurf`) pointing at `http://127.0.0.1:11400/v1` with virtual model names.
- Virtual models: `ollasurf/auto`, `ollasurf/trivial`, `ollasurf/research`, `ollasurf/implement`, `ollasurf/hard`. Each resolves to a tier + best available provider/model.
- `ollasurf/auto`: calls OllaClass internally for classification, then resolves to tier. `ollasurf/<category>`: resolves directly to the free tier (or configured tier).
- Provider tiers: `free` (OpenCode, OpenRouter, Gemini, etc.), `paid` (OpenRouter with dollar cap), `local` (Ollama). Each tier is a list of providers in priority order.
- Cap definition per provider: `{ unit, limit, window }` where unit is `requests`/`tokens`/`dollars`/`premium_requests`, limit is a number, window is `day`/`week`/`month`. A provider can have multiple caps (exhaust when ANY is hit — most restrictive wins).
- Cap tracking: parse `usage` from every response (real-time). Background poll provider APIs every 5 minutes (catches usage from other clients). On-demand refresh from dashboard.
- Automated switching: when any cap reaches 97% (configurable per provider), mark provider as `exhausted` (cooldown until reset_at). Retry current request on next provider in priority order (one attempt, 3s cooldown). If that fails, return error to client.
- Reactive recovery: on 429 from upstream, mark provider exhausted, retry current request on next provider (one attempt). Mirrors ollama-warden's retry pattern.
- Model matching on switch: prefer same model family → capability match (context window, vision, tools) → any available. Configurable per provider.
- Session affinity: natural — stay on current provider until exhausted. No per-request routing. Avoids warm-up costs.
- Ollama warm-up: first request triggers model load. Dashboard shows "warming up" status. No pre-warming.

### Cap Ledger (SQLite, WAL mode)

Tables:
- `providers`: id, tier, type, base_url, api_key_env, priority, created_at
- `caps`: provider_id, unit, limit_val, window, current_usage, reset_at, updated_at
- `usage_events`: id, provider_id, model, tokens_in, tokens_out, cost_usd, status, latency_ms, switched_from, ts
- `provider_state`: provider_id, status (healthy/exhausted/cooldown), cooldown_until, consecutive_failures, last_error
- `daily_summary`: provider_id, date, requests, tokens_in, tokens_out, cost_usd

### OllaClass (Classifier)

- Pure stateless classifier service. No caching, no history tracking.
- Exposes `/v1/systemone` (tev1-compatible). Accepts a raw prompt + optional context; wraps it Jev-style internally; calls tev1; returns `{ category, confidence, is_clear, probabilities, usage }`.
- Dual-use: OpenChamber (via `classifier-endpoint.json`) and OllaSurf (internal calls for `ollasurf/auto`).
- Categories: `trivial`, `research`, `implement`, `hard_reasoning` (matching OpenChamber's 4 categories). OllaClass maps `hard_reasoning` → `hard` in its response for OpenChamber compatibility.
- Confidence threshold: 0.6 (configurable). Below threshold (or if `is_clear` noul < 0.5), fall back to a default category (configurable, default `implement`).
- tev1 endpoint: `http://127.0.0.1:11433/v1/systemone`, model `tev1:0.8b`. tev1 runs on a CPU-only Ollama instance (1.8s per request, ~1.3GB RAM). CPU-only is enforced via `OLLAMA_LLM_LIBRARY=cpu` and `CUDA_VISIBLE_DEVICES=-1` on a separate Ollama instance.

#### tev1 Request Format (Jev-style wrapping)

OllaClass builds this payload from a raw prompt + optional context:

```json
{
  "model": "tev1:0.8b",
  "keep_alive": -1,
  "state": {
    "prompt": "<raw user prompt>",
    "action": "<optional action description>"
  },
  "questions": {
    "intent_category": {
      "type": "choice",
      "instructions": "Which category best describes this prompt?",
      "criteria": {
        "trivial": "Mechanical, factual, or formatting work only: rename symbols, fix typos, reformat, add comments, answer known-file questions, run one obvious command. NOT design, multi-file reasoning, or judgement calls.",
        "research": "Explain existing code/behavior without changes: explain module function, find implementation locations, summarize changes. NOT requests that ask for edits or plans.",
        "implement": "Ordinary engineering with clear shape: implement specified function/component, write/fix tests, localized bug fix with understood cause. NOT open-ended architecture, concurrency subtleties, unknown debugging.",
        "hard_reasoning": "Debugging unknown causes, planning across modules, security/auth, concurrency, data migration, money logic. NOT work a mid-level engineer would finish without deep thinking."
      }
    },
    "is_clear": {
      "type": "noul",
      "instructions": "Is this prompt type and category choice unambiguous enough to route confidently?"
    }
  }
}
```

#### tev1 Response Format

```json
{
  "model": "tev1:0.8b",
  "answers": {
    "intent_category": {
      "type": "choice",
      "choice": "trivial",
      "probabilities": { "trivial": 0.98, "research": 0.001, "implement": 0.017, "hard_reasoning": 0.00006 },
      "confidence": 0.975
    },
    "is_clear": {
      "type": "noul",
      "noul": 0.58
    }
  },
  "usage": { "input_tokens": 434, "output_tokens": 0 }
}
```

#### OllaClass Response (normalized)

OllaClass returns to callers (OpenChamber, OllaSurf):

```json
{
  "category": "trivial",
  "confidence": 0.975,
  "is_clear": 0.58,
  "probabilities": { "trivial": 0.98, "research": 0.001, "implement": 0.017, "hard_reasoning": 0.00006 },
  "usage": { "input_tokens": 434, "output_tokens": 0 }
}
```

If confidence < threshold or is_clear < 0.5, OllaClass returns the fallback category with a flag `low_confidence: true`.

#### tev1 Session Quirk

tev1 must be "saved" in the Ollama session before it responds via the `/v1/systemone` endpoint. OllaClass should send a warm-up request on startup (or handle the first-request failure gracefully with a retry). This is an Ollama quirk, not an OllaClass bug.

### Dashboard (v1)

- Embedded web UI served at `/dashboard` on OllaSurf's port.
- Per-provider progress bars (% usage, countdown to reset).
- Provider health: healthy / exhausted / cooldown (with countdown).
- Recent request log: last 50 requests (provider, model, tokens, status, latency, switches).
- Active plugin status (OllaClass, OllaSurf).
- Paid tier cap editor: editable input + quick "+$5" boost button. Changes take effect immediately.
- Purge option: 7/30/90/365 days.

### Ollama Model Selection (by complexity)

Configurable per category in the local tier:
- `trivial` → `qwen2.5-coder:0.5b` or `qwen3.5:9b` (fast, small)
- `research` → `qwen2.5-coder:14b` (balanced)
- `implement` → `qwen2.5-coder:14b` or `qwen3-coder:30b` (capable)
- `hard_reasoning` → `qwen3-coder:30b` or `qwen3.8:27b` (most capable)

### Provider Client Adapter

- OllaSurf calls providers through a swappable adapter interface (not hard-coded fetch/axios). The adapter is injected at app startup.
- This is the primary seam for testing: tests replace the adapter with a mock that returns canned responses with usage data, simulating cap exhaustion, 429s, etc.

### Testing Strategy

- **HTTP API seam (primary)**: Tests exercise OllaSieve through its real HTTP server. Send `POST /v1/chat/completions` with virtual model names; assert response body, status, usage tracking. Providers mocked at the adapter level.
- **Cap ledger seam (secondary)**: Direct tests of SQLite operations — usage recording, cap checking, provider state transitions, reset logic, mixed cap units.
- **Real Ollama integration tests**: End-to-end smoke tests against local Ollama on port 11434 using available models (e.g., `qwen2.5-coder:0.5b` or `qwen3.5:9b`). These verify the full flow with a real provider but are slower and require Ollama running.
- **OllaClass tests**: Mock tev1 (HTTP mock returning canned classification responses). Test prompt wrapping, category mapping, confidence threshold, fallback behavior. Additionally, integration tests against real tev1 on port 11433 (CPU-only Ollama) to verify the full request/response cycle with actual tev1 output.
- **Not tested**: Individual provider API formats, tev1's internal accuracy (external dependency), dashboard rendering (manual/visual), config parsing (JSON schema validation).

## Out of Scope

- Windows tray widget (deferred to v2 — needs dashboard data model first).
- Token/auth for localhost (v1 is localhost-only, no auth).
- Protocol conversion (OpenChamber/OpenCode handle this; OllaSieve is transparent).
- Per-project cap configuration (caps are global, not per-project).
- Multi-machine / distributed cap tracking (single-machine only for v1).

- Cost optimization / cheapest-provider routing (v1 uses priority order, not cost-based selection).
- Streaming response handling (v1 buffers full response to parse usage; streaming pass-through deferred).

## Further Notes

- The user's existing ollama-warden project (E:/Gitea/ollama-warden) is a donor for stream-forwarding patterns, SSE usage extraction, JSONL trace, and retry logic. However, ollama-warden has no cap/quota tracking — that is built fresh in OllaSieve.
- MuxLayer (external desktop app) is a reference for routing concepts (route profiles, failover, session affinity, capability matrix) but is NOT being redeveloped. OllaSieve is headless, plugin-based, and cap-monitoring-focused.
- tev1 runs on a CPU-only Ollama instance (port 11433) to avoid VRAM contention with GPU models on port 11434. ~1.8s per request, ~1.3GB RAM. CPU-only enforced via `OLLAMA_LLM_LIBRARY=cpu` and `CUDA_VISIBLE_DEVICES=-1`.
- tev1 supports both `choice` (multi-option with probabilities) and `noul` (yes/no) question types in a single `/v1/systemone` call. Confirmed by direct testing — Gemini v2 incorrectly claimed tev1 was binary-only.
- tev1 must be "saved" in the Ollama session before the `/v1/systemone` endpoint responds. OllaClass should handle this with a warm-up request on startup.
- nimble (Apache 2.0, 9GB) is an alternative classifier model but tev1 is the chosen model due to smaller size and acceptable speed.
- The user has paid $10 to OpenRouter to raise the daily free cap. The paid tier's dollar cap is user-configurable from the dashboard.
- OpenCode's managed instance (spawned by OpenChamber on port 49846) will be configured to use OllaSurf as its sole provider.
