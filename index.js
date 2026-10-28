// OllaSieve - Agent proxy with optional provider dashboard and classifier proxy.
//
// Entry point: loads config, opens SQLite, creates plugin registry,
// starts OllaSurf (:11400) and OllaClass (:11401) servers.

const { loadConfig, resolveEnv } = require('./src/config');
const { openDatabase } = require('./src/db');
const { PluginRegistry } = require('./src/plugin-registry');
const { createSurfApp } = require('./src/surf-server');
const { createClassApp } = require('./src/class-server');
const { RealAdapter } = require('./src/adapter');

async function main() {
  const config = loadConfig();

  // Open SQLite database
  const db = openDatabase(config.storage.dbPath);

  // Plugin registry
  const registry = new PluginRegistry();

  // Create Express apps
  const surfApp = config.surf && config.surf.enabled
    ? createSurfApp(config, db)
    : null;
  const classApp = config.class && config.class.enabled
    ? createClassApp(config, db)
    : null;

  // Inject provider adapter at startup (swappable for testing)
  const adapter = new RealAdapter();

  // Load plugins into their respective apps.
  // Route each plugin to the correct app; skip if the app doesn't exist.
  await registry.load(config, (name) => {
    if (name === 'ollasurf') return surfApp;
    if (name === 'ollaclass') return classApp;
    return surfApp || classApp;
  }, db, adapter);

  // Expose registry status on both apps
  if (surfApp) surfApp.locals.registry = registry;
  if (classApp) classApp.locals.registry = registry;

  // All plugins are loaded into their respective apps via the registry above.
  // ollaclass plugin is routed to classApp by the appFactory.

  // Start servers
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

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    servers.forEach((s) => s.close());
    db.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    servers.forEach((s) => s.close());
    db.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start OllaSieve:', err.message);
  process.exit(1);
});
