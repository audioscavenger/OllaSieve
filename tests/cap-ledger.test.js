// tests/cap-ledger.test.js — Cap ledger CRUD and state-transition tests.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { CapLedger } = require('../src/cap-ledger');

describe('cap-ledger', () => {
  let tmpDir;
  let db;
  let ledger;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollasieve-cl-'));
    db = require('../src/db').openDatabase(path.join(tmpDir, 'test.db'));
    ledger = new CapLedger(db);

    // Insert base provider records (required for foreign keys)
    const insertProvider = db.prepare(`INSERT INTO providers (id, tier, type, base_url) VALUES (?, 'free', 'openrouter', 'http://test')`);
    ['p1','p2','p3','p4','p5'].forEach(id => insertProvider.run(id));

    // Insert caps for usage tracking
    const insertCap = db.prepare(`INSERT INTO caps (provider_id, unit, limit_val, window) VALUES (?, ?, 1000, 'day')`);
    ['p1','p2','p3','p4','p5'].forEach(id => insertCap.run(id, 'tokens'));
  });

  after(() => {
    require('../src/db').closeDatabase(db);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  });

  test('checkCaps returns no exceeded with healthy cap', () => {
    ledger.recordUsage('p1', 'model-a', { tokensIn: 10, tokensOut: 5 }, 'ok', 120);
    const result = ledger.checkCaps('p1');
    assert.equal(result.exceeded, false);
  });

  test('checkCaps detects exceeded cap at threshold', () => {
    // threshold default 0.97, set current_usage > limit_val
    ledger.recordUsage('p1', 'model-b', { tokensIn: 1000, tokensOut: 0 }, 'ok', 100);
    // Now set cap directly: limit_val=500 so 1000/500 = 200% > 97%
    const stmt = db.prepare('UPDATE caps SET current_usage = 600, limit_val = 500 WHERE provider_id = ? AND unit = \'tokens\'');
    stmt.run('p1');
    const result = ledger.checkCaps('p1');
    assert.equal(result.exceeded, true);
    assert.equal(result.cap.unit, 'tokens');
    assert.ok(result.reason.includes('97%') || result.reason.includes('600/500'));
  });

  test('setState and getState', () => {
    ledger.setState('p1', 'exhausted', null);
    const state = ledger.getState('p1');
    assert.equal(state.status, 'exhausted');
    assert.equal(state.consecutive_failures, 0);

    ledger.setState('p1', 'healthy', null);
    const state2 = ledger.getState('p1');
    assert.equal(state2.status, 'healthy');
  });

  test('recordFailure transitions to cooldown after 3 failures', () => {
    // Reset state first
    ledger.setState('p2', 'healthy', null);

    ledger.recordFailure('p2', new Error('fail 1'));
    let state = ledger.getState('p2');
    assert.equal(state.consecutive_failures, 1);

    ledger.recordFailure('p2', new Error('fail 2'));
    state = ledger.getState('p2');
    assert.equal(state.consecutive_failures, 2);

    ledger.recordFailure('p2', new Error('fail 3'));
    state = ledger.getState('p2');
    assert.equal(state.consecutive_failures, 3);
    assert.equal(state.status, 'cooldown');
    assert.ok(state.cooldown_until);
  });

  test('resetExpiredCaps resets current_usage', () => {
    // Cap that should be expired
    const stmt = db.prepare(`
      UPDATE caps SET current_usage = 500, reset_at = datetime('now', '-1 day') WHERE provider_id = ?
    `);
    stmt.run('p3');

    ledger.resetExpiredCaps('p3');
    const cap = db.prepare('SELECT current_usage FROM caps WHERE provider_id = ?').get('p3');
    assert.equal(cap.current_usage, 0);
  });

  test('mostRestrictiveCap returns the highest percentage', () => {
    // Set up two caps: one at 80%, one at 30%
    ledger.recordUsage('p4', null, { tokensIn: 400, tokensOut: 0 }, 'ok', 50);
    // Set cap limit to 500 so first 400/500 = 80%
    const stmt2 = db.prepare('UPDATE caps SET limit_val = 500 WHERE provider_id = ? AND unit = \'tokens\'');
    stmt2.run('p4');

    const mostRestrictive = ledger.getMostRestrictiveCap('p4');
    assert.ok(mostRestrictive);
    assert.equal(mostRestrictive.unit, 'tokens');
    assert.ok(mostRestrictive.pct >= 80);
  });

  test('daily_summary upsert', () => {
    ledger.recordUsage('p5', 'm1', { tokensIn: 25, tokensOut: 10, costUsd: 0.05 }, 'ok', 300);
    // Record again - should add to daily_summary
    ledger.recordUsage('p5', 'm2', { tokensIn: 15, tokensOut: 5, costUsd: 0.02 }, 'ok', 120);

    const summary = db.prepare('SELECT * FROM daily_summary WHERE provider_id = ?').get('p5');
    assert.equal(summary.requests, 2);
    assert.equal(summary.tokens_in, 40); // 25 + 15
    assert.equal(summary.tokens_out, 15); // 10 + 5
    assert.ok(summary.cost_usd >= 0.07); // 0.05 + 0.02
  });
});