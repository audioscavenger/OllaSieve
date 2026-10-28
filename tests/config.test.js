// tests/config.test.js - Config loading and validation tests.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { loadConfig, validate, DEFAULT_CONFIG } = require('../src/config');

describe('config', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollasieve-cfg-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('loads default config when no file exists', () => {
    const config = loadConfig(path.join(tmpDir, 'nonexistent.json'));
    assert.equal(config.version, 1);
    assert.equal(config.server.surfPort, 11400);
    assert.equal(config.server.classPort, 11401);
  });

  test('loads config from file', () => {
    const cfgPath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ version: 1, server: { surfPort: 9999, classPort: 9998 } }));
    const config = loadConfig(cfgPath);
    assert.equal(config.server.surfPort, 9999);
    assert.equal(config.server.classPort, 9998);
    // Defaults still applied for missing fields
    assert.equal(config.storage.dbPath, path.resolve(tmpDir, './data/ollasieve.db'));
  });

  test('validates required fields', () => {
    const errors = validate({ version: 2 });
    assert.ok(errors.length > 0);
    assert.ok(errors.some((e) => e.includes('version')));
  });

  test('validates valid config', () => {
    const errors = validate(DEFAULT_CONFIG);
    assert.equal(errors.length, 0);
  });

  test('resolves dbPath relative to config file', () => {
    const cfgPath = path.join(tmpDir, 'sub', 'test.json');
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify({ version: 1 }));
    const config = loadConfig(cfgPath);
    assert.ok(path.isAbsolute(config.storage.dbPath));
    assert.ok(config.storage.dbPath.includes('sub'));
  });

  test('applies env var overrides via OLLASIEVE_CONFIG', () => {
    const cfgPath = path.join(tmpDir, 'env-test.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ version: 1 }));
    process.env.OLLASIEVE_CONFIG = cfgPath;
    const config = loadConfig();
    assert.equal(config.version, 1);
    delete process.env.OLLASIEVE_CONFIG;
  });
});
