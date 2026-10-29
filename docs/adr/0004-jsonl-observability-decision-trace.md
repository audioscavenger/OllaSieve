# JSONL narrative log for decision traces

OllaSieve gains a JSON Lines event log at `data/ollasieve.log.jsonl`, written beside the SQLite ledger (which stays the source of durable facts: caps, usage events, provider state, daily summaries). The event log is the narrative surface: it records how a request was handled, decision by decision, as it happened.

Events are emitted through an injected log sink. The default sink appends one JSON object per line synchronously via `appendFileSync` and degrades to console-only output if the file write fails; logging must never fail a request.

Event types: `provider_attempt` (outcome of a single provider attempt; level info) and `request_summary` (terminal per-request event carrying request id, model, tier, status, provider, switched_from, attempts, latency). State-change and cap-threshold events are deferred to a follow-up ticket; they already have a home in the ledger.

Rotation: files roll at 10 MB, keeping the 5 most recent.

Consequences: the event log is only useful once the proxy wiring is corrected first - providers must be configured, the CapLedger must be wired in, `switchConfig` passed, `executeWithSwitching` must actually iterate attempts, and `/api/requests` must read the ledger. Until those fixes land, any events emitted would describe dead paths, so the wiring ticket ships before the logging ticket.
