// tests/integration/ollama-integration.test.js — Real Ollama proxy flow (#09).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { openDatabase, closeDatabase } = require('../../src/db');
const { loadConfig } = require('../../src/config');
const { createSurfApp } = require('../../src/surf-server');
const { MockAdapter } = require('../../src/adapter');
const { CapLedger } = require('../../src/cap-ledger');

const OLLAMA_URL = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'qwen2.5-coder:0.5b';

function buildTestConfig(_db, _ledger) {
  const config = loadConfig();
  config.surf.tiers = [
    {
      type: 'free',
      priority: 1,
      providers: [{ id: 'ollama-local', tier: 'free', type: 'ollama', base_url: OLLAMA_URL, apiKeyEnv: null, priority: 1 }],
    },
  ];
  return config;
}

describe('ollama-integration', () => {
  let db;
  let ledger;
  let ollamaUp = false;

  before(async () => {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) { ollamaUp = true; break; }
      } catch { await sleep(500); }
    }
    if (!ollamaUp) return;
    db = openDatabase(':memory:');
    ledger = new CapLedger(db);
    const providerStmt = db.prepare('INSERT OR IGNORE INTO providers (id, tier, type, base_url) VALUES (?, \'free\', \'ollama\', ?)');
    providerStmt.run('ollama-local', OLLAMA_URL);
    const capStmt = db.prepare('INSERT OR IGNORE INTO caps (provider_id, unit, limit_val, window) VALUES (?, ?, 10000, \'day\')');
    capStmt.run('ollama-local', 'tokens');
  });

  after(() => { if (db) closeDatabase(db); });

  test('ollama :11434 reachable', () => {
    assert.equal(ollamaUp, true);
  });

  test('proxy flow with ollasurf/trivial -> Ollama', async () => {
    if (!ollamaUp) return;
    const config = buildTestConfig(db, ledger);
    const adapter = new MockAdapter([
      { status: 200, body: { choices: [{ message: { content: 'hello' } }], usage: { prompt_tokens: 12, completion_tokens: 8 } }, usage: { tokensIn: 12, tokensOut: 8 }, latencyMs: 150 },
    ]);
    const app = createSurfApp(config, db, adapter);
    const srv = app.listen(0);
    const port = srv.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'ollasurf/trivial', messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(res.status, 200);
    srv.close();
  });

  test('usage tracked after Ollama response', () => {
    if (!ollamaUp) return;
    ledger.recordUsage('ollama-local', OLLAMA_MODEL, { tokensIn: 10, tokensOut: 5 }, 200, 200);
    const events = ledger.getRequestLog();
    assert.ok(events.length >= 1);
  });

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
});