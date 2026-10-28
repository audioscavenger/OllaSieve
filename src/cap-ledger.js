// src/cap-ledger.js - CapLedger compositing state + records.
const { CapLedgerState } = require('./cap-ledger-state');
const { CapLedgerRecords } = require('./cap-ledger-records');

class CapLedger {
  constructor(db) {
    this.db = db;
    this.state = new CapLedgerState(db);
    this.records = new CapLedgerRecords(db);
  }
  // Delegate methods
  recordUsage(...a) { return this.records.recordUsage(...a); }
  checkCaps(...a) { return this.records.checkCaps(...a); }
  getMostRestrictiveCap(...a) { return this.records.getMostRestrictiveCap(...a); }
  getProvidersWithCaps(...a) { return this.records.getProvidersWithCaps(...a); }
  getRequestLog(...a) { return this.records.getRequestLog(...a); }
  purge(...a) { return this.records.purge(...a); }
  getState(...a) { return this.state.getState(...a); }
  setState(...a) { return this.state.setState(...a); }
  recordFailure(...a) { return this.state.recordFailure(...a); }
  resetExpiredCaps(...a) { return this.state.resetExpiredCaps(...a); }
  resetCap(...a) { return this.state.resetCap(...a); }
  checkAndRecover(...a) { return this.state.checkAndRecover(...a); }
}

module.exports = { CapLedger };