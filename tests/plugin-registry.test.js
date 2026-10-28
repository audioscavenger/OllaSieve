// tests/plugin-registry.test.js - Plugin registry tests.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { PluginRegistry } = require('../src/plugin-registry');

describe('plugin-registry', () => {
  test('loads enabled plugins from config', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollasieve-pr-'));
    // Create a temp plugin
    const pluginDir = path.join(tmpDir, 'plugins', 'testplugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'index.js'),
      `module.exports = { version: '1.2.3', async init(app, config, ledger) { app.locals.testplugin = true; } };`
    );

    // Temporarily override the plugins base path by monkeypatching
    const registry = new PluginRegistry();
    // We'll test with a config that references 'ollasurf' and 'ollaclass' which exist
    const config = { plugins: [{ name: 'ollasurf', enabled: true }, { name: 'ollaclass', enabled: true }] };
    const mockAppFactory = (name) => ({ locals: {}, listen: () => {} });
    const mockLedger = {};

    await registry.load(config, mockAppFactory, mockLedger);

    const list = registry.list();
    assert.equal(list.length, 2);
    assert.ok(list.some((p) => p.name === 'ollasurf' && p.status === 'running'));
    assert.ok(list.some((p) => p.name === 'ollaclass' && p.status === 'running'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('skips disabled plugins', async () => {
    const registry = new PluginRegistry();
    const config = { plugins: [{ name: 'ollasurf', enabled: false }] };
    const mockAppFactory = () => ({ locals: {} });
    await registry.load(config, mockAppFactory, {});
    assert.equal(registry.list().length, 0);
  });

  test('marks missing plugins as not-found', async () => {
    const registry = new PluginRegistry();
    const config = { plugins: [{ name: 'nonexistent-plugin', enabled: true }] };
    const mockAppFactory = () => ({ locals: {} });
    await registry.load(config, mockAppFactory, {});
    const info = registry.get('nonexistent-plugin');
    assert.equal(info.status, 'not-found');
  });

  test('status() returns plugin status map', async () => {
    const registry = new PluginRegistry();
    const config = { plugins: [{ name: 'ollasurf', enabled: true }] };
    const mockAppFactory = () => ({ locals: {} });
    await registry.load(config, mockAppFactory, {});
    const st = registry.status();
    assert.ok(st.ollasurf);
    assert.equal(st.ollasurf.status, 'running');
  });
});
