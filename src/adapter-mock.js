// src/adapter-mock.js — Mock adapter for testing.
// Returns canned responses with configurable usage, status codes, delays.

const { ProviderAdapter } = require('./adapter-base');

class MockAdapter extends ProviderAdapter {
  constructor(responses = []) {
    super();
    this.responses = responses;
    this.callCount = 0;
  }

  async call(request) {
    this.callCount++;
    const response = this.responses[this.callCount - 1] || this.responses[0] || {
      status: 200,
      body: { choices: [{ message: { content: '' } }], usage: null },
      usage: null,
      latencyMs: 0,
    };

    return {
      status: response.status,
      body: response.body,
      usage: response.usage,
      latencyMs: response.latencyMs,
    };
  }
}

module.exports = { MockAdapter };