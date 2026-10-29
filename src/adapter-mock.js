/*
 * src/adapter-mock.js - Mock adapter for testing.
 *
 * Returns canned responses with configurable usage, status codes, delays.
 * Used by unit tests to simulate provider behavior without network calls.
 *
 * Behavior:
 *   - Each call() pops the next pre-configured response
 *   - After configured responses exhausted, returns a default 200 empty response
 *   - Tracks callCount for assertion in tests
 *
 * Does NOT enforce rate limits, caps, or retries - those are proxy-router's job.
 */

const { ProviderAdapter } = require('./adapter-base');

/**
 * Mock provider adapter for deterministic testing.
 */
class MockAdapter extends ProviderAdapter {
  /**
   * @param {Array<object>} [responses=[]] - Pre-canned responses to return in sequence.
   * Each response: { status, body, usage, latencyMs }.
   */
  constructor(responses = []) {
    super();
    this.responses = responses;
    this.callCount = 0;
  }

  /**
   * Returns the next canned response (or default) and increments callCount.
   *
   * @param {object} request - Request descriptor (ignored, but accepted for interface compat).
   * @returns {Promise<{status: number, body: any, usage: object|null, latencyMs: number}>}
   */
  async call(_request) {
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

module.exports = { MockAdapter };