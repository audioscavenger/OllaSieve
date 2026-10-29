# OllaSieve

Agent proxy that sits between OpenChamber and OpenCode. Manages free-model providers via an optional dashboard and can run an optional classifier proxy. Both features are optional.

## Project
- Proxy layer between agent platforms  
- Optional provider dashboard
- Optional classifier proxy

## Getting Started

### Prerequisites
- Node.js >= 20
- Ollama (optional, for real provider tests)

### Installation
```bash
git clone <repo-url>
cd ollasieve
npm install
```

`better-sqlite3` builds a small native module during install (`prebuild-install`). npm 11 gates every third-party install script behind an approval list, so the approval is committed in this repo (the `allowScripts` field in `package.json`) and a plain `npm install` already builds the module.

If npm reports that `better-sqlite3`'s install script was skipped (approval missing, or the version changed so it no longer matches), re-approve and let it build:
```bash
npm install-scripts approve better-sqlite3
npm install
```

> This runs **after** `npm install`, not before - it operates on the installed package and writes the approval into `package.json`.

### Configuration
Create `ollasieve.config.json` in project root:
```json
{
  "server": {
    "host": "127.0.0.1",
    "surfPort": 11400,
    "classPort": 11401
  },
  "storage": {
    "dbPath": "./data/ollasieve.db"
  },
  "surf": {
    "enabled": true,
    "tiers": [
      {
        "type": "free",
        "priority": 1,
        "providers": [
          {
            "id": "openrouter",
            "tier": "free",
            "type": "openrouter",
            "base_url": "https://openrouter.ai/api/v1",
            "apiKeyEnv": "OPENROUTER_API_KEY",
            "priority": 1
          }
        ]
      }
    ]
  },
  "class": {
    "enabled": true,
    "tev1Endpoint": "http://127.0.0.1:11433/v1/systemone"
  }
}
```

### Running
```bash
# Start the proxy server (both OllaSurf :11400 and OllaClass :11401)
npm start

# Deep debug tracing: trace plugin requests (prompts) and replies (wrapped OllaClass responses)
npm start -- --debug

# Equivalent shortcut
npm run debug

# Show help
npm start -- --help

# Equivalent shortcut
npm run help

# Run unit tests
npm test

# Run integration tests (skips if Ollama not running on :11434)
npm run test:integration
```

## Usage

### Proxy Endpoints
- `POST /v1/chat/completions` - Chat completions proxy
- `GET /v1/models` - Virtual model listing
- `GET /health` - Health check

### Virtual Models
- `ollasurf/auto` - Auto-routing with classifier
- `ollasurf/trivial` 
- `ollasurf/research`
- `ollasurf/implement`
- `ollasurf/hard`

### Dashboard
Visit `http://localhost:11400/dashboard` for:
- Provider status (healthy/exhausted/cooldown)
- Usage tracking (tokens_in/out, cost, latency)
- Request log (last 50 events)
- Plugin status

> Note: the `/dashboard` HTML page is a v1 stub that currently renders only the plugin list; the JSON APIs above (`/api/providers`, `/api/requests`) are the working interfaces today.

## Observability

There are two surfaces. The durable record is the SQLite ledger at `data/ollasieve.db`, exposed by OllaSurf on `:11400` via the JSON APIs below. The narrative surface is a JSON Lines decision trace at `data/ollasieve.log.jsonl`.

### JSONL decision trace

The JSONL log records how a request was handled, decision by decision. `provider_attempt` events capture the outcome of a single provider attempt (level info). `request_summary` events are the terminal per-request record, carrying the request id, model, tier, status, provider, attempts, and latency. Events flow through an injected sink; the default sink appends one JSON object per line and degrades to console-only output if the file write fails, so logging never fails a request.

Rotation rolls the log file at 10 MB and keeps the 5 most recent files.

### Capturing logs
```bash
# Live, terminal only (JSONL decision trace also written to data/ollasieve.log.jsonl)
npm start

# Live, plus a durable copy on disk
npm start 2>&1 | tee ollasieve.log
```

Every HTTP request is logged by a per-request middleware (`src/request-log.js`) as a single line, tagged with the service name. Successes (2xx/3xx) via `console.log`, client errors (4xx) via `console.warn`, server errors (5xx) via `console.error`. This covers `/health`, proxy endpoints, and dashboard routes, so hitting the endpoints from a client (OpenCode/OpenChamber, curl, etc.) always produces console output.

Deep debug tracing (via `npm start -- --debug`) adds per-request access lines (request id, method, url, status, latency) plus raw prompt traces through to the wrapped classifier reply. Access lines are also written as JSONL decision events when debug is on.

### Log recovery

If the JSONL file write fails, the logger degrades to console-only output and the SQLite ledger remains the source of durable facts. For the original `better-sqlite3` install blocker, see the recovery steps under Installation.

### Observability checks (OllaSurf :11400)
```bash
# Liveness
curl -s http://127.0.0.1:11400/health

# Request ledger - last 50 usage_events (provider, model, tokens, cost, status, latency, switched_from)
curl -s http://127.0.0.1:11400/api/requests

# Configured tiers / providers
curl -s http://127.0.0.1:11400/api/providers

# Plugin load status (running / skipped / error)
curl -s http://127.0.0.1:11400/api/plugins
```

These run against a live server (`npm start` in another terminal). Until a request has flowed through, `/api/requests` returns an empty `events` array.

### What is not exposed yet
- Provider health - the `provider_state` table (`healthy` / `exhausted` / `cooldown`, `cooldown_until`, `consecutive_failures`, `last_error`) - is persisted to SQLite but has **no API endpoint**.
- The `/dashboard` HTML page is a v1 stub: it currently renders only the plugin list, not provider status, usage, or the request log.

## OpenCode Integration

Configure OpenCode to use OllaSurf:
```json
{
  "providers": [
    {
      "id": "ollasurf",
      "baseURL": "http://127.0.0.1:11400/v1",
      "models": ["ollasurf/auto", "ollasurf/trivial", "ollasurf/research", "ollasurf/implement", "ollasurf/hard"],
      "defaultModel": "ollasurf/auto"
    }
  ],
  "defaultProvider": "ollasurf"
}
```

## License
MIT - see LICENSE.