// tests/adapter.test.js — Provider adapter tests.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { ProviderAdapter, MockAdapter, RealAdapter } = require('../src/adapter');

describe('adapter', () => {
  describe('ProviderAdapter (base interface)', () => {
    test('base class throws on call', async () => {
      const adapter = new ProviderAdapter();
      await assert.rejects(() => adapter.call({}), { message: /Not implemented/ });
    });
  });

  describe('MockAdapter', () => {
    test('returns configured canned response on first call', async () => {
      const adapter = new MockAdapter([
        { status: 200, body: { choices: [{ message: { content: 'hi' } }] }, usage: { tokensIn: 5, tokensOut: 10 }, latencyMs: 42 },
      ]);
      const res = await adapter.call({ url: 'http://example.com' });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { choices: [{ message: { content: 'hi' } }] });
      assert.deepEqual(res.usage, { tokensIn: 5, tokensOut: 10 });
      assert.equal(res.latencyMs, 42);
    });

    test('returns successive responses for successive calls', async () => {
      const adapter = new MockAdapter([
        { status: 200, body: { choices: [{ message: { content: 'first' } }] }, usage: null, latencyMs: 0 },
        { status: 200, body: { choices: [{ message: { content: 'second' } }] }, usage: { tokensIn: 1, tokensOut: 2 }, latencyMs: 10 },
      ]);
      const r1 = await adapter.call({ url: 'http://example.com' });
      const r2 = await adapter.call({ url: 'http://example.com' });
      assert.equal(r1.body.choices[0].message.content, 'first');
      assert.equal(r2.body.choices[0].message.content, 'second');
      assert.equal(adapter.callCount, 2);
    });

    test('falls back to default when no responses configured', async () => {
      const adapter = new MockAdapter([]);
      const res = await adapter.call({ url: 'http://example.com' });
      assert.equal(res.status, 200);
      assert.equal(adapter.callCount, 1);
    });

    test('simulates error status codes', async () => {
      const adapter = new MockAdapter([
        { status: 429, body: { error: { message: 'rate limited' } }, usage: null, latencyMs: 50 },
      ]);
      const res = await adapter.call({ url: 'http://example.com' });
      assert.equal(res.status, 429);
    });
  });

  describe('RealAdapter.parseUsage (OpenAI-compat)', () => {
    let adapter;
    beforeEach(() => { adapter = new RealAdapter(); });

    test('parses OpenAI-compat usage shape', () => {
      const body = {
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      };
      const usage = adapter.parseUsage(body, {});
      assert.equal(usage.tokensIn, 12);
      assert.equal(usage.tokensOut, 8);
      assert.equal(usage.costUsd, null);
    });

    test('parses Ollama native usage shape', () => {
      const body = {
        model: 'qwen2.5',
        response: 'hello',
        prompt_eval_count: 15,
        eval_count: 6,
      };
      const usage = adapter.parseUsage(body, {});
      assert.equal(usage.tokensIn, 15);
      assert.equal(usage.tokensOut, 6);
      assert.equal(usage.costUsd, null);
    });

    test('returns null for body without usage data', () => {
      const usage = adapter.parseUsage({ text: 'no usage here' }, {});
      assert.equal(usage, null);
    });

    test('prefers OpenAI shape when both present', () => {
      const body = {
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        prompt_eval_count: 20,
        eval_count: 7,
      };
      const usage = adapter.parseUsage(body, {});
      assert.equal(usage.tokensIn, 10);
      assert.equal(usage.tokensOut, 5);
    });
  });

  describe('RealAdapter stats', () => {
    test('tracks call count and errors', () => {
      const adapter = new RealAdapter();
      assert.equal(adapter.stats.calls, 0);
      assert.equal(adapter.stats.errors, 0);
    });
  });
});