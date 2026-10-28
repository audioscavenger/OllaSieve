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
MIT — see LICENSE.