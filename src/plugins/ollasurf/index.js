/*
 * src/plugins/ollasurf/index.js - OllaSurf plugin (stub for ticket #01).
 *
 * Full implementation in tickets #04 (core proxy), #05 (switching),
 * #07 (OllaClass integration), #08 (dashboard).
 *
 * Plugin interface: exports { name, version, init(app, config, ledger, adapter) }.
 */

const name = 'ollasurf';
const version = '0.1.0';

/**
 * Plugin initialization hook called by PluginRegistry.load().
 * Stores adapter and initialization flag in app.locals for use by surf-server routes.
 *
 * @param {express.Application} app - The Express app instance the plugin is mounted into.
 * @param {object} config - Full app configuration.
 * @param {Database} ledger - SQLite instance.
 * @param {ProviderAdapter} adapter - Provider adapter (RealAdapter / MockAdapter).
 */
async function init(app, config, ledger, adapter) {
  app.locals.ollasurf = { initialized: true, adapter };
}

module.exports = { name, version, init };
