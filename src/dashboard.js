// src/dashboard.js — Dashboard routes and JSON APIs for ticket #08.

const express = require('express');

function registerDashboard(app, config, ledger) {
  app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'OllaSurf' }));

  app.get('/api/providers', (req, res) => {
    const state = (provider) => ledger.getState(provider.id);
    res.json({ providers: config.surf.tiers || [] });
  });

  app.get('/api/requests', (req, res) => {
    const events = ledger.db ? ledger.db.prepare('SELECT * FROM usage_events ORDER BY ts DESC LIMIT 50').all() : [];
    res.json({ events });
  });

  app.get('/api/plugins', (req, res) => {
    const registry = app.locals ? app.locals.registry : null;
    res.json({ plugins: registry ? registry.status() : {} });
  });

  app.get('/api/purge', async (req, res) => {
    const { days } = req.query || {};
    const daysInt = parseInt(days, 10);
    if (![7, 30, 90, 365].includes(daysInt)) {
      return res.status(400).json({ error: 'Invalid purge days. Use 7, 30, 90, or 365.' });
    }
    const stmt = ledger.db ? ledger.db.prepare('DELETE FROM usage_events WHERE ts <= datetime("now", '-' || ? || " days")') : null;
    if (!stmt) return res.status(503).json({ error: 'Ledger unavailable' });
    const result = stmt.run(`-${daysInt} days`);
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