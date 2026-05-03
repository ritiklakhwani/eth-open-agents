import Database, { type Database as BetterDB } from 'better-sqlite3'
import { mkdirSync } from 'fs'
import path from 'path'

export type DB = BetterDB

export function initDB(): BetterDB {
  const dataDir = path.resolve('data')
  mkdirSync(dataDir, { recursive: true })

  const db = new Database(path.join(dataDir, 'tama.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS pets (
      token_id       INTEGER PRIMARY KEY,
      name           TEXT,
      owner_address  TEXT,
      wallet_address TEXT,
      ens_name       TEXT,
      peer_id       TEXT,
      blob_cid      TEXT,
      archetype     TEXT,
      sprite_url    TEXT,
      parent_name   TEXT,
      mood          INTEGER DEFAULT 80,
      energy        INTEGER DEFAULT 100,
      hunger        INTEGER DEFAULT 50,
      zone          TEXT    DEFAULT 'park',
      pos_x         REAL    DEFAULT 700,
      pos_y         REAL    DEFAULT 600,
      created_at    INTEGER
    );

    CREATE TABLE IF NOT EXISTS memories (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id              INTEGER NOT NULL,
      kind                TEXT NOT NULL,
      content             TEXT NOT NULL,
      counterparty_pet_id INTEGER,
      created_at          INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memories_pet ON memories(pet_id, created_at);

    CREATE TABLE IF NOT EXISTS friendships (
      pet_a            INTEGER NOT NULL,
      pet_b            INTEGER NOT NULL,
      strength         INTEGER DEFAULT 1,
      last_interaction INTEGER,
      PRIMARY KEY (pet_a, pet_b)
    );

    CREATE TABLE IF NOT EXISTS keeperhub_workflows (
      id         TEXT PRIMARY KEY,
      pet_id     INTEGER NOT NULL,
      kind       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      payload    TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS battles (
      id          TEXT PRIMARY KEY,
      pet_a       INTEGER NOT NULL,
      pet_b       INTEGER NOT NULL,
      stake       TEXT NOT NULL DEFAULT '0',
      format      TEXT NOT NULL DEFAULT 'debate',
      status      TEXT NOT NULL DEFAULT 'active',
      winner      INTEGER,
      judges      TEXT,
      payouts     TEXT,
      created_at  INTEGER NOT NULL,
      settled_at  INTEGER
    );

    -- battles.status: active (open) | settled (escrow settle tx submitted) | judged (verdict, no escrow payout) | error

    CREATE TABLE IF NOT EXISTS battle_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_id  TEXT NOT NULL,
      phase      TEXT NOT NULL,
      detail     TEXT NOT NULL,
      pet_id     INTEGER,
      metadata   TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_battle_events_battle ON battle_events(battle_id, created_at);
  `)

  // Migrations for older DBs: add columns added after the initial schema.
  // SQLite ignores ALTER TABLE ADD COLUMN if the column already exists in
  // newer SQLite, but we wrap in try/catch for safety.
  try { db.exec(`ALTER TABLE pets ADD COLUMN sprite_url TEXT`) } catch {}
  try { db.exec(`ALTER TABLE pets ADD COLUMN parent_name TEXT`) } catch {}
  try { db.exec(`ALTER TABLE battles ADD COLUMN format TEXT NOT NULL DEFAULT 'debate'`) } catch {}

  return db
}

