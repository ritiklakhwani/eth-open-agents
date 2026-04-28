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
      mood          INTEGER DEFAULT 80,
      energy        INTEGER DEFAULT 100,
      hunger        INTEGER DEFAULT 50,
      zone          TEXT    DEFAULT 'park',
      pos_x         REAL    DEFAULT 400,
      pos_y         REAL    DEFAULT 300,
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
  `)

  return db
}

