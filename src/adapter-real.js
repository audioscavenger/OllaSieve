// src/adapter-real.js — Real adapter (fetch-based) for upstream providers.

const { ProviderAdapter } = require('./adapter-base');

class RealAdapter extends ProviderAdapter {
  constructor() {
    super();
    this.stats = { calls: 0, errors: 0, latencyTotal: 0 };
  }

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

  parseUsage(body, headers) {
    if (body?.usage && typeof body.usage.prompt_tokens === 'number') {
      return { tokensIn: body.usage.prompt_tokens, tokensOut: body.usage.completion_tokens, costUsd: body.usage.cost_usd ?? null };
    }
    if (typeof body.prompt_eval_count === 'number') {
      return { tokensIn: body.prompt_eval_count, tokensOut: body.eval_count || 0, costUsd: null };
    }
    return null;
  }
}

module.exports = { RealAdapter };