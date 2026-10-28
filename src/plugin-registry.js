// src/plugin-registry.js - Plugin loading and lifecycle management.
//
// Each plugin exports { name, version, init(app, config, ledger) }.
// The registry loads plugins from the config's plugins array, calls
// init() on each enabled plugin, and tracks their status.

const fs = require('fs');
const path = require('path');

class PluginRegistry {
  constructor() {
    this.plugins = new Map(); // name -> { name, version, instance, status, error }
  }

  // Load and initialize plugins from config.
  // pluginDir: base directory containing plugin subdirectories.
  async load(config, appFactory, ledger) {
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
        await pluginModule.init(app, config, ledger);

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

  get(name) {
    return this.plugins.get(name) || null;
  }

  list() {
    return Array.from(this.plugins.values());
  }

  status() {
    const result = {};
    for (const [name, info] of this.plugins) {
      result[name] = { status: info.status, version: info.version, error: info.error };
    }
    return result;
  }
}

module.exports = { PluginRegistry };
