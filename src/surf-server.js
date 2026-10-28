// src/surf-server.js - OllaSurf Express app factory.
//
// Creates the Express application for OllaSurf on :11400.
// Wires: health, proxy endpoints (/v1/chat/completions, /v1/models),
// and dashboard routes (HTML + JSON API).

const express = require('express');
const { resolveTier, executeWithSwitching } = require('./proxy-router');
const { registerDashboard } = require('./dashboard');

function createSurfApp(config, ledger, adapter) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'OllaSurf', port: config.server.surfPort });
  });

  // Proxy endpoints
  app.get('/v1/models', (req, res) => {
    const virtualModels = ['auto', 'trivial', 'research', 'implement', 'hard'].map((m) => ({
      id: `ollasurf/${m}`, object: 'model', created: Date.now(), owned_by: 'OllaSieve',
    }));
    res.json({ object: 'list', data: virtualModels });
  });

  app.post('/v1/chat/completions', async (req, res) => {
    try {
      const virtualModel = req.body?.model;
      if (!virtualModel) return res.status(400).json({ error: 'Missing model' });

      if (virtualModel === 'ollasurf/auto') {
        const result = await classifyAndRoute(virtualModel, req.body, config, ledger, adapter);
        if (!result.success) return res.status(result.status || 503).json(result.error);
        return res.status(result.status).json(result.body);
      }

      const tier = resolveTier(virtualModel, config);
      if (!tier) return res.status(400).json({ error: `Unknown virtual model: ${virtualModel}` });

      const result = await executeWithSwitching(tier, req.body, { ledger, adapter });
      if (!result.success) return res.status(result.status || 503).json(result.error);
      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error('OllaSurf proxy error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Dashboard (JSON APIs + HTML page)
  registerDashboard(app, config, ledger);

  return app;
}

async function classifyAndRoute(virtualModel, body, config, ledger, adapter) {
  const ollaclassUrl = config.server.classPort ? `http://127.0.0.1:${config.server.classPort}/v1/systemone` : null;
  if (!adapter || !ollaclassUrl) {
    const tier = resolveTier(`ollasurf/${config.class.fallbackCategory || 'implement'}`, config);
    return executeWithSwitching(tier, body, { ledger, adapter });
  }

  try {
    const clsRes = await adapter.call({
      method: 'POST', url: ollaclassUrl, headers: { 'Content-Type': 'application/json' },
      body: { prompt: body.messages?.[0]?.content || body.prompt || '', action: body.action || 'implement' },
    });
    const cat = clsRes.body?.category || config.class.fallbackCategory || 'implement';
    const tier = resolveTier(cat === 'hard_reasoning' ? 'hard' : cat, config);
    return executeWithSwitching(tier, body, { ledger, adapter });
  } catch {
    const tier = resolveTier(`ollasurf/${config.class.fallbackCategory || 'implement'}`, config);
    return executeWithSwitching(tier, body, { ledger, adapter });
  }
}

module.exports = { createSurfApp };