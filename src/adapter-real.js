// src/adapter-real.js — Real adapter (fetch-based) for upstream providers.
//
// Makes actual HTTP calls to OpenAI-compatible or Ollama endpoints.
// Parses usage from response body (OpenAI shape or Ollama native shape).
// Tracks per-adapter stats: calls, errors, total latency.
//
// Used by production OllaSurf / OllaClass via dependency injection.
// Can be swapped with MockAdapter for tests.

const { ProviderAdapter } = require('./adapter-base');

/**
 * Real HTTP adapter using global fetch().
 */
class RealAdapter extends ProviderAdapter {
  constructor() {
    super();
    /**
     * @type {{calls: number, errors: number, latencyTotal: number}}
     */
    this.stats = { calls: 0, errors: 0, latencyTotal: 0 };
  }

  /**
   * Executes an HTTP request against an upstream provider.
   *
   * Flow:
   *   1. Increment call counter
   *   2. Start latency timer
   *   3. fetch() with 30s AbortController timeout
   *   4. Parse response body (JSON or text based on Content-Type)
   *   5. Extract usage via parseUsage()
   *   6. Return standardized response object
   *
   * @param {object} request - Request descriptor.
   * @param {string} request.method - HTTP method (default POST).
   * @param {string} request.url - Full target URL.
   * @param {object} request.headers - HTTP headers.
   * @param {object} [request.body] - Request payload.
   * @returns {Promise<{status: number, body: any, usage: object|null, latencyMs: number}>}
   * @throws {Error} On network failure, timeout, or non-recoverable error.
   */
  async call(request) {
    this.stats.calls++;
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(request.url, {
        method: request.method || 'POST',
        headers: request.headers || {},
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      this.stats.latencyTotal += latencyMs;

      let body;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        body = await res.json();
      } else {
        body = await res.text();
      }

      return { status: res.status, body, usage: this.parseUsage(body, res.headers), latencyMs };
    } catch (err) {
      clearTimeout(timeout);
      this.stats.errors++;
      throw err;
    }
  }

  /**
   * Extracts usage info from provider response body.
   * Supports two shapes:
   *   1. OpenAI-compat: { usage: { prompt_tokens, completion_tokens, cost_usd? } }
   *   2. Ollama native: { prompt_eval_count, eval_count }
   *
   * OpenAI shape takes precedence if both present.
   *
   * @param {object} body - Parsed response body.
   * @param {Headers} headers - Response headers.
   * @returns {{tokensIn: number, tokensOut: number, costUsd: number|null}|null}
   */
  parseUsage(body, _headers) {
    // OpenAI-compatible shape (preferred)
    if (body?.usage && typeof body.usage.prompt_tokens === 'number') {
      return {
        tokensIn: body.usage.prompt_tokens,
        tokensOut: body.usage.completion_tokens,
        costUsd: body.usage.cost_usd ?? null,
      };
    }
    // Ollama native shape
    if (typeof body.prompt_eval_count === 'number') {
      return {
        tokensIn: body.prompt_eval_count,
        tokensOut: body.eval_count || 0,
        costUsd: null,
      };
    }
    return null;
  }
}

module.exports = { RealAdapter };