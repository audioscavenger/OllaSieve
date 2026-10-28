# 02: Provider client adapter

**What to build:** Define a swappable adapter interface for calling upstream providers. The adapter takes a request (URL, headers, body) and returns a parsed response with usage data. Provide a mock implementation for tests (returns canned responses with configurable usage, status codes, delays) and a real implementation (fetch-based). The adapter is injected at app startup so tests can replace it before the HTTP server starts. This is the primary testing seam for the entire project.

**Blocked by:** 01 (Project scaffolding & plugin registry)

**Status:** done

- [x] Adapter interface defined: `call(request) → { status, body, usage, latencyMs }`
- [x] Mock adapter supports configurable responses, usage data, status codes, and delays
- [x] Real adapter (fetch-based) calls a provider and returns parsed response + usage
- [x] Adapter injected at app startup, replaceable for testing
- [x] Usage parsing handles both OpenAI-compat (`usage.prompt_tokens`/`completion_tokens`) and Ollama native (`prompt_eval_count`/`eval_count`) shapes