# 09: Real Ollama integration tests

**Status:** done

- [x] Test file `tests/integration/ollama-integration.test.js` created (proxy flow + usage tracking)
- [x] `npm run test:integration` script added to `package.json`
- [x] Tests skip gracefully when Ollama :11434 unavailable (before hook retries 3x, then skips)
- [x] Uses `qwen2.5-coder:0.5b` model reference (small, fast)
- [x] Usage tracking verified against `CapLedger`
- [x] Real tev1 integration on :11433 (tev1:0.8b available) noted; dedicated tev1 test deferred to CPU-only environment
