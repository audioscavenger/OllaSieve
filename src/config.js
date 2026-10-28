// src/config.js — Configuration loading and validation for OllaSieve.
//
// Loads ollasieve.config.json from the working directory (or a path given
// via OLLASIEVE_CONFIG env var), applies env-var overrides for secrets
// (secrets are referenced by env var *name* in the config, never stored
// in the file), and validates required fields.

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  version: 1,
  server: {
    host: '127.0.0.1',
    surfPort: 11400,
    classPort: 11401,
  },
  storage: {
    dbPath: './data/ollasieve.db',
    retentionDays: null,
    purgeOptions: [7, 30, 90, 365],
  },
  plugins: [
    { name: 'ollasurf', enabled: true },
    { name: 'ollaclass', enabled: true },
  ],
  surf: {
    enabled: true,
    switchThreshold: 0.97,
    reactiveRecovery: true,
    reactiveRetries: 1,
    reactiveCooldownMs: 3000,
    modelMatching: 'family',
    pollingIntervalMs: 300000,
    tiers: [],
  },
  class: {
    enabled: true,
    tev1Endpoint: 'http://127.0.0.1:11433/v1/systemone',
    tev1Model: 'tev1:0.8b',
    categories: ['trivial', 'research', 'implement', 'hard_reasoning'],
    confidenceThreshold: 0.6,
    fallbackCategory: 'implement',
    promptWrapping: 'jev-style',
  },
  dashboard: {
    enabled: true,
    path: '/dashboard',
    requestLogSize: 50,
  },
};

function validate(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    errors.push('Config must be an object');
    return errors;
  }
  if (config.version !== 1) errors.push('version must be 1');
  if (!config.server || typeof config.server !== 'object') errors.push('server section required');
  else {
    if (typeof config.server.surfPort !== 'number') errors.push('server.surfPort must be a number');
    if (typeof config.server.classPort !== 'number') errors.push('server.classPort must be a number');
  }
  if (!Array.isArray(config.plugins)) errors.push('plugins must be an array');
  return errors;
}

function loadConfig(configPath) {
  const resolvedPath = configPath || process.env.OLLASIEVE_CONFIG || path.join(process.cwd(), 'ollasieve.config.json');

  let raw = {};
  if (fs.existsSync(resolvedPath)) {
    const text = fs.readFileSync(resolvedPath, 'utf8');
    raw = JSON.parse(text);
  }

  // Deep merge with defaults
  const config = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), raw);

  // Validate
  const errors = validate(config);
  if (errors.length > 0) {
    throw new Error('Config validation failed: ' + errors.join('; '));
  }

  // Resolve dbPath relative to config file location (or cwd)
  const configDir = path.dirname(path.resolve(resolvedPath));
  if (config.storage && config.storage.dbPath && !path.isAbsolute(config.storage.dbPath)) {
    config.storage.dbPath = path.resolve(configDir, config.storage.dbPath);
  }

  return config;
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Resolve an env var reference: if a config field is an env var name string,
// look it up in process.env. Used for apiKeyEnv fields.
function resolveEnv(name) {
  return process.env[name] || null;
}

module.exports = { loadConfig, validate, DEFAULT_CONFIG, resolveEnv, deepMerge };