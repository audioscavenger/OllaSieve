// src/logger.js - Structured console + JSONL decision-trace logger for OllaSieve.
//
// Emits timestamped events through an injectable sink. The default sink appends
// one JSON object per line (JSONL) to <dataDir>/ollasieve.log.jsonl via
// appendFileSync, prints the event to the console, and rotates at 10 MB while
// keeping the 5 most recent files; it degrades to console-only output if the file
// write fails, so logging must never fail a request.
//
// Event types in circulation:
//   - access: one line per HTTP request, emitted at debug level (via logger.debug),
//     carrying requestId/method/url/status/latencyMs
//   - provider_attempt: single provider attempt outcome (level info)
//   - request_summary: terminal per-request event with requestId, model, tier,
//     status, provider, switchedFrom, attempts, latencyMs (level info)
//
// Dependency graph:
//   src/request-log.js -> createLogger() -> sink (default file, injectable)
//   src/proxy-router.js -> executeWithSwitching() -> logger from deps
//   src/surf-server.js -> createLogger() -> sink (from app options)
//   src/class-server.js -> createLogger() -> sink (from app options)

const fs = require('fs');
const path = require('path');

const DEFAULT_LOG_DIR = './data';
const DEFAULT_LOG_FILE = 'ollasieve.log.jsonl';
const MAX_LOG_BYTES = 10 * 1024 * 1024;
const KEEP_LOG_FILES = 5;

/**
 * Resolves the default JSONL log file path.
 *
 * @param {string} [dir] - Log directory (defaults to ./data).
 * @returns {string} Path of the JSONL log file.
 */
function resolveLogPath(dir) {
  return path.join(dir || DEFAULT_LOG_DIR, DEFAULT_LOG_FILE);
}

/**
 * Rotates the JSONL log file: renames the current file to the next backup slot
 * and evicts backups beyond KEEP_LOG_FILES.
 *
 * @param {string} logPath - Current log file path.
 * @returns {void}
 */
function rotateLogFile(logPath) {
  const dir = path.dirname(logPath);
  const base = path.basename(logPath);
  for (let i = KEEP_LOG_FILES; i >= 1; i -= 1) {
    const older = path.join(dir, `${base}.${i}`);
    if (fs.existsSync(older)) {
      fs.rmSync(older, { force: true });
    }
  }
  fs.renameSync(logPath, path.join(dir, `${base}.1`));
}

/**
 * Creates the default JSONL file sink. Writes one JSON object per line via
 * appendFileSync and prints the event to the console; returns false when the file
 * write fails so callers can degrade to console-only output.
 *
 * @param {string} logPath - Target JSONL file path.
 * @param {number} [maxBytes=MAX_LOG_BYTES] - Rotation threshold in bytes.
 * @returns {Function} Sink function (event) -> boolean handled.
 */
function createDefaultFileSink(logPath, maxBytes) {
  const threshold = maxBytes || MAX_LOG_BYTES;
  return function fileSink(event) {
    let fileOk = true;
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      if (fs.existsSync(logPath) && fs.statSync(logPath).size >= threshold) {
        rotateLogFile(logPath);
      }
      fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`);
    } catch (err) {
      fileOk = false;
    }
    const method = event.level === 'error' ? console.error : event.level === 'warn' ? console.warn : console.log;
    const line = event.level === 'debug' ? `${event.service}: DEBUG ${event.type} ${event.message}` : `${event.service}: ${event.message}`;
    method(line);
    return fileOk;
  };
}

/**
 * Builds a timestamped event object; caller-supplied fields override defaults.
 *
 * @param {string} level - Event severity (debug, info, warn, error).
 * @param {string} type - Event type (access, provider_attempt, request_summary, ...).
 * @param {string} message - Human-readable one-line summary.
 * @param {object} [fields] - Extra event fields (may override level/type/message).
 * @param {string} serviceName - Emitting service label.
 * @returns {object} Event object ready for the sink.
 */
function createEvent(level, type, message, fields, serviceName) {
  const event = { timestamp: new Date().toISOString(), level, type, service: serviceName, message };
  return Object.assign(event, fields || {});
}

/**
 * Creates a tagged logger that emits decision events through an injectable sink
 * (default: JSONL file), printing each event to the console as it is handled.
 * When the sink declines (file write failure), output degrades to console-only.
 * Deep debug tracing (logger.debug) is gated by the debug flag and flows through
 * the same sink; logging must never fail a request, so emitEvent swallows sink
 * failures by degrading to console output.
 *
 * @param {string} serviceName - Service label for events (e.g. 'OllaSurf').
 * @param {object} [options] - { debug: boolean, sink: Function|null, logPath: string, maxBytes: number }.
 * @returns {{log: Function, warn: Function, error: Function, debug: Function, emitEvent: Function}} Logger.
 */
function createLogger(serviceName, options = {}) {
  const debugEnabled = Boolean(options && options.debug);
  const injectedSink = typeof options.sink === 'function' ? options.sink : null;
  const logPath = (options && options.logPath) || resolveLogPath();
  const maxBytes = (options && options.maxBytes) || MAX_LOG_BYTES;
  const fileSink = createDefaultFileSink(logPath, maxBytes);
  const sink = injectedSink || fileSink;

  if (!injectedSink) {
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
    } catch (err) {
      // Startup warning: log directory unusable; the sink will degrade to console-only.
      console.warn(`${serviceName}: unable to create log directory ${path.dirname(logPath)}; falling back to console-only logging`);
    }
  }

  const emitEvent = (event) => {
    let handled = true;
    try {
      handled = sink(event) !== false;
    } catch (err) {
      handled = false;
    }
    if (!handled) {
      const method = event.level === 'error' ? console.error : event.level === 'warn' ? console.warn : console.log;
      const line = event.level === 'debug' ? `${serviceName}: DEBUG ${event.type} ${event.message}` : `${serviceName}: ${event.message}`;
      method(line);
    }
    return handled;
  };

  const log = (type, message, fields) => emitEvent(createEvent('info', type, message, fields, serviceName));
  const warn = (type, message, fields) => emitEvent(createEvent('warn', type, message, fields, serviceName));
  const error = (type, message, fields) => emitEvent(createEvent('error', type, message, fields, serviceName));
  const debug = (type, message, fields) => {
    if (debugEnabled) {
      // Deep trace events flow through the same sink (file + injected), keeping
      // JSONL consistent; the sink degrades to console-only on failure.
      emitEvent(createEvent('debug', type, message, fields, serviceName));
    }
  };

  return { log, warn, error, debug, emitEvent };
}

module.exports = { createLogger, createEvent, createDefaultFileSink, resolveLogPath, rotateLogFile, MAX_LOG_BYTES, KEEP_LOG_FILES };
