# 08: Dashboard v1

**What to build:** Embedded web UI served at `/dashboard` on OllaSurf's port (:11400). Per-provider progress bars (% usage with reset countdown), provider health status (healthy/exhausted/cooldown with countdown), recent request log (last 50: provider, model, tokens, status, latency, switches), active plugin status (OllaClass, OllaSurf), paid tier cap editor (editable input + quick "+$5" boost button, changes take effect immediately). Purge option (7/30/90/365 days) for usage history.

**Blocked by:** 04 (OllaSurf core proxy)

**Status:** done

- [x] Dashboard served at `/dashboard` on OllaSurf port (HTML + JSON APIs)
- [x] Per-provider progress bars: % usage, reset countdown
- [x] Provider health: healthy (green), exhausted (red), cooldown (yellow with countdown)
- [x] Request log: last 50 requests with provider, model, tokens in/out, status, latency, switch info (`/api/requests`)
- [x] Plugin status: OllaClass (running/stopped, last classification), OllaSurf (running) (`/api/plugins`)
- [x] Paid tier cap editor: input field for dollar limit, "+$5" boost button, immediate effect
- [x] Purge: dropdown or buttons for 7/30/90/365 days, deletes older usage_events (`/api/purge`)
- [x] Dashboard fetches data via JSON API endpoints (no server-side rendering)