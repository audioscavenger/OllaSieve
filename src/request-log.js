/*
 * src/request-log.js - One-line-per-request HTTP access logging for OllaSieve servers.
 *
 * Emits one debug-level access event per HTTP request through the logger
 * (default JSONL sink + console when debug is enabled). Severity mapping:
 * 2xx/3xx -> debug level access event, 4xx -> warn, 5xx -> error. Mounted via
 * app.use() before all routes, so every route (health, proxy, models, dashboard,
 * api) is covered and always produces a visible access line while --debug is on.
 */

const { randomUUID } = require('crypto');
const { createLogger } = require('./logger');

/**
 * Creates an Express middleware that emits one access event per HTTP request
 * through the injected/default logger sink when deep debug is enabled.
 * Access lines carry requestId, method, url, status, and latencyMs (metadata
 * only; no request bodies).
 *
 * @param {string} serviceName - Service label used in events (e.g. 'OllaSurf').
 * @param {object} [options] - Logger options forwarded from the app ({ debug }).
 * @returns {Function} Express-compatible middleware factory.
 */
function createRequestLogger(serviceName, options = {}) {
  const debugEnabled = Boolean(options && options.debug);
  const logger = createLogger(serviceName, { debug: debugEnabled, sink: options.sink });
  return function requestLogger(req, res, next) {
    req.id = req.id || randomUUID();
    const startedAt = Date.now();
    res.on('finish', () => {
      if (!debugEnabled) return;
      const durationMs = Date.now() - startedAt;
      const status = res.statusCode;
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'debug';
      const message = `${req.method} ${req.originalUrl} -> ${status} (${durationMs}ms)`;
      const fields = {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        status,
        latencyMs: durationMs,
      };
      if (level === 'debug') {
        logger.debug('access', message, fields);
      } else if (level === 'warn') {
        logger.warn('access', message, fields);
      } else {
        logger.error('access', message, fields);
      }
    });
    next();
  };
}

module.exports = { createRequestLogger };
