// tools/validate-opencode-config.js - validates opencode.jsonc + openchamber-providers.json
const fs = require('fs');
const path = require('path');

const ERRORS = [];
let passed = 0;

function assert(condition, msg) {
  if (!condition) { ERRORS.push(msg); } else { passed++; }
}

const repoRoot = path.resolve(__dirname, '..');

// opencode.jsonc
const opencodePath = path.join(repoRoot, 'opencode.jsonc');
const opencodeRaw = fs.existsSync(opencodePath) ? fs.readFileSync(opencodePath, 'utf8') : '';
assert(opencodeRaw.includes('ollasurf'), 'opencode.jsonc: defines ollasurf provider');
assert(opencodeRaw.includes('http://127.0.0.1:11400/v1'), 'opencode.jsonc: baseURL points at OllaSurf');
assert(opencodeRaw.includes('ollasurf/auto'), 'opencode.jsonc: model ollasurf/auto');
assert(opencodeRaw.includes('ollasurf/trivial'), 'opencode.jsonc: model ollasurf/trivial');
assert(opencodeRaw.includes('ollasurf/research'), 'opencode.jsonc: model ollasurf/research');
assert(opencodeRaw.includes('ollasurf/implement'), 'opencode.jsonc: model ollasurf/implement');
assert(opencodeRaw.includes('ollasurf/hard'), 'opencode.jsonc: model ollasurf/hard');

// openchamber-providers.json
const ocPath = path.join(repoRoot, 'openchamber-providers.json');
if (fs.existsSync(ocPath)) {
  const oc = JSON.parse(fs.readFileSync(ocPath, 'utf8'));
  assert(oc.providers && oc.providers.length === 1, 'openchamber-providers.json: exactly one provider');
  assert(oc.providers[0].id === 'ollasurf', 'openchamber-providers.json: only OllaSurf');
  assert(oc.defaultProvider === 'ollasurf', 'openchamber-providers.json: default is ollasurf');
}

// classifier-endpoint.json
const cePath = path.join(repoRoot, 'classifier-endpoint.json');
if (fs.existsSync(cePath)) {
  const ce = JSON.parse(fs.readFileSync(cePath, 'utf8'));
  assert(ce.endpoint === 'http://127.0.0.1:11401/v1/systemone', 'classifier-endpoint.json: points at OllaClass');
  assert(ce.enabled === true, 'classifier-endpoint.json: enabled');
}

console.log(`Validation: ${passed} passed, ${ERRORS.length} failed`);
ERRORS.forEach((e) => console.error('  -', e));
process.exit(ERRORS.length ? 1 : 0);
