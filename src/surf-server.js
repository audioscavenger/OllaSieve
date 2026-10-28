// src/surf-server.js - OllaSurf Express app factory.
//
// Creates an Express application for the OllaSurf proxy server.
// Registers health endpoint, /v1/chat/completions resolver with automated switching,
// /v1/models virtual models, plugin status endpoint, and dashboard placeholder.
// Switching logic: predictive (97% cap threshold) and reactive (429 recovery).

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

  // Switch configuration
  const switchConfig = {
    predictiveThreshold: config.surf.switchThreshold || 0.97,
    reactiveRecovery: config.surf.reactiveRecovery !== false,
    reactiveRetries: config.surf.reactiveRetries || 1,
    reactiveCooldownMs: config.surf.reactiveCooldownMs || 3000,
    modelMatching: config.surf.modelMatching || 'family',
  };

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

  // POST /v1/chat/completions with automated provider switching
  app.post('/v1/chat/completions', async (req, res) => {
    try {
      const { model: virtualModel } = req.body;
      if (!virtualModel) {
        return res.status(400).json({ error: 'Missing model in request body' });
      }

      let tier;
      if (virtualModel === 'ollasurf/auto') {
        // Auto-routing: call OllaClass to classify, then route to mapped tier
        const result = await classifyAndRoute(virtualModel, req.body, res);
        if (!result.success) {
          return res.status(result.status || 503).json(result.error);
        }
        return res.status(result.status).json(result.body);
      } else {
        tier = resolveTier(virtualModel);
        if (!tier) {
          return res.status(400).json({ error: `Unknown virtual model: ${virtualModel}` });
        }

        const result = await executeWithSwitching(tier, req.body, virtualModel);
        if (!result.success) {
          return res.status(result.status || 503).json(result.error);
        }
        return res.status(result.status).json(result.body);
      }
    } catch (err) {
      console.error('OllaSurf proxy error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Call OllaClass for auto-routing: ollasurf/auto -> OllaClass -> category -> tier
  async function classifyAndRoute(virtualModel, body, res) {
    const { adapter } = app.locals.ollasurf;
    const ollaclassUrl = config.server.classPort
      ? `http://127.0.0.1:${config.server.classPort}/v1/systemone`
      : null;

    if (!adapter || !ollaclassUrl) {
      // OllaClass unavailable - fall back to default category
      const defaultCategory = config.class.fallbackCategory || 'implement';
      const tier = resolveTier(`ollasurf/${defaultCategory}`);
      const result = await executeWithSwitching(tier, body, virtualModel);
      return result;
    }

    const classificationRequest = {
      method: 'POST',
      url: ollaclassUrl,
      headers: { 'Content-Type': 'application/json' },
      body: {
        prompt: body.messages?.[0]?.content || body.prompt || '',
        action: body.action || 'implement',
      },
    };

    let classification;
    try {
      const classificationResponse = await adapter.call(classificationRequest);
      classification = classificationResponse.body;
    } catch (err) {
      const defaultCategory = config.class.fallbackCategory || 'implement';
      const tier = resolveTier(`ollasurf/${defaultCategory}`);
      const result = await executeWithSwitching(tier, body, virtualModel);
      return result;
    }

    const category = classification?.category || classification?.result?.category || config.class.fallbackCategory || 'implement';
    const mappedModel = mapCategoryToModel(category);

    // Route to the mapped tier
    const tier = resolveTier(`ollasurf/${mappedModel}`);
    const result = await executeWithSwitching(tier, body, virtualModel);
    return result;
  }

  // Map category -> virtual model
  function mapCategoryToModel(category) {
    const categoryMap = {
      trivial: 'trivial',
      research: 'research',
      implement: 'implement',
      hard_reasoning: 'hard',
    };
    return categoryMap[category] || 'implement';
  }

  // Try routing with automated switching across providers in tier
  async function executeWithSwitching(tier, body, virtualModel) {
    const providers = tier.providers || [];
    if (providers.length === 0) {
      return { success: false, status: 503, error: { error: 'No available providers', providersExhausted: true } };
    }

    let lastError;
    let switchedFrom = null;

    for (let attempt = 0; attempt < providers.length; attempt++) {
      const provider = findFirstAvailableProvider(tier, switchedFrom);
      if (!provider) {
        break;
      }

      const request = {
        method: 'POST',
        url: provider.base_url + '/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKeyEnv ? process.env[provider.apiKeyEnv] || '' : ''}`,
        },
        body,
      };

      const { adapter } = app.locals.ollasurf;
      if (!adapter) {
        return { success: false, status: 500, error: { error: 'Adapter not available' } };
      }

      try {
        const response = await adapter.call(request);

        // Record usage if response has usage data
        if (response.usage) {
          ledger.recordUsage(provider.id, response.body.model, response.usage, response.status, response.latencyMs, switchedFrom);
        }

        // Predictive: check if provider cap now >= threshold
        if (response.status === 200 || response.status === 201) {
          const capsCheck = ledger.checkCaps(provider.id, switchConfig.predictiveThreshold);
          if (capsCheck.exceeded) {
            markProviderExhausted(provider.id, capsCheck.cap, `predictive: ${capsCheck.reason}`);
          }
        }

        return {
          success: true,
          status: response.status,
          body: response.body,
        };

      } catch (err) {
        lastError = err;

        // Reactive 429 recovery: retry on next provider with cooldown
        if (err.status === 429 || (err.message && err.message.includes('429'))) {
          markProviderExhausted(provider.id, null, 'reactive: 429 rate limited');
          switchedFrom = provider.id;
          // Wait cooldown before next attempt
          if (attempt < providers.length - 1 && switchConfig.reactiveCooldownMs > 0) {
            await new Promise(r => setTimeout(r, switchConfig.reactiveCooldownMs));
          }
          continue;
        }

        // Non-429 error: try next provider
        switchedFrom = provider.id;
        continue;
      }
    }

    return { success: false, status: 503, error: { error: 'All providers exhausted', lastError: lastError?.message } };
  }

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

    // Return a minimal default tier when no tiers configured
    return { providers: [] };
  }

  function findFirstAvailableProvider(tier, excludeProviderId) {
    const providers = tier.providers || [];

    for (const provider of providers) {
      if (provider.id === excludeProviderId) continue;

      const state = ledger.getState(provider.id);
      if (state.status === 'exhausted' || state.status === 'cooldown') {
        continue;
      }

      const capsCheck = ledger.checkCaps(provider.id);
      if (capsCheck.exceeded) {
        continue;
      }

      return provider;
    }

    return null;
  }

  function markProviderExhausted(providerId, cap, reason) {
    const cooldownUntil = new Date(Date.now() + switchConfig.reactiveCooldownMs).toISOString();
    ledger.setState(providerId, 'exhausted', cooldownUntil);
    console.log(`OllaSurf: provider ${providerId} marked exhausted - ${reason}`);
  }

  return app;
}

module.exports = { createSurfApp };