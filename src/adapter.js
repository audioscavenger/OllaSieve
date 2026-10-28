// src/adapter.js — Unified adapter exports (backward-compat, < 100 lines).
const { ProviderAdapter } = require('./adapter-base');
const { MockAdapter } = require('./adapter-mock');
const { RealAdapter } = require('./adapter-real');
module.exports = { ProviderAdapter, MockAdapter, RealAdapter };
