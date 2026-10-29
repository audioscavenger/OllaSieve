// src/surf-server.js — OllaSurf Express app factory.
//
// Creates the Express application for OllaSurf on :11400.
// Wires: health, proxy endpoints (/v1/chat/completions, /v1/models),
// and dashboard routes (HTML + JSON API).
//
// Routing flow for POST /v1/chat/completions:
//   1. Extract virtualModel from req.body.model
//   2. If 'ollasurf/auto' -> classifyAndRoute (calls OllaClass via adapter)
//   3. Else -> resolveTier() finds tier -> executeWithSwitching() loops providers
//
// Dependency injection: config (settings), db (SQLite ledger), adapter (provider client).
// The adapter is optional for tests (MockAdapter) but required for real proxy flow.

const express = require('express');
const { resolveTier, executeWithSwitching } = require('./proxy-router');
const { registerDashboard } = require('./dashboard');
const { createLogger } = require('./logger');
const { createRequestLogger } = require('./request-log');

/**
 * Creates the OllaSurf Express application.
 *
 * @param {object} config - Full OllaSieve config (includes surf.tiers, server, class).
 * @param {Database} ledger - SQLite db instance (passed to proxy-router for usage tracking).
 * @param {ProviderAdapter} adapter - Provider adapter (RealAdapter / MockAdapter / null for tests).
 * @param {object} [options] - Optional flags; { debug: boolean, sink: Function } enables deep debug tracing and event injection.
 * @returns {express.Application} Configured Express app.
 */
function createSurfApp(config, ledger, adapter, options = {}) {
  const app = express();
  const opts = options || {};
  const debug = Boolean(opts.debug);
  const log = createLogger('OllaSurf', { debug, sink: opts.sink, logPath: opts.logPath, maxBytes: opts.maxBytes });
  // Switching policy consumed by proxy-router's executeWithSwitching.
  // predictiveThreshold (default 0.97) drives predictive exhaustion checks;
  // reactiveCooldownMs drives cooldown windows after failures.
  const switchConfig = {
    predictiveThreshold: (config.surf && config.surf.switchThreshold) ?? 0.97,
    reactiveCooldownMs: (config.surf && config.surf.reactiveCooldownMs) ?? 3000,
  };
  // One-line-per-request access logging across all OllaSurf routes (incl. /health, proxy)
  app.use(createRequestLogger('OllaSurf', { debug }));
  app.use(express.json({ limit: '50mb' }));

  // Health endpoint — used by load balancers / startup scripts
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'OllaSurf', port: config.server.surfPort });
  });

  // Virtual model listing — tells OpenCode / clients which ollasurf/* models exist
  app.get('/v1/models', (req, res) => {
    const virtualModels = ['auto', 'trivial', 'research', 'implement', 'hard'].map((m) => ({
      id: `ollasurf/${m}`, object: 'model', created: Date.now(), owned_by: 'OllaSieve',
    }));
    res.json({ object: 'list', data: virtualModels });
  });

  // Main proxy endpoint — receives chat-completion requests and routes to provider(s)
  app.post('/v1/chat/completions', async (req, res) => {
    try {
      const virtualModel = req.body?.model;
      if (!virtualModel) return res.status(400).json({ error: 'Missing model' });

      // Deep debug: trace the incoming chat completion prompt that will flow
      // into the plugin chain (OllaClass classifier / provider adapter).
      // Debug lines are console-only deep traces; the JSONL decision trace
      // carries metadata only (no prompt bodies).
      if (debug) {
        log.debug('proxy_request', `chat completion received: model=${virtualModel} prompt=${extractPromptText(req.body)}`, { requestId: req.id, model: virtualModel });
      }

      // Auto-routing: delegate to OllaClass classifier first
      if (virtualModel === 'ollasurf/auto') {
        const result = await classifyAndRoute(virtualModel, req.body, config, ledger, adapter, switchConfig, log, req.id);
        if (!result.success) return res.status(result.status || 503).json(result.error);
        return res.status(result.status).json(result.body);
      }

      // Direct tier resolution + provider execution
      const tier = resolveTier(virtualModel, config);
      if (!tier) return res.status(400).json({ error: `Unknown virtual model: ${virtualModel}` });

      const result = await executeWithSwitching(tier, req.body, { ledger, adapter, switchConfig, logger: log, requestId: req.id });
      if (!result.success) return res.status(result.status || 503).json(result.error);
      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error('OllaSurf proxy error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Dashboard routing (JSON APIs + HTML page from dashboard.js)
  registerDashboard(app, config, ledger);

  return app;
}

/**
 * Extracts the prompt text from a chat completion body.
 * Supports both a plain string prompt and the OpenAI-style messages array.
 *
 * @param {object} body - Chat completion request body.
 * @returns {string} Concatenated prompt text (may be empty).
 */
function extractPromptText(body) {
  if (typeof body?.prompt === 'string') return body.prompt;
  if (Array.isArray(body?.messages)) {
    return body.messages.map((m) => `${m?.role || 'user'}: ${m?.content || ''}`).join('\n');
  }
  return '';
}

/**
 * Handles ollasurf/auto routing by calling OllaClass classifier endpoint,
 * then routing to the tier that matches the returned category.
 *
 * If adapter is unavailable or call fails, falls back to config's fallbackCategory.
 *
 * @param {string} virtualModel - Should be 'ollasurf/auto'.
 * @param {object} body - Original chat request body.
 * @param {object} config - App config (needs server.classPort, class.fallbackCategory).
 * @param {Database} ledger - SQLite instance.
 * @param {ProviderAdapter} adapter - Adapter for calling OllaClass.
 * @param {object} switchConfig - Switching policy: { predictiveThreshold, reactiveCooldownMs }.
 * @param {object} log - OllaSurf logger carrying the decision-trace sink.
 * @param {string} requestId - Correlation id for the request trace.
 * @returns {Promise<{success: boolean, status?: number, body?: object, error?: object}>}
 */
async function classifyAndRoute(virtualModel, body, config, ledger, adapter, switchConfig, log, requestId) {
  const ollaclassUrl = config.server.classPort ? `http://127.0.0.1:${config.server.classPort}/v1/systemone` : null;
  // If no adapter or no OllaClass server configured, skip classification and use fallback tier
  if (!adapter || !ollaclassUrl) {
    const tier = resolveTier(`ollasurf/${config.class.fallbackCategory || 'implement'}`, config);
    return executeWithSwitching(tier, body, { ledger, adapter, switchConfig, logger: log, requestId });
  }

  try {
    const clsRes = await adapter.call({
      method: 'POST', url: ollaclassUrl, headers: { 'Content-Type': 'application/json' },
      body: { prompt: body.messages?.[0]?.content || body.prompt || '', action: body.action || 'implement' },
    });
    const cat = clsRes.body?.category || config.class.fallbackCategory || 'implement';
    const tier = resolveTier(cat === 'hard_reasoning' ? 'hard' : cat, config);
    return executeWithSwitching(tier, body, { ledger, adapter, switchConfig, logger: log, requestId });
  } catch {
    // Classification failed — fall back to safe default tier
    const tier = resolveTier(`ollasurf/${config.class.fallbackCategory || 'implement'}`, config);
    return executeWithSwitching(tier, body, { ledger, adapter, switchConfig, logger: log, requestId });
  }
}

module.exports = { createSurfApp, extractPromptText };