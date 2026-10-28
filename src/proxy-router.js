// src/proxy-router.js - OllaSurf proxy routing logic.
//
// Resolves virtual models to tiers, finds the first available provider
// (with automated switching), and executes the proxy call via the adapter.

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

// Execute provider call with automated switching across providers in tier
async function executeWithSwitching(tier, body, deps) {
  const { ledger, adapter, switchConfig } = deps;
  const providers = tier && tier.providers ? tier.providers : [];
  if (providers.length === 0) {
    return { success: false, status: 503, error: { error: 'No available providers', providersExhausted: true } };
  }

  let lastError;
  let switchedFrom = null;

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

    const response = await adapter.call(request);

    if (response.usage) {
      ledger.recordUsage(provider.id, response.body.model, response.usage, response.status, response.latencyMs, switchedFrom);
    }

    if (response.status === 200 || response.status === 201) {
      const capsCheck = ledger.checkCaps(provider.id, switchConfig.predictiveThreshold);
      if (capsCheck.exceeded) {
        ledger.setState(provider.id, 'exhausted', new Date(Date.now() + switchConfig.reactiveCooldownMs).toISOString());
      }
    }

    return { success: true, status: response.status, body: response.body };
  }

  return { success: false, status: 503, error: { error: 'All providers exhausted', lastError: lastError ? lastError.message : null } };
}

module.exports = { resolveTier, findFirstAvailableProvider, executeWithSwitching, VIRTUAL_MODELS: ['auto', 'trivial', 'research', 'implement', 'hard'] };
