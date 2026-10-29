// tests/servers.test.js - Server startup and health endpoint tests.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { loadConfig } = require('../src/config');
const { openDatabase, closeDatabase } = require('../src/db');
const { CapLedger } = require('../src/cap-ledger');
const { MockAdapter } = require('../src/adapter');
const { createSurfApp } = require('../src/surf-server');
const { createClassApp } = require('../src/class-server');

describe('servers', () => {
  let config;
  let db;
  let surfServer;
  let classServer;

  before(() => {
    config = loadConfig();
    db = openDatabase(':memory:');
    // Force WAL-compatible: in-memory db won't use WAL, but that's fine for tests
  });

  after(() => {
    if (surfServer) surfServer.close();
    if (classServer) classServer.close();
    closeDatabase(db);
  });

  test('OllaSurf health endpoint returns 200', async () => {
    const app = createSurfApp(config, db, null);
    surfServer = app.listen(0); // random port
    const port = surfServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'OllaSurf');
  });

  test('OllaClass health endpoint returns 200', async () => {
    const app = createClassApp(config, db, null);
    classServer = app.listen(0);
    const port = classServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'OllaClass');
  });

  test('OllaSurf dashboard placeholder returns HTML', async () => {
    const app = createSurfApp(config, db, null);
    const srv = app.listen(0);
    const port = srv.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/dashboard`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));

    srv.close();
  });

  test('proxied request records usage and /api/requests returns events', async () => {
    const ledger = new CapLedger(db);
    const adapter = new MockAdapter([
      { status: 200, body: { model: 'test-model', choices: [{ message: { content: 'hello' } }] }, usage: { tokensIn: 5, tokensOut: 3 }, latencyMs: 10 },
    ]);
    const app = createSurfApp(config, ledger, adapter);
    const srv = app.listen(0);
    const port = srv.address().port;

    // Provider row must exist for usage_events FK before proxy records usage.
    db.prepare('INSERT OR IGNORE INTO providers (id, tier, type, base_url) VALUES (?, \'free\', \'ollama\', ?)').run('ollama-local', 'http://127.0.0.1:9');

    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'ollasurf/trivial', messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(res.status, 200);

    const listRes = await fetch(`http://127.0.0.1:${port}/api/requests`);
    const listBody = await listRes.json();
    assert.ok(Array.isArray(listBody.events));
    assert.ok(listBody.events.length >= 1);

    srv.close();
  });

  test('OllaClass /v1/systemone returns 501 (not yet implemented)', async () => {
    const app = createClassApp(config, db, null);
    const srv = app.listen(0);
    const port = srv.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    });
    assert.equal(res.status, 501);

    srv.close();
  });
});