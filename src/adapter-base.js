// src/adapter-base.js — Provider client adapter base class.
// Interface: call(request) → { status, body, usage, latencyMs }

class ProviderAdapter {
  async call(request) {
    throw new Error('Not implemented: extend ProviderAdapter');
  }
}

module.exports = { ProviderAdapter };
