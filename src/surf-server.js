// src/surf-server.js - OllaSurf Express app factory.
//
// Creates an Express application for the OllaSurf proxy server.
// Registers health endpoint, /v1/chat/completions resolver, /v1/models virtual models,
// plugin status endpoint, and dashboard placeholder.
// OllaSurf plugin registers its routes via init().

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
    const registry = app.locals.registry;
    if (registry) {
      res.json({ plugins: registry.status() });
    } else {
      res.json({ plugins: {} });
    }
  });

  // OllaSurf proxy endpoints
  // List virtual models
  app.get('/v1/models', (req, res) => {
    const virtualModels = [
      { id: 'ollasurf/auto', object: 'model', created: Date.now(), owned_by: 'OllaSieve' },
      { id: 'ollasurf/trivial', object: 'model', created: Date.now(), owned_by: 'OllaSieve' },
      { id: 'ollasurf/research', object: 'model', created: Date.now(), owned_by: 'OllaSieve' },
      { id: 'ollasurf/implement', object: 'model', created: Date.now(), owned_by: 'OllaSieve' },
      { id: 'ollasurf/hard', object: 'model', created: Date.now(), owned_by: 'OllaSieve' },
    ];
    res.json({ object: 'list', data: virtualModels });
  });

  // POST /v1/chat/completions
  app.post('/v1/chat/completions', async (req, res) => {
    try {
      // Extract virtual model name from request body
      const { model: virtualModel } = req.body;
      if (!virtualModel) {
        return res.status(400).json({ error: 'Missing model in request body' });
      }

      // Resolve virtual model to tier and provider
      const tier = resolveTier(virtualModel);
      if (!tier) {
        return res.status(400).json({ error: `Unknown virtual model: ${virtualModel}` });
      }

      // Find first available provider in tier (excluding exhausted)
      const provider = findFirstAvailableProvider(tier);
      if (!provider) {
        return res.status(503).json({ error: 'No available providers', providersExhausted: true });
      }

      // Prepare request for upstream provider
      const request = {
        method: 'POST',
        url: provider.base_url + '/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKeyEnv ? process.env[provider.apiKeyEnv] || '' : ''}`, // Use env var, not stored in config
        },
        body: req.body,
      };

      // Forward request via adapter
      const { adapter } = app.locals.ollasurf;
      const response = await adapter.call(request);

      // Record usage in ledger
      if (response.usage) {
        ledger.recordUsage(provider.id, response.body.model, response.usage, response.status, response.latencyMs);
      }

      // Return response to client
      return res.status(response.status).json(response.body);
    } catch (err) {
      console.error('OllaSurf proxy error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Helper functions
  function resolveTier(model) {
    const tiers = config.surf.tiers || [];
    
    if (tiers.length > 0) {
      const tierMapping = {
        'ollasurf/auto': tiers.find(t => t.type === 'implement') || tiers[0],
        'ollasurf/trivial': tiers.find(t => t.type === 'trivial') || tiers.find(t => t.priority === 1),
        'ollasurf/research': tiers.find(t => t.type === 'research') || tiers.find(t => t.priority === 2),
        'ollasurf/implement': tiers.find(t => t.type === 'implement') || tiers.find(t => t.priority === 3),
        'ollasurf/hard': tiers.find(t => t.type === 'hard') || tiers.find(t => t.priority === 4),
      };
      return tierMapping[model];
    }
    
    // Return a minimal default tier when no tiers configured (for testing)
    return {
      providers: [],
      resolve: () => null,
    };
  }

  function findFirstAvailableProvider(tier) {
    if (!tier || !tier.providers) return null;

    for (const provider of tier.providers) {
      // Check provider state
      const state = ledger.getState(provider.id);
      if (state.status === 'exhausted' || state.status === 'cooldown') {
        continue;
      }

      // Check caps exceeded
      const capsCheck = ledger.checkCaps(provider.id);
      if (capsCheck.exceeded) {
        continue;
      }

      return provider;
    }

    return null;
  }

  return app;
}

module.exports = { createSurfApp };