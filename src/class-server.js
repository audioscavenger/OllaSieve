// src/class-server.js — OllaClass Express app factory.
//
// Creates an Express application for the OllaClass classifier server.
// Exposes:
//   GET /health           — health endpoint
//   POST /v1/systemone    — Jev-style classifier proxy to tev1 (port 11433)
//
// Flow:
//   1. Receive { prompt, action } from OllaSurf (ollasurf/auto)
//   2. Build Jev-style payload: { state: { prompt, action }, questions: { intent_category, is_clear } }
//   3. POST to tev1Endpoint (default http://127.0.0.1:11433/v1/systemone)
//   4. Parse tev1 response: category, confidence, is_clear, probabilities
//   5. Apply confidence gating (threshold 0.6, is_clear 0.5): below -> fallbackCategory
//   6. Return normalized JSON to OllaSurf for tier routing
//
// tev1 runs CPU-only on Ollama (:11433). First request may fail (session quirk)
// — retry once before giving up with 503.

const express = require('express');
const { createLogger } = require('./logger');
const { createRequestLogger } = require('./request-log');

/**
 * Creates the OllaClass Express application.
 *
 * @param {object} config - Full config (server.classPort, class.* settings).
 * @param {Database} ledger - SQLite instance (passed to plugin init).
 * @param {object} [options] - Optional flags; { debug: boolean } enables deep debug tracing.
 * @returns {express.Application} Configured Express app.
 */
function createClassApp(config, ledger, options = {}) {
  const app = express();
  const debug = Boolean(options && options.debug);
  const log = createLogger('OllaClass', { debug });
  // One-line-per-request logging across all OllaClass routes (incl. /health, /v1/systemone)
  app.use(createRequestLogger('OllaClass'));
  app.use(express.json({ limit: '50mb' }));

  // Health endpoint — used by load balancers / startup scripts
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'OllaClass', port: config.server.classPort });
  });

  /**
   * POST /v1/systemone — classify a prompt via tev1 and return category.
   * Called by OllaSurf's classifyAndRoute() for ollasurf/auto routing.
   */
  app.post('/v1/systemone', async (req, res) => {
    try {
      const { prompt, action } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Missing prompt in request body' });
      }

      const ollaclass = app.locals.ollaclass;
      const adapter = ollaclass ? ollaclass.adapter : null;
      const tev1Endpoint = config.class.tev1Endpoint || 'http://127.0.0.1:11433/v1/systemone';

      // If no adapter (no RealAdapter/MockAdapter injected) or OllaClass plugin not
      // loaded yet, this endpoint is effectively unimplemented -> 501.
      if (!ollaclass || !adapter) {
        return res.status(501).json({ error: 'Classifier not yet implemented (ticket #06)' });
      }

      // Deep debug: trace the classification request received from OllaSurf,
      // the Jev-wrapped payload sent to tev1, tev1's reply, and the normalized
      // reply sent back to OllaSurf.
      if (debug) {
        log.debug(`classification request: prompt=${prompt} action=${action || 'implement'}`);
      }

      // Build Jev-style prompt-wrapping payload for tev1
      const payload = buildJevPayload(prompt, action);
      if (debug) {
        log.debug(`jev payload sent to tev1: ${JSON.stringify(payload)}`);
      }

      // POST to tev1 endpoint
      const request = {
        method: 'POST',
        url: tev1Endpoint,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      };

      let response;
      try {
        response = await adapter.call(request);
      } catch (err) {
        // Warm-up retry: first request to tev1 may fail (session quirk)
        console.log('OllaClass: first tev1 request failed, retrying once...');
        try {
          response = await adapter.call(request);
        } catch (err2) {
          console.error('OllaClass: tev1 unavailable after retry:', err2.message);
          return res.status(503).json({ error: 'Classifier unavailable', detail: err2.message });
        }
      }

      if (response.status !== 200) {
        if (debug) {
          log.debug(`tev1 response rejected: status=${response.status} body=${JSON.stringify(response.body)}`);
        }
        return res.status(response.status).json({ error: 'tev1 error', detail: response.body });
      }

      // Deep debug: trace tev1's raw reply.
      if (debug) {
        log.debug(`tev1 response: status=${response.status} body=${JSON.stringify(response.body)}`);
      }

      // Parse tev1 response into normalized output
      const parsed = parseTev1Response(response.body);

      // Confidence gating — low confidence or unclear request -> fallback tier
      const threshold = config.class.confidenceThreshold || 0.6;
      const isClearThreshold = 0.5;

      let category = parsed.category || config.class.fallbackCategory || 'implement';
      let confidence = parsed.confidence || 0;
      let lowConfidence = false;

      if (confidence < threshold || (parsed.is_clear !== undefined && parsed.is_clear < isClearThreshold)) {
        category = config.class.fallbackCategory || 'implement';
        confidence = parsed.confidence || 0;
        lowConfidence = true;
      }

      const reply = {
        category,
        confidence,
        is_clear: parsed.is_clear,
        probabilities: parsed.probabilities,
        usage: parsed.usage,
        low_confidence: lowConfidence,
        raw: response.body,
      };

      // Deep debug: trace the reply sent back to OllaSurf.
      if (debug) {
        log.debug(`reply sent to ollasurf: category=${category} confidence=${confidence} low_confidence=${lowConfidence}`);
      }

      return res.json(reply);

    } catch (err) {
      console.error('OllaClass error:', err.message);
      return res.status(500).json({ error: 'Classification failed', detail: err.message });
    }
  });

  return app;
}

/**
 * Builds the Jev-style payload tev1 expects.
 * Structure: { state: { prompt, action }, questions: { intent_category: choice(...), is_clear: noul(...) } }
 *
 * @param {string} prompt - User text to classify.
 * @param {string} [action='implement'] - Action hint ('implement', 'research', etc.).
 * @returns {object} Jev-compatible payload object.
 */
function buildJevPayload(prompt, action) {
  return {
    state: {
      prompt,
      action: action || 'implement',
    },
    questions: {
      intent_category: {
        type: 'choice',
        options: ['trivial', 'research', 'implement', 'hard_reasoning'],
        prompt: `Classify this request into one of: trivial, research, implement, hard_reasoning. Context: ${prompt}`,
      },
      is_clear: {
        type: 'noul',
        prompt: `Is this request clear enough to process? Context: ${prompt}`,
      },
    },
  };
}

/**
 * Parses a tev1 response body into normalized fields.
 * Handles multiple tev1 response shapes (choice / choices[0].choice / intent_category,
 * probabilities similarly, confidence similarly, noul/is_clear).
 *
 * @param {object} body - Raw tev1 response body.
 * @returns {{category, confidence, is_clear, probabilities, usage: object|null}}
 */
function parseTev1Response(body) {
  const result = {};

  // Extract choice (intent_category selection)
  if (body.choice !== undefined) {
    result.category = body.choice;
  } else if (body.choices && body.choices[0] && body.choices[0].choice !== undefined) {
    result.category = body.choices[0].choice;
  } else if (body.intent_category !== undefined) {
    result.category = body.intent_category;
  }

  // Extract probabilities
  if (body.probabilities !== undefined) {
    result.probabilities = body.probabilities;
  } else if (body.choices && body.choices[0] && body.choices[0].probabilities !== undefined) {
    result.probabilities = body.choices[0].probabilities;
  } else if (body.intent_category_probabilities !== undefined) {
    result.probabilities = body.intent_category_probabilities;
  }

  // Extract confidence
  if (body.confidence !== undefined) {
    result.confidence = body.confidence;
  } else if (body.choices && body.choices[0] && body.choices[0].confidence !== undefined) {
    result.confidence = body.choices[0].confidence;
  }

  // Extract noul (is_clear) - yes/no
  if (body.noul !== undefined) {
    result.is_clear = body.noul;
  } else if (body.is_clear !== undefined) {
    result.is_clear = body.is_clear;
  } else if (body.choices && body.choices[0] && body.choices[0].is_clear !== undefined) {
    result.is_clear = body.choices[0].is_clear;
  }

  // Extract usage
  if (body.usage !== undefined) {
    result.usage = body.usage;
  }

  return result;
}

module.exports = { createClassApp };