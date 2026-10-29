/*
 * src/adapter.js — Unified adapter exports (backward-compat facade).
 *
 * Re-exports the three adapter classes from their dedicated modules:
 *   ProviderAdapter — abstract base interface
 *   MockAdapter     — deterministic test double
 *   RealAdapter     — production fetch() implementation
 *
 * Consumers (surf-server, class-server, tests) import from here:
 *
 *   const { ProviderAdapter, MockAdapter, RealAdapter } = require('./src/adapter');
 */

const { ProviderAdapter } = require('./adapter-base');
const { MockAdapter } = require('./adapter-mock');
const { RealAdapter } = require('./adapter-real');

module.exports = { ProviderAdapter, MockAdapter, RealAdapter };