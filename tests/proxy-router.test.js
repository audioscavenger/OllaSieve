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
const { createLogger } = require('../src/logger');

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

  test('executeWithSwitching emits provider_attempt and request_summary through the injected sink', async () => {
    const events = [];
    const logger = createLogger('OllaSurf', { sink: (event) => { events.push(event); return true; } });
    const tier = {
      type: 'free',
      priority: 1,
      providers: [{ id: 'p1', tier: 'free', type: 'ollama', base_url: 'http://127.0.0.1:9', apiKeyEnv: null, priority: 1 }],
    };
    const adapter = new MockAdapter([
      { status: 200, body: { model: 'test-model', choices: [{ message: { content: 'hello' } }] }, usage: { tokensIn: 5, tokensOut: 3 }, latencyMs: 12 },
    ]);

    const result = await executeWithSwitching(tier, { model: 'test-model' }, {
      ledger,
      adapter,
      switchConfig: { predictiveThreshold: 0.97, reactiveCooldownMs: 3000 },
      logger,
      requestId: 'req-trace-1',
    });

    assert.equal(result.success, true);

    const attempts = events.filter((e) => e.type === 'provider_attempt');
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].outcome, 'success');
    assert.equal(attempts[0].requestId, 'req-trace-1');

    const summaries = events.filter((e) => e.type === 'request_summary');
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].type, 'request_summary');
    assert.equal(summaries[0].status, 200);
    assert.equal(summaries[0].requestId, 'req-trace-1');
    assert.equal(summaries[0].attempts, 1);
  });

  test('executeWithSwitching emits failover attempts through the injected sink', async () => {
    const events = [];
    const logger = createLogger('OllaSurf', { sink: (event) => { events.push(event); return true; } });
    const tier = {
      type: 'free',
      priority: 1,
      providers: [
        { id: 'p1', tier: 'free', type: 'ollama', base_url: 'http://127.0.0.1:9', apiKeyEnv: null, priority: 1 },
        { id: 'p2', tier: 'free', type: 'ollama', base_url: 'http://127.0.0.1:9', apiKeyEnv: null, priority: 2 },
      ],
    };
    const adapter = new MockAdapter([
      { status: 429, body: { error: { message: 'rate limited' } }, usage: null, latencyMs: 5 },
      { status: 200, body: { model: 'test-model', choices: [{ message: { content: 'hello' } }] }, usage: { tokensIn: 5, tokensOut: 3 }, latencyMs: 8 },
    ]);

    const result = await executeWithSwitching(tier, { model: 'test-model' }, {
      ledger,
      adapter,
      switchConfig: { predictiveThreshold: 0.97, reactiveCooldownMs: 3000 },
      logger,
      requestId: 'req-trace-2',
    });

    assert.equal(result.success, true);
    const attempts = events.filter((e) => e.type === 'provider_attempt');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].outcome, 'error');
    assert.equal(attempts[1].outcome, 'success');

    const summaries = events.filter((e) => e.type === 'request_summary');
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].status, 200);
    assert.equal(summaries[0].attempts, 2);
    assert.equal(summaries[0].provider, 'p2');
  });

  test('executeWithSwitching emits a failed request_summary when all providers fail', async () => {
    const events = [];
    const logger = createLogger('OllaSurf', { sink: (event) => { events.push(event); return true; } });
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
      logger,
      requestId: 'req-trace-3',
    });

    assert.equal(result.success, false);
    const attempts = events.filter((e) => e.type === 'provider_attempt');
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].outcome, 'error');

    const summaries = events.filter((e) => e.type === 'request_summary');
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].status, 503);
    assert.equal(summaries[0].attempts, 1);
  });
});
