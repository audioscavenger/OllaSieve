// src/class-server.js - OllaClass Express app factory.
//
// Creates an Express application for the OllaClass classifier server.
// Exposes POST /v1/systemone with Jev-style prompt wrapping to tev1 classifier.
// Health endpoint at /health.

const express = require('express');

function createClassApp(config, ledger) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'OllaClass', port: config.server.classPort });
  });

  // Classifier placeholder (implemented below in /v1/systemone)
  app.post('/v1/systemone', async (req, res) => {
    try {
      const { prompt, action } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Missing prompt in request body' });
      }

      const { adapter } = app.locals.ollaclass;
      const tev1Endpoint = config.class.tev1Endpoint || 'http://127.0.0.1:11433/v1/systemone';

      if (!adapter) {
        return res.status(500).json({ error: 'Adapter not available' });
      }

      // Build Jev-style payload
      const payload = buildJevPayload(prompt, action);

      // POST to tev1
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
        return res.status(response.status).json({ error: 'tev1 error', detail: response.body });
      }

      // Parse tev1 response
      const parsed = parseTev1Response(response.body);

      // Confidence gating
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

      return res.json({
        category,
        confidence,
        is_clear: parsed.is_clear,
        probabilities: parsed.probabilities,
        usage: parsed.usage,
        low_confidence: lowConfidence,
        raw: response.body,
      });

    } catch (err) {
      console.error('OllaClass error:', err.message);
      return res.status(500).json({ error: 'Classification failed', detail: err.message });
    }
  });

  // Build Jev-style prompt wrapping payload
  // tev1 expects: { state: { prompt, action }, questions: { intent_category: choice(...), is_clear: noul(...) } }
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

  // Parse tev1 response into normalized output
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

  return app;
}

module.exports = { createClassApp };