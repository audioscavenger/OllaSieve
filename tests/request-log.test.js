// tests/request-log.test.js - Access event emission through the debug logger tests.
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');

const { createRequestLogger } = require('../src/request-log');

describe('request-log', () => {
  let events;
  let sink;

  before(() => {
    events = [];
    sink = (event) => { events.push(event); return true; };
  });

  test('access middleware emits a debug access event when debug is enabled', () => {
    const middleware = createRequestLogger('OllaSurf', { debug: true, sink });
    const req = { method: 'GET', originalUrl: '/health' };
    const res = new EventEmitter();
    res.statusCode = 200;

    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    res.emit('finish');

    assert.equal(nextCalled, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'access');
    assert.equal(events[0].level, 'debug');
    assert.equal(events[0].status, 200);
    assert.equal(events[0].method, 'GET');
    assert.equal(events[0].url, '/health');
    assert.ok(typeof events[0].latencyMs === 'number');
  });

  test('access middleware maps 4xx responses to warn level events', () => {
    events = [];
    const middleware = createRequestLogger('OllaSurf', { debug: true, sink });
    const req = { method: 'POST', originalUrl: '/v1/chat/completions' };
    const res = new EventEmitter();
    res.statusCode = 404;

    middleware(req, res, () => {});
    res.emit('finish');

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'access');
    assert.equal(events[0].level, 'warn');
    assert.equal(events[0].status, 404);
  });

  test('access middleware emits nothing when debug is disabled', () => {
    events = [];
    const middleware = createRequestLogger('OllaSurf', { debug: false, sink });
    const req = { method: 'GET', originalUrl: '/health' };
    const res = new EventEmitter();
    res.statusCode = 200;

    middleware(req, res, () => {});
    res.emit('finish');

    assert.equal(events.length, 0);
  });
});
