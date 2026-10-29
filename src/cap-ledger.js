/*
 * src/cap-ledger.js - CapLedger composite facade for usage tracking + provider state.
 *
 * Single entry point for ledger operations. Delegates to:
 *   - CapLedgerRecords   - usage recording, cap checking, daily summaries
 *   - CapLedgerState     - provider status (healthy/exhausted/cooldown), failure counting
 *
 * Usage flow:
 *   1. Provider responds → executeWithSwitching() → ledger.recordUsage()
 *   2. After response, ledger.checkCaps() triggers predictive exhaustion at 97%
 *   3. On 429 or 3 failures → ledger.setState('exhausted') or 'cooldown'
 *   4. Periodic cleanup → resetExpiredCaps() → restore healthy status
 *
 * Foreign keys to `providers` table enforced via SQLite FK constraints.
 */

const { CapLedgerState } = require('./cap-ledger-state');
const { CapLedgerRecords } = require('./cap-ledger-records');

/**
 * Composite ledger combining records (usage data) and state (provider status).
 * Provides a single public API for all cap/ledger operations.
 */
class CapLedger {
  /**
   * @param {Database} db - better-sqlite3 Database instance with cap schema initialized.
   */
  constructor(db) {
    this.db = db;
    /** @type {CapLedgerState} */
    this.state = new CapLedgerState(db);
    /** @type {CapLedgerRecords} */
    this.records = new CapLedgerRecords(db);
  }

  // ---- Records facade (usage tracking) ----
  recordUsage(...a) { return this.records.recordUsage(...a); }
  checkCaps(...a) { return this.records.checkCaps(...a); }
  getMostRestrictiveCap(...a) { return this.records.getMostRestrictiveCap(...a); }
  getProvidersWithCaps(...a) { return this.records.getProvidersWithCaps(...a); }
  getRequestLog(...a) { return this.records.getRequestLog(...a); }
  purge(...a) { return this.records.purge(...a); }

  // ---- State facade (provider status transitions) ----
  getState(...a) { return this.state.getState(...a); }
  setState(...a) { return this.state.setState(...a); }
  recordFailure(...a) { return this.state.recordFailure(...a); }
  resetExpiredCaps(...a) { return this.state.resetExpiredCaps(...a); }
  resetCap(...a) { return this.state.resetCap(...a); }
  checkAndRecover(...a) { return this.state.checkAndRecover(...a); }
}

module.exports = { CapLedger };