/*
 * OllaSieve - Agent proxy with optional provider dashboard and classifier proxy.
 *
 * Entry point: loads config, opens SQLite, creates plugin registry,
 * starts OllaSurf (:11400) and OllaClass (:11401) servers.
 *
 * Architecture (single Node process, two optional Express servers):
 *   OpenCode / OpenChamber (client)
 *     -> OllaSurf :11400  (proxy + dashboard)
 *           -> resolveTier  -> proxy-router.js  (virtual model -> tier lookup)
 *           -> executeWithSwitching -> proxy-router.js (provider loop + switching)
 *                -> adapter (RealAdapter / MockAdapter)
 *     -> OllaClass :11401 (classifier)
 *           -> tev1 :11433  (Jev-style prompt wrapping + confidence gating)
 *   Shared: SQLite WAL ledger  (db.js schema / cap-ledger-{records,state}.js)
 *   Shared: provider adapter    (adapter.js: ProviderAdapter | MockAdapter | RealAdapter)
 *   Shared: plugin registry     (plugin-registry.js -> src/plugins/<name>/index.js)
 *
 */

const { loadConfig } = require('./src/config');
const { openDatabase } = require('./src/db');
const { CapLedger } = require('./src/cap-ledger');
const { PluginRegistry } = require('./src/plugin-registry');
const { createSurfApp } = require('./src/surf-server');
const { createClassApp } = require('./src/class-server');
const { RealAdapter } = require('./src/adapter');
const { parseArgs, printHelp } = require('./src/cli');
const path = require('path');

/**
 * Bootstraps and starts the OllaSieve service.
 *
 * Dependency-injection order matters:
 *   1. config  — load + validate configuration
 *   2. db      — open SQLite (WAL) so cap-ledger can persist usage
 *   3. adapter — create RealAdapter BEFORE apps reference it (bug fix:
 *               previously `adapter` was referenced before `const`
 *               declaration, causing Temporal Dead Zone error)
 *   4. apps    — createSurfApp / createClassApp (each wires its own routes)
 *   5. plugins — registry.load() calls each plugin's init(app, config, ledger, adapter)
 *   6. listen  — bind HTTP servers to configured ports
 *
 * @returns {Promise<void>}
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const debug = args.debug;

  const config = loadConfig();

  // Open SQLite database (WAL mode) — used by cap-ledger for usage tracking
  const db = openDatabase(config.storage.dbPath);

  // CapLedger composite facade: records (usage_events/caps/daily_summary) +
  // state (provider exhausted/cooldown). Apps receive this, not the raw db.
  const ledger = new CapLedger(db);

  /*
   * Inject provider adapter at startup (swappable for testing / MockAdapter).
   * IMPORTANT: must be created before createSurfApp / createClassApp, which
   * receive it as a dependency. Previously this was declared AFTER app
   * creation, triggering a ReferenceError (temporal dead zone).
   */
  const adapter = new RealAdapter();

  // Plugin registry — loads src/plugins/*/index.js and calls init()
  const registry = new PluginRegistry();

  // JSONL decision-trace log lives beside the SQLite ledger (data/ollasieve.log.jsonl).
  const logPath = config.storage && config.storage.dbPath
    ? path.join(path.dirname(config.storage.dbPath), 'ollasieve.log.jsonl')
    : undefined;

  // Create Express apps (null when disabled by config flag)
  const surfApp = config.surf && config.surf.enabled
    ? createSurfApp(config, ledger, adapter, { debug, logPath })
    : null;
  const classApp = config.class && config.class.enabled
    ? createClassApp(config, ledger, { debug, logPath })
    : null;

  /*
   * Load plugins into their target apps.
   * appFactory routes each plugin name to its Express app:
   *   ollasurf  -> surfApp
   *   ollaclass -> classApp
   * Plugins skip gracefully if their app is null (disabled).
   */
  await registry.load(config, (name) => {
    if (name === 'ollasurf') return surfApp;
    if (name === 'ollaclass') return classApp;
    return surfApp || classApp;
  }, ledger, adapter);

  // Expose registry status on both apps (read by dashboard /api/plugins)
  if (surfApp) surfApp.locals.registry = registry;
  if (classApp) classApp.locals.registry = registry;

  // Start HTTP servers
  const servers = [];

  if (surfApp) {
    const surfServer = surfApp.listen(config.server.surfPort, config.server.host, () => {
      console.log(`OllaSurf listening on ${config.server.host}:${config.server.surfPort}`);
    });
    servers.push(surfServer);
  } else {
    console.log('OllaSurf disabled (surf.enabled = false)');
  }

  if (classApp) {
    const classServer = classApp.listen(config.server.classPort, config.server.host, () => {
      console.log(`OllaClass listening on ${config.server.host}:${config.server.classPort}`);
    });
    servers.push(classServer);
  } else {
    console.log('OllaClass disabled (class.enabled = false)');
  }

  // Graceful shutdown — close servers + db on INT/TERM
  const shutdown = () => {
    console.log('\nShutting down...');
    servers.forEach((s) => s.close());
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start OllaSieve:', err.message);
  process.exit(1);
});
