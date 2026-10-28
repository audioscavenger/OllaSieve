// src/cap-ledger-state.js - CapLedger provider state transitions.

class CapLedgerState {
  constructor(db) {
    this.db = db;
  }

  getState(providerId) {
    const row = this.db.prepare(`
      SELECT provider_id, status, cooldown_until, consecutive_failures, last_error
      FROM provider_state WHERE provider_id = ?
    `).get(providerId);
    return row || { provider_id: providerId, status: 'healthy', cooldown_until: null, consecutive_failures: 0, last_error: null };
  }

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

  recordFailure(providerId, error) {
    const state = this.getState(providerId);
    const newFailures = state.consecutive_failures + 1;
    const stmt = this.db.prepare(`
      UPDATE provider_state SET consecutive_failures = ?, last_error = ? WHERE provider_id = ?
    `);
    stmt.run(newFailures, error?.message ?? String(error), providerId);

    if (newFailures >= 3) {
      const cooldownUntil = new Date(Date.now() + 60000).toISOString();
      this.setState(providerId, 'cooldown', cooldownUntil);
    }
  }

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

  resetCap(capId) {
    const stmt = this.db.prepare(`
      UPDATE caps SET current_usage = 0, reset_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(capId);
  }

  checkAndRecover(providerId) {
    const caps = this.db.prepare(`
      SELECT id, unit, limit_val, current_usage, window, reset_at
      FROM caps WHERE provider_id = ?
    `).all(providerId);
    const now = new Date().toISOString();
    let allReset = true;
    for (const cap of caps) {
      if (cap.reset_at && cap.reset_at <= now) continue;
      if (cap.current_usage > 0) allReset = false;
    }
    if (allReset && caps.length > 0) {
      this.resetExpiredCaps(providerId);
      this.setState(providerId, 'healthy', null);
      return true;
    }
    return false;
  }
}

module.exports = { CapLedgerState };