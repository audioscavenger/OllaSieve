// src/class-server.js — OllaClass Express app factory.
//
// Creates an Express application for the OllaClass classifier server.
// Registers a health endpoint and a placeholder for /v1/systemone.
// The ollaclass plugin registers the actual classifier routes via init().

const express = require('express');

function createClassApp(config, ledger) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'OllaClass', port: config.server.classPort });
  });

  // Classifier placeholder (implemented in ticket #06)
  app.post('/v1/systemone', (req, res) => {
    res.status(501).json({ error: 'Classifier not yet implemented (ticket #06)' });
  });

  return app;
}

module.exports = { createClassApp };