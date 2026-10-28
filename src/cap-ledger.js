// src/cap-ledger.js - Cap tracking and provider state management.
//
// Provides CRUD operations on the SQLite tables for cap tracking:
// providers, caps, usage_events, provider_state, daily_summary.

const { openDatabase } = require('./db');

class CapLedger {
  constructor(db) {
    this.db = db;
  }

  // Insert a usage event, update caps.current_usage, update daily_summary
  recordUsage(providerId, model, usage, status, latencyMs, switchedFrom = null) {
    const tx = this.db.transaction(() => {
      // 1. Insert usage event
      const insertEvent = this.db.prepare(`
        INSERT INTO usage_events (provider_id, model, tokens_in, tokens_out, cost_usd, status, latency_ms, switched_from)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertEvent.run(providerId, model, usage?.tokensIn ?? 0, usage?.tokensOut ?? 0, usage?.costUsd ?? 0, status, latencyMs, switchedFrom);

      // 2. Update caps.current_usage for this provider
      if (usage) {
        const updateCaps = this.db.prepare(`
          UPDATE caps SET current_usage = current_usage + ?, updated_at = datetime('now')
          WHERE provider_id = ? AND unit = 'tokens'
        `);
        const totalTokens = (usage.tokensIn ?? 0) + (usage.tokensOut ?? 0);
        updateCaps.run(totalTokens, providerId);

        // Also update if there's a requests cap
        const updateRequestCaps = this.db.prepare(`
          UPDATE caps SET current_usage = current_usage + 1, updated_at = datetime('now')
          WHERE provider_id = ? AND unit = 'requests'
        `);
        updateRequestCaps.run(providerId);

        // Cost cap
        if (usage.costUsd !== null && usage.costUsd !== undefined) {
          const updateCostCaps = this.db.prepare(`
            UPDATE caps SET current_usage = current_usage + ?, updated_at = datetime('now')
            WHERE provider_id = ? AND unit = 'dollars'
          `);
          updateCostCaps.run(usage.costUsd, providerId);
        }
      }

      // 3. Update daily_summary
      const today = new Date().toISOString().split('T')[0];
      const upsertSummary = this.db.prepare(`
        INSERT INTO daily_summary (provider_id, date, requests, tokens_in, tokens_out, cost_usd)
        VALUES (?, ?, 1, ?, ?, ?)
        ON CONFLICT(provider_id, date) DO UPDATE SET
          requests = requests + 1,
          tokens_in = tokens_in + ?,
          tokens_out = tokens_out + ?,
          cost_usd = cost_usd + ?
      `);
      upsertSummary.run(providerId, today, usage?.tokensIn ?? 0, usage?.tokensOut ?? 0, usage?.costUsd ?? 0,
        usage?.tokensIn ?? 0, usage?.tokensOut ?? 0, usage?.costUsd ?? 0);
    });

    tx();
  }

  // Check if any cap for a provider is exceeded (>= threshold, e.g., 0.97)
  // Returns { exceeded: boolean, cap?: { id, unit, limit, current, window }, reason?: string }
  checkCaps(providerId, threshold = 0.97) {
    const caps = this.db.prepare(`
      SELECT id, unit, limit_val, current_usage, window, reset_at
      FROM caps WHERE provider_id = ?
    `).all(providerId);

    for (const cap of caps) {
      const pct = cap.current_usage / cap.limit_val;
      if (pct >= threshold) {
        return {
          exceeded: true,
          cap: { ...cap, pct: Math.round(pct * 100) },
          reason: `Cap ${cap.unit} at ${Math.round(pct * 100)}% (${cap.current_usage}/${cap.limit_val})`,
        };
      }
    }

    return { exceeded: false };
  }

  // Get provider state
  getState(providerId) {
    const row = this.db.prepare(`
      SELECT provider_id, status, cooldown_until, consecutive_failures, last_error
      FROM provider_state WHERE provider_id = ?
    `).get(providerId);

    return row || { provider_id: providerId, status: 'healthy', cooldown_until: null, consecutive_failures: 0, last_error: null };
  }

  // Update provider state
  setState(providerId, status, cooldownUntil = null) {
    const stmt = this.db.prepare(`
      INSERT INTO provider_state (provider_id, status, cooldown_until, consecutive_failures)
      VALUES (?, ?, ?, 0)
      ON CONFLICT(provider_id) DO UPDATE SET
        status = excluded.status,
        cooldown_until = excluded.cooldown_until,
        consecutive_failures = CASE WHEN excluded.status = 'healthy' THEN 0 ELSE consecutive_failures END
    `);
    stmt.run(providerId, status, cooldownUntil);
  }

  // Record failure and potentially transition to exhausted
  recordFailure(providerId, error) {
    const state = this.getState(providerId);
    const newFailures = state.consecutive_failures + 1;

    const stmt = this.db.prepare(`
      UPDATE provider_state SET consecutive_failures = ?, last_error = ?
      WHERE provider_id = ?
    `);
    stmt.run(newFailures, error?.message ?? String(error), providerId);

    // After 3 consecutive failures, mark as cooldown
    if (newFailures >= 3) {
      const cooldownUntil = new Date(Date.now() + 60000).toISOString(); // 1 min cooldown
      this.setState(providerId, 'cooldown', cooldownUntil);
    }
  }

  // Reset caps for expired windows (called periodically or on demand)
  resetExpiredCaps(providerId = null) {
    const now = new Date().toISOString();
    let query = `
      UPDATE caps SET current_usage = 0, reset_at = datetime('now'), updated_at = datetime('now')
      WHERE reset_at IS NOT NULL AND reset_at <= ?
    `;
    const params = [now];
    if (providerId) {
      query += ' AND provider_id = ?';
      params.push(providerId);
    }
    const stmt = this.db.prepare(query);
    return stmt.run(...params);
  }

  // Reset a specific cap (for testing or manual intervention)
  resetCap(capId) {
    const stmt = this.db.prepare(`
      UPDATE caps SET current_usage = 0, reset_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(capId);
  }

  // Transition exhausted -> healthy when cap resets
  checkAndRecover(providerId) {
    const caps = this.db.prepare(`
      SELECT id, unit, limit_val, current_usage, window, reset_at
      FROM caps WHERE provider_id = ?
    `).all(providerId);

    const now = new Date().toISOString();
    let allReset = true;
    for (const cap of caps) {
      if (cap.reset_at && cap.reset_at <= now) {
        // This cap's window has expired, it will be reset
        continue;
      }
      if (cap.current_usage > 0) {
        allReset = false;
      }
    }

    if (allReset && caps.length > 0) {
      this.resetExpiredCaps(providerId);
      this.setState(providerId, 'healthy', null);
      return true;
    }
    return false;
  }

  // Most-restrictive-wins: check all caps for a provider
  // Returns the most restrictive cap (highest percentage used) or null if none
  getMostRestrictiveCap(providerId) {
    const caps = this.db.prepare(`
      SELECT id, unit, limit_val, current_usage, window, reset_at
      FROM caps WHERE provider_id = ?
    `).all(providerId);

    if (caps.length === 0) return null;

    let mostRestrictive = null;
    let highestPct = -1;

    for (const cap of caps) {
      const pct = cap.current_usage / cap.limit_val;
      if (pct > highestPct) {
        highestPct = pct;
        mostRestrictive = { ...cap, pct: Math.round(pct * 100) };
      }
    }

    return mostRestrictive;
  }

  // Get all providers in a tier with their cap status
  getProvidersWithCaps(tier) {
    const providers = this.db.prepare(`
      SELECT p.*, 
        json_group_array(json_object(
          'id', c.id, 'unit', c.unit, 'limit', c.limit_val, 'current', c.current_usage, 'window', c.window
        )) as caps
      FROM providers p
      LEFT JOIN caps c ON p.id = c.provider_id
      WHERE p.tier = ?
      GROUP BY p.id
      ORDER BY p.priority ASC
    `).all(tier);

    return providers.map(p => ({
      ...p,
      caps: p.caps ? JSON.parse(p.caps).filter(c => c.id !== null) : [],
    }));
  }
}

module.exports = { CapLedger };