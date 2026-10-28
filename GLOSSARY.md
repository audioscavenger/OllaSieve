# OllaSieve

A headless Node.js proxy that sits behind OpenCode, tracking free-tier usage caps across providers and automatically switching to the next available provider before a cap is hit. Includes an optional local classifier (OllaClass) and a web dashboard.

## Language

**OllaSieve**:
The project itself: a headless Node.js proxy for cap monitoring, automated provider switching, and optional local classification.
_Avoid_: OllaProxy, OllaGateway

**OllaSurf**:
The cap monitoring and automated switching plugin. Sits on port 11400. Tracks usage, manages provider state, and routes requests through priority tiers.
_Avoid_: OllaRouter, OllaProxy

**OllaClass**:
The classifier plugin. Sits on port 11401. Wraps tev1 into an OpenChamber-compatible `/v1/systemone` endpoint.
_Avoid_: OllaClassifier, OllaJeV

**tev1**:
A local decision model (Qwen3.5-0.8B, 772M params) from Together AI. Runs on a CPU-only Ollama instance. Supports `choice` (multi-option with probabilities) and `noul` (yes/no) question types in a single `/v1/systemone` call. Used by OllaClass for prompt classification.
_Avoid_: Nimble, JEV, System One

**Cap**:
A usage limit for a provider, defined as `{ unit, limit, window }` where unit is `requests`/`tokens`/`dollars`/`premium_requests`, limit is a number, and window is `day`/`week`/`month`. A provider can have multiple caps; exhaust when any is hit (most restrictive wins).
_Avoid_: Quota, budget, allowance

**Provider**:
An upstream AI model service that OllaSurf routes to (e.g., OpenCode, OpenRouter, Gemini, Ollama). Each has a base URL, API key (via env var), priority, and one or more caps.
_Avoid_: Backend, upstream, endpoint

**Tier**:
A group of providers in priority order. Three tiers exist: `free` (OpenCode, OpenRouter, Gemini, etc.), `paid` (OpenRouter with dollar cap), and `local` (Ollama). Providers within a tier are tried in priority order.
_Avoid_: Pool, group, level

**Exhausted**:
A provider state when any cap reaches its threshold. The provider is skipped for new requests until its cap resets (cooldown_until = reset_at).
_Avoid_: Depleted, used up, spent

**Virtual model**:
A model name exposed by OllaSurf that resolves to an actual provider/model at request time. Examples: `ollasurf/auto`, `ollasurf/trivial`, `ollasurf/research`, `ollasurf/implement`, `ollasurf/hard`.
_Avoid_: Fake model, alias, virtual endpoint

**Sequential exhaustion**:
The routing strategy of using one provider until exhausted before switching to the next. Not load-balancing. Minimizes warm-up costs and maximizes use of each provider's free tier.
_Avoid_: Round-robin, load balancing, failover-first

**Provider client adapter**:
The swappable interface through which OllaSurf calls upstream providers. Injected at app startup. Mock implementations enable testing without real providers.
_Avoid_: HTTP client, fetcher, connector

**Ledger**:
The SQLite database (WAL mode) that tracks caps, usage events, provider state, and daily summaries. The single source of truth for cap consumption.
_Avoid_: Database, store, cache

**Plugin**:
A self-contained module exporting `{ name, version, init(app, config, ledger) }`. Registered in config's `plugins` array. OllaSurf and OllaClass are the first two plugins.
_Avoid_: Module, extension, addon

**Warm-up**:
The process of loading an Ollama model into VRAM/RAM on first request. OllaSurf does not pre-warm; the first request to a local model triggers loading, and the dashboard shows "warming up" status.
_Avoid_: Cold start, initialization, loading

**Decision trace**:
The ordered narrative of how a single request was handled: tier resolution, provider attempts, switches/fallbacks, and final outcome. Lives in the JSONL event log; the SQLite ledger holds the durable facts underneath it.
_Avoid_: Audit trail, history, log narrative

**Event**:
A single observability record emitted into the log sink (for example `provider_attempt` or `request_summary`).
_Avoid_: Log entry, record, fact

**Log sink**:
The destination and format of observability output: console lines for humans, JSON Lines file for machine-readable/persistent events.
_Avoid_: Logger, handler, transport

**Request ID**:
The correlation identifier minted at the OllaSurf edge and propagated (via header) to OllaClass, used to tie provider-attempt and request-summary events to one logical request across servers.
_Avoid_: Trace ID (reserved for future tracing integrations), correlation key