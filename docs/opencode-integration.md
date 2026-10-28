# OllaSieve → OpenCode startup orchestration

## Run order
1. Launch OllaSieve (both servers) → `npm start`
   - OllaSurf   :11400
   - OllaClass  :11401
2. Wait for `/health` endpoints to return 200
3. Launch OpenCode → `opencode` (uses `opencode.jsonc` → `ollasurf` provider)

## OpenCode config
`opencode.jsonc` defines `ollasurf` provider at `http://127.0.0.1:11400/v1`
with virtual models: auto / trivial / research / implement / hard.

## OpenChamber config
`openchamber-providers.json`: only OllaSurf (sole provider).
`classifier-endpoint.json`: points at OllaClass `:11401/v1/systemone`.

## Verification
- `npm start` — both health endpoints return 200
- `npm run test:integration` — Ollama :11434 reachable → proxy flow + usage tracked; skip gracefully if unreachable
- `npm test` — 35 unit tests pass
