/*
 * src/adapter-base.js — Provider client adapter base class.
 *
 * Defines the minimal interface all adapters must implement:
 *   call(request) -> Promise<{ status, body, usage, latencyMs }>
 *
 * Where:
 *   - request: { method, url, headers, body }
 *   - status: HTTP status code
 *   - body: parsed response body (JSON or text)
 *   - usage: { tokensIn, tokensOut, costUsd } | null
 *   - latencyMs: round-trip time in milliseconds
 *
 * Subclasses: MockAdapter (tests), RealAdapter (production fetch).
 *
 * This interface is dependency-injected into createSurfApp / createClassApp
 * so the proxy and classifier work with any transport.
 */

/**
 * Abstract base class for all provider adapters.
 * Subclasses must implement call() to perform the actual HTTP request.
 */
class ProviderAdapter {
  /**
   * Makes an HTTP call to an upstream provider.
   *
   * @param {object} request - Request descriptor.
   * @param {string} request.method - HTTP method (default POST).
   * @param {string} request.url - Full URL including path.
   * @param {object} request.headers - HTTP headers (Authorization, etc.).
   * @param {object} [request.body] - Request body (JSON-serialized).
   * @returns {Promise<{status: number, body: any, usage: object|null, latencyMs: number}>}
   * @throws {Error} On network failure or non-OK status (caller handles retries).
   */
  async call(_request) {
    throw new Error('Not implemented: extend ProviderAdapter');
  }
}

module.exports = { ProviderAdapter };