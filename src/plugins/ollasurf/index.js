// src/plugins/ollasurf/index.js - OllaSurf plugin (stub for ticket #01).
//
// Full implementation in tickets #04 (core proxy), #05 (switching),
// #07 (OllaClass integration), #08 (dashboard).

const name = 'ollasurf';
const version = '0.1.0';

async function init(app, config, ledger) {
  // Placeholder: plugin loaded successfully.
  // Routes registered here in later tickets.
  app.locals.ollasurf = { initialized: true };
}

module.exports = { name, version, init };
