// src/cap-ledger-records.js - CapLedger usage records and cap checking.

class CapLedgerRecords {
  constructor(db) {
    this.db = db;
  }

  recordUsage(providerId, model, usage, status, latencyMs, switchedFrom = null) {
    const tx = this.db.transaction(() => {
      const insertEvent = this.db.prepare(`
        INSERT INTO usage_events (provider_id, model, tokens_in, tokens_out, cost_usd, status, latency_ms, switched_from)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertEvent.run(providerId, model, usage?.tokensIn ?? 0, usage?.tokensOut ?? 0, usage?.costUsd ?? 0, status, latencyMs, switchedFrom);

      if (usage) {
        const totalTokens = (usage.tokensIn ?? 0) + (usage.tokensOut ?? 0);
        this.db.prepare("UPDATE caps SET current_usage = current_usage + ?, updated_at = datetime('now') WHERE provider_id = ? AND unit = ?")
          .run(totalTokens, providerId, 'tokens');
        this.db.prepare("UPDATE caps SET current_usage = current_usage + 1, updated_at = datetime('now') WHERE provider_id = ? AND unit = ?")
          .run(providerId, 'requests');
        if (usage.costUsd !== null && usage.costUsd !== undefined) {
          this.db.prepare("UPDATE caps SET current_usage = current_usage + ?, updated_at = datetime('now') WHERE provider_id = ? AND unit = ?")
            .run(usage.costUsd, providerId, 'dollars');
        }
      }

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

  getProvidersWithCaps(tier) {
    const providers = this.db.prepare(`
      SELECT p.*, json_group_array(json_object('id', c.id, 'unit', c.unit, 'limit', c.limit_val, 'current', c.current_usage, 'window', c.window)) as caps
      FROM providers p LEFT JOIN caps c ON p.id = c.provider_id WHERE p.tier = ?
      GROUP BY p.id ORDER BY p.priority ASC
    `).all(tier);
    return providers.map(p => ({ ...p, caps: p.caps ? JSON.parse(p.caps).filter((c) => c.id !== null) : [] }));
  }

  getRequestLog(providerId = null) {
    let query = 'SELECT * FROM usage_events ORDER BY ts DESC LIMIT 50';
    const params = [];
    if (providerId) {
      query = 'SELECT * FROM usage_events WHERE provider_id = ? ORDER BY ts DESC LIMIT 50';
      params.push(providerId);
    }
    return this.db.prepare(query).all(...params);
  }

  purge(days) {
    const stmt = this.db.prepare("DELETE FROM usage_events WHERE ts <= datetime('now', '-' || ? || ' days')");
    return stmt.run(days);
  }
}

module.exports = { CapLedgerRecords };