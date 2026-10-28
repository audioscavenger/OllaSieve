// src/adapter.js — Provider client adapter interface and implementations.
//
// Defines a swappable adapter for calling upstream providers.
// The adapter takes a request (URL, headers, body) and returns a parsed response
// with usage data. Supports both OpenAI-compat (`usage.prompt_tokens`/`
// completion_tokens`) and Ollama native (`prompt_eval_count`/`eval_count`) shapes.

/** Adapter interface: request → parsed response with usage data */
class ProviderAdapter {
  // Call a provider endpoint with request parameters
  // Throws on network errors, adapter should not return 5xx/4xx as errors
  async call(request) {
    throw new Error('Not implemented: extend ProviderAdapter');
  }
}

// Mock adapter for testing – returns canned responses and configurable usage data
class MockAdapter extends ProviderAdapter {
  constructor(responses = []) {
    super();
    this.responses = responses; // each: { status, body, usage, latencyMs }
    this.callCount = 0;
  }

  async call(request) {
    this.callCount++;
    const response = this.responses[this.callCount - 1] || this.responses[0] || {
      status: 200,
      body: { choices: [{ message: { content: '' } }], usage: null },
      usage: null,
      latencyMs: 0,
    };

    return {
      status: response.status,
      body: response.body,
      usage: response.usage,
      latencyMs: response.latencyMs,
    };
  }
}

// Real adapter – fetch-based HTTP client for upstream providers
class RealAdapter extends ProviderAdapter {
  constructor() {
    super();
    this.stats = { calls: 0, errors: 0, latencyTotal: 0 };
  }

  async call(request) {
    this.stats.calls++;
    const start = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s

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
        // fallback for plain text or unexpected responses
        body = await res.text();
      }

      const usage = this.parseUsage(body, res.headers);

      return {
        status: res.status,
        body,
        usage,
        latencyMs,
      };
    } catch (err) {
      clearTimeout(timeout);
      this.stats.errors++;
      throw err;
    }
  }

  // Normalize usage from either OpenAI-compat or Ollama native shapes
  parseUsage(body, headers) {
    // Try OpenAI-compat first: usage.prompt_tokens / usage.completion_tokens
    if (body.usage && typeof body.usage.prompt_tokens === 'number') {
      return {
        tokensIn: body.usage.prompt_tokens,
        tokensOut: body.usage.completion_tokens,
        costUsd: body.usage.cost_usd ?? null,
      };
    }

    // Try Ollama native: prompt_eval_count / eval_count
    if (typeof body.prompt_eval_count === 'number') {
      return {
        tokensIn: body.prompt_eval_count,
        tokensOut: body.eval_count || 0,
        costUsd: null,
      };
    }

    // Fallback: no usage data
    return null;
  }
}

module.exports = {
  ProviderAdapter,
  MockAdapter,
  RealAdapter,
};