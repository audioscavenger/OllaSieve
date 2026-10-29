// tests/proxy-router.test.js - executeWithSwitching success, failover, and lastError tests.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { openDatabase, closeDatabase } = require('../src/db');
const { CapLedger } = require('../src/cap-ledger');
const { executeWithSwitching } = require('../src/proxy-router');
const { MockAdapter } = require('../src/adapter');

describe('proxy-router', () => {
  let db;
  let ledger;
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollasieve-pr-'));
    db = openDatabase(path.join(tmpDir, 'test.db'));
    ledger = new CapLedger(db);
    const insertProvider = db.prepare('INSERT INTO providers (id, tier, type, base_url) VALUES (?, \'free\', \'ollama\', \'http://127.0.0.1:9\')');
    ['p1', 'p2'].forEach((id) => insertProvider.run(id));
  });

  after(() => {
    closeDatabase(db);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  });

  test('executeWithSwitching returns success with the provider response', async () => {
    const tier = {
      type: 'free',
      priority: 1,
      providers: [{ id: 'p1', tier: 'free', type: 'ollama', base_url: 'http://127.0.0.1:9', apiKeyEnv: null, priority: 1 }],
    };
    const adapter = new MockAdapter([
      {
        status: 200,
        body: { model: 'test-model', choices: [{ message: { content: 'hello' } }] },
        usage: { tokensIn: 5, tokensOut: 3 },
        latencyMs: 12,
      },
    ]);

    const result = await executeWithSwitching(tier, { model: 'test-model' }, {
      ledger,
      adapter,
      switchConfig: { predictiveThreshold: 0.97, reactiveCooldownMs: 3000 },
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 200);
    assert.equal(result.body.choices[0].message.content, 'hello');
  });

  test('executeWithSwitching fails over to next provider and returns its response', async () => {
    const tier = {
      type: 'free',
      priority: 1,
      providers: [
        { id: 'p1', tier: 'free', type: 'ollama', base_url: 'http://127.0.0.1:9', apiKeyEnv: null, priority: 1 },
        { id: 'p2', tier: 'free', type: 'ollama', base_url: 'http://127.0.0.1:9', apiKeyEnv: null, priority: 2 },
      ],
    };
    // First provider answers 429 -> failover to second provider -> success.
    const adapter = new MockAdapter([
      { status: 429, body: { error: { message: 'rate limited' } }, usage: null, latencyMs: 5 },
      { status: 200, body: { model: 'test-model', choices: [{ message: { content: 'hello' } }] }, usage: { tokensIn: 5, tokensOut: 3 }, latencyMs: 8 },
    ]);

    const result = await executeWithSwitching(tier, { model: 'test-model' }, {
      ledger,
      adapter,
      switchConfig: { predictiveThreshold: 0.97, reactiveCooldownMs: 3000 },
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 200);
    assert.equal(result.body.choices[0].message.content, 'hello');
  });

  test('executeWithSwitching returns failure with lastError when all providers fail', async () => {
    const tier = {
      type: 'free',
      priority: 1,
      providers: [{ id: 'p1', tier: 'free', type: 'ollama', base_url: 'http://127.0.0.1:9', apiKeyEnv: null, priority: 1 }],
    };
    const adapter = new MockAdapter([
      { status: 503, body: { error: { message: 'upstream unavailable' } }, usage: null, latencyMs: 5 },
    ]);

    const result = await executeWithSwitching(tier, { model: 'test-model' }, {
      ledger,
      adapter,
      switchConfig: { predictiveThreshold: 0.97, reactiveCooldownMs: 3000 },
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 503);
    assert.ok(result.error.lastError);
  });
});
