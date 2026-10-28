// src/surf-server.js — OllaSurf Express app factory.
//
// Creates an Express application for the OllaSurf proxy server.
// Registers a health endpoint and a placeholder for the dashboard.
// Plugins (like ollasurf) register their routes via init().

const express = require('express');

function createSurfApp(config, ledger) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'OllaSurf', port: config.server.surfPort });
  });

  // Dashboard placeholder (implemented in ticket #08)
  app.get('/dashboard', (req, res) => {
    res.type('html').send('<html><body><h1>OllaSurf Dashboard</h1><p>Coming soon.</p></body></html>');
  });

  // Plugin status endpoint
  app.get('/api/plugins', (req, res) => {
    // Populated by plugin registry; placeholder
    res.json({ plugins: {} });
  });

  return app;
}

module.exports = { createSurfApp };