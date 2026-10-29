/*
 * src/config.js - Configuration loading and validation for OllaSieve.
 *
 * Loads ollasieve.config.json from the working directory (or a path given
 * via OLLASIEVE_CONFIG env var), applies env-var overrides for secrets
 * (secrets are referenced by env var *name* in the config, never stored
 * in the file), and validates required fields.
 *
 * Dependency graph:
 *   index.js -> loadConfig()  -> deepMerge(DEFAULT_CONFIG, raw)
 *   index.js -> resolveEnv()  -> process.env lookup for API keys
 *   config.surf.tiers[].providers[].apiKeyEnv -> _resolvedApiKey
 *
 */

const fs = require('fs');
const path = require('path');

/**
 * Default configuration. A user's ollasieve.config.json is deep-merged into
 * this (user values win). Fields:
 * - server: host + ports (surf=11400, class=11401)
 * - storage: dbPath, retentionDays, purgeOptions
 * - plugins: array of { name, enabled } loaded by PluginRegistry
 * - surf: switchThreshold, reactive settings, tiers (provider list)
 * - class: tev1Endpoint, categories, confidenceThreshold
 * - dashboard: path, requestLogSize
 *
 * @constant {object}
 */
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

/**
 * Validates a TCP port value. Valid ports are integers within 1..65535.
 *
 * @param {number} port - Port value to check.
 * @param {string} fieldName - Config field name used in error messages.
 * @returns {string[]} Array of error strings (empty when valid).
 */
function validatePort(port, fieldName) {
  const errors = [];
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`${fieldName} must be a number between 1 and 65535`);
  }
  return errors;
}

/**
 * Validates the provider tiers configuration shape: surf.tiers must be an
 * array of tier objects, each with a providers array of provider entries
 * carrying a non-empty id and base_url.
 *
 * @param {object} config - Config object to validate.
 * @param {string[]} errors - Accumulator array of validation error messages.
 * @returns {void}
 */
function validateTiers(config, errors) {
  if (!config.surf) return;
  if (!Array.isArray(config.surf.tiers)) {
    errors.push('surf.tiers must be an array');
    return;
  }
  config.surf.tiers.forEach((tier, tierIndex) => {
    const tierLabel = `surf.tiers[${tierIndex}]`;
    if (!tier || typeof tier !== 'object') {
      errors.push(`${tierLabel} must be an object`);
      return;
    }
    if (!Array.isArray(tier.providers)) {
      errors.push(`${tierLabel}.providers must be an array`);
      return;
    }
    tier.providers.forEach((provider, providerIndex) => {
      const providerLabel = `${tierLabel}.providers[${providerIndex}]`;
      if (!provider || typeof provider !== 'object') {
        errors.push(`${providerLabel} must be an object`);
        return;
      }
      if (typeof provider.id !== 'string' || provider.id.trim() === '') {
        errors.push(`${providerLabel}.id must be a non-empty string`);
      }
      if (typeof provider.base_url !== 'string' || provider.base_url.trim() === '') {
        errors.push(`${providerLabel}.base_url must be a non-empty string`);
      }
    });
  });
}

/**
 * Validates a config object's structural integrity.
 * Checks version, server ports, storage dbPath, surf tiers, and plugins array
 * so startup fails fast with actionable error messages on misconfiguration.
 *
 * @param {object} config - Config object to validate.
 * @returns {string[]} Array of validation error messages (empty if valid).
 */
function validate(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    errors.push('Config must be an object');
    return errors;
  }
  if (config.version !== 1) errors.push('version must be 1');
  if (!config.server || typeof config.server !== 'object') errors.push('server section required');
  else {
    errors.push(...validatePort(config.server.surfPort, 'server.surfPort'));
    errors.push(...validatePort(config.server.classPort, 'server.classPort'));
  }
  if (!config.storage || typeof config.storage !== 'object') errors.push('storage section required');
  else if (typeof config.storage.dbPath !== 'string' || config.storage.dbPath.trim() === '') {
    errors.push('storage.dbPath must be a non-empty string');
  }
  validateTiers(config, errors);
  if (!Array.isArray(config.plugins)) errors.push('plugins must be an array');
  return errors;
}

/**
 * Loads + validates configuration.
 *
 * Search order for the config file:
 *   1. Explicit path argument (if provided)
 *   2. OLLASIEVE_CONFIG env var
 *   3. ./ollasieve.config.json in cwd
 *
 * If the file is missing, DEFAULT_CONFIG is used. Secret env-var references
 * (provider.apiKeyEnv) are resolved into provider._resolvedApiKey.
 *
 * @param {string} [configPath] - Optional explicit path to config file.
 * @returns {object} Resolved + validated configuration object.
 * @throws {Error} If validation fails.
 */
function loadConfig(configPath) {
  const resolvedPath = configPath || process.env.OLLASIEVE_CONFIG || path.join(process.cwd(), 'ollasieve.config.json');

  let raw = {};
  if (fs.existsSync(resolvedPath)) {
    const text = fs.readFileSync(resolvedPath, 'utf8');
    raw = JSON.parse(text);
  }

  // Deep merge with defaults (copy defaults so we don't mutate the singleton)
  const config = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), raw);

  // Validate against the schema
  const errors = validate(config);
  if (errors.length > 0) {
    throw new Error('Config validation failed: ' + errors.join('; '));
  }

  // Resolve dbPath relative to config file location (or cwd)
  const configDir = path.dirname(path.resolve(resolvedPath));
  if (config.storage && config.storage.dbPath && !path.isAbsolute(config.storage.dbPath)) {
    config.storage.dbPath = path.resolve(configDir, config.storage.dbPath);
  }

  // Resolve secret env var references in provider entries (apiKeyEnv -> _resolvedApiKey)
  resolveSecrets(config);

  return config;
}

/**
 * Recursively deep-merges source into target (target mutated + returned).
 * Arrays and primitives are replaced; plain objects are merged recursively.
 *
 * @param {object} target - Base object (mutated).
 * @param {object} source - Overlay object.
 * @returns {object} The merged target.
 */
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

/**
 * Resolves an env var by name. Used for apiKeyEnv fields where the config
 * stores the *name* of the env var rather than the secret value itself.
 *
 * @param {string} name - Environment variable name.
 * @returns {string|null} Resolved env value, or null if unset.
 */
function resolveEnv(name) {
  return process.env[name] || null;
}

/**
 * Walks all provider entries in every tier and resolves apiKeyEnv references.
 * The resolved value is stored at `provider._resolvedApiKey` (kept out of any
 * config serialization - secrets are never persisted).
 *
 * @param {object} config - Configuration object (mutated in-place).
 */
function resolveSecrets(config) {
  if (!config.surf || !Array.isArray(config.surf.tiers)) return;
  for (const tier of config.surf.tiers) {
    if (!Array.isArray(tier.providers)) continue;
    for (const provider of tier.providers) {
      if (provider.apiKeyEnv) {
        provider._resolvedApiKey = resolveEnv(provider.apiKeyEnv);
      }
    }
  }
}

module.exports = { loadConfig, validate, DEFAULT_CONFIG, resolveEnv, resolveSecrets, deepMerge };
