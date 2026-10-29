/*
 * src/plugins/ollaclass/index.js - OllaClass plugin (stub for ticket #01).
 *
 * Full implementation in ticket #06 (classifier).
 *
 * Plugin interface: exports { name, version, init(app, config, ledger, adapter) }.
 */

const name = 'ollaclass';
const version = '0.1.0';

/**
 * Plugin initialization hook called by PluginRegistry.load().
 * Stores adapter and initialization flag in app.locals for reference by class-server routes.
 *
 * @param {express.Application} app - The Express app instance.
 * @param {object} config - Full app configuration (contains class.* settings).
 * @param {Database} ledger - Shared SQLite database.
 * @param {ProviderAdapter} adapter - Provider adapter.
 */
async function init(app, config, ledger, adapter) {
  app.locals.ollaclass = { initialized: true, adapter };
}

module.exports = { name, version, init };
