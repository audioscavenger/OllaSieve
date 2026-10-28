// src/plugin-registry.js - Plugin loading and lifecycle management.
//
// Each plugin exports { name, version, init(app, config, ledger, adapter) }.
//
// The registry loads plugins from the config's plugins array, calls init() on each
// enabled plugin, and tracks their status (running/not-found/error/skipped).
//
// Plugins live under src/plugins/<name>/index.js:
//   - ollasurf/ → routes attached to OllaSurf (proxy endpoints)
//   - ollaclass/ → routes attached to OllaClass (classifier endpoint)
//
// Status is exposed via app.locals.registry (read by /api/plugins endpoint).

const fs = require('fs');
const path = require('path');

/**
 * Manages plugin discovery, loading, and lifecycle.
 * Plugins are loaded from src/plugins/<name>/index.js based on config.plugins[].
 */
class PluginRegistry {
  constructor() {
    /** @type {Map<string, object>} name -> { name, version, instance, status, error } */
    this.plugins = new Map();
  }

  /**
   * Loads and initializes all enabled plugins from the config.
   *
   * @param {object} config - Config containing plugins array.
   * @param {function(string): express.Application|null} appFactory - Maps plugin name to Express app (or null if disabled).
   * @param {Database} ledger - SQLite instance passed to each plugin's init.
   * @param {ProviderAdapter} adapter - Provider adapter passed to each plugin's init.
   * @returns {Promise<void>}
   */
  async load(config, appFactory, ledger, adapter) {
    const pluginDefs = (config.plugins || []).filter((p) => p.enabled !== false);

    for (const def of pluginDefs) {
      try {
        const pluginPath = path.join(__dirname, 'plugins', def.name, 'index.js');
        if (!fs.existsSync(pluginPath)) {
          this.plugins.set(def.name, {
            name: def.name,
            version: 'unknown',
            instance: null,
            status: 'not-found',
            error: `Plugin file not found: ${pluginPath}`,
          });
          continue;
        }

        const pluginModule = require(pluginPath);
        const pluginName = pluginModule.name || def.name;
        const app = appFactory(def.name);
        if (!app) {
          this.plugins.set(def.name, {
            name: pluginName,
            version: pluginModule.version || '0.1.0',
            instance: pluginModule,
            status: 'skipped',
            error: 'Target app not available (server disabled)',
          });
          continue;
        }
        await pluginModule.init(app, config, ledger, adapter);

        this.plugins.set(def.name, {
          name: pluginName,
          version: pluginModule.version || '0.1.0',
          instance: pluginModule,
          status: 'running',
          error: null,
        });
      } catch (err) {
        this.plugins.set(def.name, {
          name: def.name,
          version: 'unknown',
          instance: null,
          status: 'error',
          error: err.message,
        });
      }
    }
  }

  /**
   * Gets plugin info by name.
   * @param {string} name - Plugin name.
   * @returns {object|null} Plugin info or null if not registered.
   */
  get(name) {
    return this.plugins.get(name) || null;
  }

  /**
   * Lists all loaded plugins.
   * @returns {Array<object>} Array of plugin info objects.
   */
  list() {
    return Array.from(this.plugins.values());
  }

  /**
   * Returns a status map keyed by plugin name.
   * Used by dashboard /api/plugins to show which plugins are active.
   * @returns {object} { pluginName: { status, version, error } }
   */
  status() {
    const result = {};
    for (const [name, info] of this.plugins) {
      result[name] = { status: info.status, version: info.version, error: info.error };
    }
    return result;
  }
}

module.exports = { PluginRegistry };