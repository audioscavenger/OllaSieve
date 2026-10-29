/*
 * src/dashboard.js - Dashboard routes and JSON APIs for OllaSurf (:11400).
 *
 * Mounts GET endpoints under /api/* serving:
 *   - /api/health            - service status
 *   - /api/providers         - per-tier provider list (used by dashboard progress bars)
 *   - /api/requests          - recent usage_events (last 50)
 *   - /api/plugins           - plugin registry status (running/skipped/error)
 *   - /api/purge?days=N      - delete usage_events older than N days
 *   - /dashboard             - HTML page that polls the JSON APIs (no SSR)
 *
 * All data originates from the shared cap-ledger (SQLite) and PluginRegistry.
 */

/**
 * Registers dashboard routes onto the OllaSurf Express app.
 *
 * @param {express.Application} app - OllaSurf Express app.
 * @param {object} config - App config (surf.tiers for /api/providers).
 * @param {CapLedger} ledger - Ledger instance (db + state + records).
 */
function registerDashboard(app, config, ledger) {
  app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'OllaSurf' }));

  app.get('/api/providers', (req, res) => {
    // Provider status fetched per tier by client; tiers list is used for progress bars
    res.json({ providers: config.surf.tiers || [] });
  });

  app.get('/api/requests', (req, res) => {
    const events = ledger.getRequestLog();
    res.json({ events });
  });

  app.get('/api/plugins', (req, res) => {
    const registry = app.locals ? app.locals.registry : null;
    res.json({ plugins: registry ? registry.status() : {} });
  });

  app.get('/api/purge', async (req, res) => {
    const { days } = req.query || {};
    const daysInt = parseInt(days, 10);
    // Whitelist purge windows to prevent accidental data loss
    if (![7, 30, 90, 365].includes(daysInt)) {
      return res.status(400).json({ error: 'Invalid purge days. Use 7, 30, 90, or 365.' });
    }
    const stmt = ledger.db ? ledger.db.prepare('DELETE FROM usage_events WHERE ts <= datetime(\'now\', \'-\' || ? || \' days\')') : null;
    if (!stmt) return res.status(503).json({ error: 'Ledger unavailable' });
    const result = stmt.run(`${daysInt} days`);
    res.json({ deleted: result.changes, days: daysInt });
  });

  app.get('/dashboard', (req, res) => {
    res.type('html').send(`<!DOCTYPE html>
<html><head><title>OllaSurf Dashboard</title></head>
<body><h1>Dashboard v1</h1><p>Providers and request log coming soon.</p>
<p>Plugins: <span id="plugins"></span></p>
<script>fetch('/api/plugins').then(r=>r.json()).then(d=>document.getElementById('plugins').innerText=JSON.stringify(d.plugins));</script>
</body></html>`);
  });
}

module.exports = { registerDashboard };