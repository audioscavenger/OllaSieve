// src/logger.js - Structured console logger for OllaSieve servers and services.

/**
 * Creates a tagged console logger for a service name.
 * Tags each line with the service name (e.g. 'OllaSurf') and maps severity
 * levels to console methods, keeping log output consistent across services.
 *
 * @param {string} serviceName - Service label for log lines (e.g. 'OllaSurf').
 * @returns {{log: Function, warn: Function, error: Function}} Logger with log/warn/error methods.
 */
function createLogger(serviceName) {
  const log = (line) => console.log(`${serviceName}: ${line}`);
  const warn = (line) => console.warn(`${serviceName}: ${line}`);
  const error = (line) => console.error(`${serviceName}: ${line}`);
  return { log, warn, error };
}

module.exports = { createLogger };
