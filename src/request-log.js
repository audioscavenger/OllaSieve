// src/request-log.js - One-line-per-request HTTP access logging for OllaSieve servers.

const { createLogger } = require('./logger');

/**
 * Creates an Express middleware that logs one line per HTTP request to the console.
 * Successes (2xx/3xx) log via console.log, client errors (4xx) via console.warn, and
 * server errors (5xx) via console.error. Covers all routes, including /health and the
 * proxy endpoints, so every request produces a visible log line.
 *
 * @param {string} serviceName - Service label used in log lines (e.g. 'OllaSurf').
 * @returns {Function} Express-compatible middleware factory.
 */
function createRequestLogger(serviceName) {
  const log = createLogger(serviceName);
  return function requestLogger(req, res, next) {
    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const line = `${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`;
      if (res.statusCode >= 500) {
        log.error(line);
      } else if (res.statusCode >= 400) {
        log.warn(line);
      } else {
        log.log(line);
      }
    });
    next();
  };
}

module.exports = { createRequestLogger };
