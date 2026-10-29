// src/proxy-router.js - OllaSurf proxy routing logic.
//
// Resolves virtual models to tiers, finds the first available provider
// (with automated switching), and executes the proxy call via the adapter.
//
// Key functions:
//   - resolveTier(model, config): map virtual model string -> tier object
//   - findFirstAvailableProvider(tier, ledger, excludeProviderId): pick healthy provider
//   - executeWithSwitching(tier, body, deps): loop providers with fallback logic
//
// Switching policy:
//   - Predictive: after successful response, check caps at 97% threshold
//   - Reactive:   on success, check caps; on 429/error, mark exhausted / cooldown
//   - Tier fallback: iterate providers within a tier, skipping unhealthy ones

/**
 * Maps a virtual model name (e.g. 'ollasurf/trivial') to a tier config.
 *
 * @param {string} model - Virtual model name (e.g. 'ollasurf/auto').
 * @param {object} config - App config (surf.tiers array).
 * @returns {object|null} Tier object, or null if unmapped and no tiers configured.
 */
function resolveTier(model, config) {
  const tiers = config.surf.tiers || [];
  const tierMapping = {
    'ollasurf/auto': tiers.find((t) => t.type === 'implement') || tiers[0],
    'ollasurf/trivial': tiers.find((t) => t.type === 'trivial') || tiers.find((t) => t.priority === 1),
    'ollasurf/research': tiers.find((t) => t.type === 'research') || tiers.find((t) => t.priority === 2),
    'ollasurf/implement': tiers.find((t) => t.type === 'implement') || tiers.find((t) => t.priority === 3),
    'ollasurf/hard': tiers.find((t) => t.type === 'hard') || tiers.find((t) => t.priority === 4),
  };
  const tier = tierMapping[model];
  if (tier) return tier;
  // Fallback: default tier list lookup for unmapped models
  if (tiers[0]) return tiers[0];
  // No tiers configured: return minimal default tier for testing
  return { providers: [] };
}

/**
 * Finds the first available provider in a tier that is not in cooldown/exhausted
 * and does not exceed its caps (per-checkCaps at predictive threshold).
 *
 * @param {object} tier - Tier with providers array.
 * @param {CapLedger} ledger - Ledger with getState + checkCaps.
 * @param {string|null} excludeProviderId - Provider ID to exclude (for failover).
 * @returns {object|null} First available provider, or null if all blocked.
 */
function findFirstAvailableProvider(tier, ledger, excludeProviderId) {
  const providers = tier && tier.providers ? tier.providers : [];
  for (const provider of providers) {
    if (excludeProviderId && provider.id === excludeProviderId) continue;
    const state = ledger.getState(provider.id);
    if (state.status === 'exhausted' || state.status === 'cooldown') continue;
    const capsCheck = ledger.checkCaps(provider.id);
    if (capsCheck.exceeded) continue;
    return provider;
  }
  return null;
}

/**
 * Executes a provider call with automated switching.
 * Iterates providers in the tier in priority order; skips unavailable
 * ones; records usage; marks exhausted at predictive threshold.
 *
 * @param {object} tier - Tier containing providers to try.
 * @param {object} body - Chat completion request body.
 * @param {object} deps - Dependency map: { ledger, adapter, switchConfig }.
 * @param {object} deps.switchConfig - { predictiveThreshold, reactiveCooldownMs }.
 * @returns {Promise<{success: boolean, status: number, body?: object, error?: object}>}
 */
async function executeWithSwitching(tier, body, deps) {
  const { ledger, adapter, switchConfig } = deps;
  const providers = tier && tier.providers ? tier.providers : [];
  if (providers.length === 0) {
    return { success: false, status: 503, error: { error: 'No available providers', providersExhausted: true } };
  }

  let lastError = null;
  let switchedFrom = null;

  const predictiveThreshold = switchConfig?.predictiveThreshold ?? 0.97;
  const reactiveCooldownMs = switchConfig?.reactiveCooldownMs ?? 3000;

  for (let attempt = 0; attempt < providers.length; attempt++) {
    const provider = findFirstAvailableProvider(tier, ledger, switchedFrom);
    if (!provider) break;

    const request = {
      method: 'POST',
      url: provider.base_url + '/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKeyEnv ? process.env[provider.apiKeyEnv] || '' : ''}`,
      },
      body,
    };

    let response;
    try {
      response = await adapter.call(request);
    } catch (err) {
      // Provider call failed: record failure state and move to next provider.
      lastError = err;
      ledger.recordFailure(provider.id, err);
      switchedFrom = provider.id;
      continue;
    }

    // Provider answered with a non-success status (e.g. 429): treat as failure
    // and fail over to the next provider in the tier.
    if (!(response.status === 200 || response.status === 201)) {
      lastError = new Error(`Provider ${provider.id} returned status ${response.status}`);
      ledger.recordFailure(provider.id, lastError);
      switchedFrom = provider.id;
      continue;
    }

    // Record usage against provider caps + daily summary
    if (response.usage) {
      ledger.recordUsage(provider.id, response.body.model, response.usage, response.status, response.latencyMs, switchedFrom);
    }

    // Predictive switch: mark provider exhausted when cap exceeded
    const capsCheck = ledger.checkCaps(provider.id, predictiveThreshold);
    if (capsCheck.exceeded) {
      ledger.setState(provider.id, 'exhausted', new Date(Date.now() + reactiveCooldownMs).toISOString());
    }

    return { success: true, status: response.status, body: response.body };
  }

  return { success: false, status: 503, error: { error: 'All providers exhausted', lastError: lastError ? lastError.message : null } };
}

module.exports = { resolveTier, findFirstAvailableProvider, executeWithSwitching, VIRTUAL_MODELS: ['auto', 'trivial', 'research', 'implement', 'hard'] };