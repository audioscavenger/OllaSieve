// tests/db.test.js - SQLite setup tests.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { openDatabase, closeDatabase } = require('../src/db');

describe('db', () => {
  let tmpDir;
  let db;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollasieve-db-'));
    db = openDatabase(path.join(tmpDir, 'test.db'));
  });

  after(() => {
    closeDatabase(db);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('enables WAL mode', () => {
    const mode = db.pragma('journal_mode', { simple: true });
    assert.equal(mode, 'wal');
  });

  test('creates all schema tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map((r) => r.name);
    assert.ok(tables.includes('providers'));
    assert.ok(tables.includes('caps'));
    assert.ok(tables.includes('usage_events'));
    assert.ok(tables.includes('provider_state'));
    assert.ok(tables.includes('daily_summary'));
  });

  test('creates parent directory if missing', () => {
    const nested = path.join(tmpDir, 'nested', 'deep', 'test.db');
    const db2 = openDatabase(nested);
    assert.ok(fs.existsSync(nested));
    closeDatabase(db2);
  });

  test('foreign keys are enabled', () => {
    const fk = db.pragma('foreign_keys', { simple: true });
    assert.equal(fk, 1);
  });
});
