// tests/logger.test.js - JSONL decision-trace logger sink, event, and rotation tests.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { createLogger, createEvent, createDefaultFileSink, resolveLogPath, rotateLogFile, MAX_LOG_BYTES, KEEP_LOG_FILES } = require('../src/logger');

describe('logger', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollasieve-log-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('createLogger emits events through the injected sink', () => {
    const events = [];
    const sink = (event) => { events.push(event); return true; };
    const logger = createLogger('OllaSurf', { sink });

    const handled = logger.log('provider_attempt', 'provider p1 attempt success', { requestId: 'r1', providerId: 'p1', outcome: 'success' });

    assert.equal(handled, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'provider_attempt');
    assert.equal(events[0].level, 'info');
    assert.equal(events[0].service, 'OllaSurf');
    assert.equal(events[0].message, 'provider p1 attempt success');
    assert.equal(events[0].requestId, 'r1');
    assert.equal(events[0].providerId, 'p1');
  });

  test('createLogger warn and error emit typed events through the injected sink', () => {
    const events = [];
    const sink = (event) => { events.push(event); return true; };
    const logger = createLogger('OllaClass', { sink });

    logger.warn('provider_attempt', 'provider p2 attempt failed', { providerId: 'p2', outcome: 'error' });
    logger.error('request_summary', 'proxy request failed', { requestId: 'r2', status: 503 });

    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'provider_attempt');
    assert.equal(events[0].level, 'warn');
    assert.equal(events[1].type, 'request_summary');
    assert.equal(events[1].level, 'error');
  });

  test('default file sink writes one JSON line per event and returns handled', () => {
    const logPath = path.join(tmpDir, 'ollasieve.log.jsonl');
    const sink = createDefaultFileSink(logPath);
    const handled = sink(createEvent('info', 'request_summary', 'proxy request completed', { requestId: 'r1', status: 200 }, 'OllaSurf'));

    assert.equal(handled, true);
    const parsed = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    assert.equal(parsed.type, 'request_summary');
    assert.equal(parsed.level, 'info');
    assert.equal(parsed.status, 200);

    sink(createEvent('info', 'provider_attempt', 'provider p1 attempt success', { outcome: 'success' }, 'OllaSurf'));
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
  });

  test('default file sink degrades to console output and returns not-handled on write failure', () => {
    const blockedDir = path.join(tmpDir, 'blocker');
    fs.writeFileSync(blockedDir, 'not a directory');
    const badSink = createDefaultFileSink(path.join(blockedDir, 'ollasieve.log.jsonl'));
    const handled = badSink(createEvent('info', 'request_summary', 'proxy request completed', { status: 200 }, 'OllaSurf'));

    assert.equal(handled, false);
  });

  test('default log path resolves beside the sqlite ledger directory', () => {
    assert.equal(resolveLogPath(), path.join('./data', 'ollasieve.log.jsonl'));
    assert.equal(resolveLogPath('/tmp/ollasieve-data'), path.join('/tmp/ollasieve-data', 'ollasieve.log.jsonl'));
  });

  test('log rotation renames current file to backup slot', () => {
    const logPath = path.join(tmpDir, 'ollasieve.log.jsonl');
    fs.writeFileSync(logPath, 'old line\n');
    rotateLogFile(logPath);
    assert.ok(fs.existsSync(path.join(tmpDir, 'ollasieve.log.jsonl.1')));
    assert.equal(fs.existsSync(logPath), false);
  });

  test('logger constants match the locked rotation policy', () => {
    assert.equal(MAX_LOG_BYTES, 10 * 1024 * 1024);
    assert.equal(KEEP_LOG_FILES, 5);
  });
});
