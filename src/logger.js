// src/logger.js - Structured console logger for OllaSieve servers and services.

/**
 * Creates a tagged console logger for a service name.
 * Tags each line with the service name (e.g. 'OllaSurf') and maps severity
 * levels to console methods, keeping log output consistent across services.
 * When options.debug is true, a debug method is returned that emits lines
 * only while deep-debug tracing is active (CLI --debug).
 *
 * @param {string} serviceName - Service label for log lines (e.g. 'OllaSurf').
 * @param {object} [options] - Optional flags; { debug: boolean } enables debug output.
 * @returns {{log: Function, warn: Function, error: Function, debug: Function}} Logger with log/warn/error/debug methods.
 */
function createLogger(serviceName, options = {}) {
  const debugEnabled = Boolean(options && options.debug);
  const debug = (line) => {
    if (debugEnabled) console.log(`${serviceName}: DEBUG ${line}`);
  };
  const log = (line) => console.log(`${serviceName}: ${line}`);
  const warn = (line) => console.warn(`${serviceName}: ${line}`);
  const error = (line) => console.error(`${serviceName}: ${line}`);
  return { log, warn, error, debug };
}

module.exports = { createLogger };
