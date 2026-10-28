// tests/servers.test.js — Server startup and health endpoint tests.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { loadConfig } = require('../src/config');
const { openDatabase, closeDatabase } = require('../src/db');
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
    const app = createSurfApp(config, db);
    surfServer = app.listen(0); // random port
    const port = surfServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'OllaSurf');
  });

  test('OllaClass health endpoint returns 200', async () => {
    const app = createClassApp(config, db);
    classServer = app.listen(0);
    const port = classServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'OllaClass');
  });

  test('OllaSurf dashboard placeholder returns HTML', async () => {
    const app = createSurfApp(config, db);
    const srv = app.listen(0);
    const port = srv.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/dashboard`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));

    srv.close();
  });

  test('OllaClass /v1/systemone returns 501 (not yet implemented)', async () => {
    const app = createClassApp(config, db);
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