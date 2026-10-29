/*
 * src/db.js - SQLite setup for OllaSieve.
 *
 * Opens (or creates) the database at the configured path, enables WAL
 * mode for concurrent reads, and creates the schema tables if they
 * don't exist. Returns the better-sqlite3 database instance.
 *
 * Schema (5 tables):
 *   providers      — provider registry (id, tier, type, base_url, api_key_env, priority)
 *   caps           — per-provider limits (unit: tokens|requests|dollars, limit_val, window, current_usage)
 *   usage_events   — per-request log (tokens_in/out, cost_usd, status, latency_ms, switched_from)
 *   provider_state — state machine (healthy|exhausted|cooldown, cooldown_until, consecutive_failures)
 *   daily_summary  — aggregated daily totals (requests, tokens_in/out, cost_usd)
 *
 * Foreign keys: caps.provider_id -> providers.id, usage_events.provider_id -> providers.id,
 *               provider_state.provider_id -> providers.id, daily_summary.provider_id -> providers.id
 *
 * WAL mode + foreign_keys = ON enable safe concurrent reads + referential integrity.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

/**
 * Complete CREATE TABLE schema (executed as a single transaction via db.exec()).
 * Tables are created IF NOT EXISTS so schema is idempotent across restarts.
 *
 * @constant {string}
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_env TEXT,
  priority INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS caps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  unit TEXT NOT NULL,
  limit_val REAL NOT NULL,
  window TEXT NOT NULL,
  current_usage REAL NOT NULL DEFAULT 0,
  reset_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  model TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  status INTEGER,
  latency_ms INTEGER,
  switched_from TEXT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);

CREATE TABLE IF NOT EXISTS provider_state (
  provider_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'healthy',
  cooldown_until TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);

CREATE TABLE IF NOT EXISTS daily_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  date TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  UNIQUE(provider_id, date),
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);
`;

/**
 * Opens a SQLite database at the given path.
 * - Ensures parent directory exists
 * - Enables WAL mode (journal_mode = WAL) for concurrent readers
 * - Enables foreign_keys = ON for referential integrity
 * - Executes SCHEMA to create tables
 *
 * @param {string} dbPath - Absolute or relative path to the .db file.
 * @returns {Database} better-sqlite3 Database instance ready for use.
 */
function openDatabase(dbPath) {
  // Ensure parent directory exists (better-sqlite3 requires it)
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

/**
 * Safely closes the database connection if open.
 *
 * @param {Database} db - better-sqlite3 Database instance.
 */
function closeDatabase(db) {
  if (db && db.open) {
    db.close();
  }
}

module.exports = { openDatabase, closeDatabase, SCHEMA };