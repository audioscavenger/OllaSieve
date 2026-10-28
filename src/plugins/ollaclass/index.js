// src/plugins/ollaclass/index.js — OllaClass plugin (stub for ticket #01).
//
// Full implementation in ticket #06 (classifier).

const version = '0.1.0';

async function init(app, config, ledger) {
  // Placeholder: plugin loaded successfully.
  // Routes registered here in ticket #06.
  app.locals.ollaclass = { initialized: true };
}

module.exports = { version, init };