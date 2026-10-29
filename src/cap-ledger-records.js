/*
 * src/cap-ledger-records.js - CapLedger usage recording, cap checking, and log queries.
 *
 * Handles the *data* side of the cap ledger:
 *   - recordUsage(): transactionally writes usage_events + updates caps + daily_summary
 *   - checkCaps(): evaluates predictive threshold (default 97%) across all cap units
 *   - getMostRestrictiveCap(): finds cap with highest % utilization
 *   - getProvidersWithCaps(): lists providers in a tier with their cap details
 *   - getRequestLog(): recent 50 requests (for dashboard)
 *   - purge(): deletes usage_events older than N days (dashboard /api/purge)
 *
 * Mixed-unit support:
 *   - tokens:  sum of prompt_tokens + completion_tokens
 *   - requests: +1 per call
 *   - dollars:  cost_usd from response (if provider reports it)
 *
 * "Most restrictive wins": when any cap unit exceeds its threshold,
 * the provider is considered exhausted. Proxy router uses this for switching.
 */

class CapLedgerRecords {
  /**
   * @param {Database} db - better-sqlite3 instance with caps/usage_events/daily_summary tables.
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Records a completed provider request in a single transaction.
   * Updates:
   *   - usage_events (immutable log row)
   *   - caps.current_usage (incremented per unit: tokens, requests, dollars)
   *   - daily_summary (upsert: requests + tokens_in/out + cost_usd)
   *
   * @param {string} providerId - Provider ID (FK to providers.id).
   * @param {string} model - Model name as reported by provider.
   * @param {object|null} usage - { tokensIn, tokensOut, costUsd } from adapter.parseUsage().
   * @param {number} status - HTTP status code (200, 429, etc.).
   * @param {number} latencyMs - Round-trip latency.
   * @param {string|null} switchedFrom - Previous provider ID if this was a fallback.
   * @returns {void}
   */
  recordUsage(providerId, model, usage, status, latencyMs, switchedFrom = null) {
    const tx = this.db.transaction(() => {
      const insertEvent = this.db.prepare(`
        INSERT INTO usage_events (provider_id, model, tokens_in, tokens_out, cost_usd, status, latency_ms, switched_from)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertEvent.run(providerId, model, usage?.tokensIn ?? 0, usage?.tokensOut ?? 0, usage?.costUsd ?? 0, status, latencyMs, switchedFrom);

      if (usage) {
        const totalTokens = (usage.tokensIn ?? 0) + (usage.tokensOut ?? 0);
        // Increment token cap
        this.db.prepare('UPDATE caps SET current_usage = current_usage + ?, updated_at = datetime(\'now\') WHERE provider_id = ? AND unit = ?')
          .run(totalTokens, providerId, 'tokens');
        // Increment request cap
        this.db.prepare('UPDATE caps SET current_usage = current_usage + 1, updated_at = datetime(\'now\') WHERE provider_id = ? AND unit = ?')
          .run(providerId, 'requests');
        // Increment dollar cap (if provider reports cost)
        if (usage.costUsd !== null && usage.costUsd !== undefined) {
          this.db.prepare('UPDATE caps SET current_usage = current_usage + ?, updated_at = datetime(\'now\') WHERE provider_id = ? AND unit = ?')
            .run(usage.costUsd, providerId, 'dollars');
        }
      }

      // Daily summary upsert (aggregates for dashboard trends)
      const today = new Date().toISOString().split('T')[0];
      const upsertSummary = this.db.prepare(`
        INSERT INTO daily_summary (provider_id, date, requests, tokens_in, tokens_out, cost_usd)
        VALUES (?, ?, 1, ?, ?, ?)
        ON CONFLICT(provider_id, date) DO UPDATE SET
          requests = requests + 1, tokens_in = tokens_in + ?, tokens_out = tokens_out + ?, cost_usd = cost_usd + ?
      `);
      upsertSummary.run(providerId, today, usage?.tokensIn ?? 0, usage?.tokensOut ?? 0, usage?.costUsd ?? 0,
        usage?.tokensIn ?? 0, usage?.tokensOut ?? 0, usage?.costUsd ?? 0);
    });
    tx();
  }

  /**
   * Checks all caps for a provider against a threshold (default 97%).
   * Returns the first exceeded cap (most restrictive wins principle).
   *
   * @param {string} providerId - Provider ID.
   * @param {number} [threshold=0.97] - Exhaustion threshold (0.0-1.0).
   * @returns {{exceeded: boolean, cap?: object, reason?: string}} If exceeded: cap details + reason.
   */
  checkCaps(providerId, threshold = 0.97) {
    const caps = this.db.prepare('SELECT id, unit, limit_val, current_usage, window, reset_at FROM caps WHERE provider_id = ?').all(providerId);
    for (const cap of caps) {
      const pct = cap.current_usage / cap.limit_val;
      if (pct >= threshold) {
        return { exceeded: true, cap: { ...cap, pct: Math.round(pct * 100) }, reason: `Cap ${cap.unit} at ${Math.round(pct * 100)}%` };
      }
    }
    return { exceeded: false };
  }

  /**
   * Returns the cap with the highest utilization percentage (most restrictive).
   * Used by dashboard to show the "bottleneck" cap per provider.
   *
   * @param {string} providerId - Provider ID.
   * @returns {object|null} Cap with pct, or null if no caps.
   */
  getMostRestrictiveCap(providerId) {
    const caps = this.db.prepare('SELECT id, unit, limit_val, current_usage, window, reset_at FROM caps WHERE provider_id = ?').all(providerId);
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

  /**
   * Lists all providers in a tier with their associated caps (for dashboard).
   *
   * @param {string} tier - Tier name (e.g., 'free', 'paid').
   * @returns {Array<{id, tier, type, base_url, caps: Array}>} Providers with cap arrays.
   */
  getProvidersWithCaps(tier) {
    const providers = this.db.prepare(`
      SELECT p.*, json_group_array(json_object('id', c.id, 'unit', c.unit, 'limit', c.limit_val, 'current', c.current_usage, 'window', c.window)) as caps
      FROM providers p LEFT JOIN caps c ON p.id = c.provider_id WHERE p.tier = ?
      GROUP BY p.id ORDER BY p.priority ASC
    `).all(tier);
    return providers.map(p => ({ ...p, caps: p.caps ? JSON.parse(p.caps).filter((c) => c.id !== null) : [] }));
  }

  /**
   * Returns the most recent request log entries (for dashboard).
   *
   * @param {string|null} [providerId] - Optional filter by provider.
   * @returns {Array<object>} Up to 50 most recent usage_events, newest first.
   */
  getRequestLog(providerId = null) {
    let query = 'SELECT * FROM usage_events ORDER BY ts DESC LIMIT 50';
    const params = [];
    if (providerId) {
      query = 'SELECT * FROM usage_events WHERE provider_id = ? ORDER BY ts DESC LIMIT 50';
      params.push(providerId);
    }
    return this.db.prepare(query).all(...params);
  }

  /**
   * Deletes usage_events older than the given number of days.
   * Called by dashboard /api/purge endpoint.
   *
   * @param {number} days - Days threshold (7, 30, 90, 365).
   * @returns {{changes: number}} Result with deleted row count.
   */
  purge(days) {
    const stmt = this.db.prepare('DELETE FROM usage_events WHERE ts <= datetime(\'now\', \'-\' || ? || \' days\')');
    return stmt.run(days);
  }
}

module.exports = { CapLedgerRecords };