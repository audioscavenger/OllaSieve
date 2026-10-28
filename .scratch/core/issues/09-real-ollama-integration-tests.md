# 09: Real Ollama integration tests

**What to build:** End-to-end smoke tests against real local Ollama (port 11434) using available models. Verify the full proxy flow with a real provider: request → model resolution → provider call → usage tracking → response. Also OllaClass integration tests against real tev1 (port 11433, CPU-only). These tests require Ollama running and are slower; they complement the mocked unit tests.

**Blocked by:** 04 (OllaSurf core proxy)

**Status:** ready-for-agent

- [ ] Basic proxy flow: send `ollasurf/trivial` with Ollama provider configured → get response from Ollama model → verify usage tracked
- [ ] Usage tracking: verify tokens_in/tokens_out recorded in ledger after Ollama response
- [ ] OllaClass real tev1: classify sample prompts (trivial, research, implement, hard) → verify category + confidence from real tev1
- [ ] Tests skip gracefully if Ollama is not running (port 11434 unreachable)
- [ ] Tests use a small fast model (e.g., qwen2.5-coder:0.5b) for speed
- [ ] Test script documented in package.json (e.g., `npm run test:integration`)