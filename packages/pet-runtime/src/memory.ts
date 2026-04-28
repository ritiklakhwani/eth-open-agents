import Database, { type Database as BetterDB } from 'better-sqlite3'
import path from 'path'
import type { PetIdentityBlob } from './blob'

export class Memory {
  private db: BetterDB

  constructor(private petId: number) {
    // Connects to the same DB file as the hub (WAL mode allows concurrent writers)
    const dbPath = path.resolve('data', 'tama.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
  }

  add(entry: { kind: 'chat' | 'event' | 'thought'; content: unknown; counterpartyPetId?: number }) {
    this.db.prepare(`
      INSERT INTO memories (pet_id, kind, content, counterparty_pet_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      this.petId,
      entry.kind,
      JSON.stringify(entry.content),
      entry.counterpartyPetId ?? null,
      Date.now(),
    )
  }

  recentChats(n = 10) {
    return this.db.prepare(`
      SELECT * FROM memories
      WHERE pet_id = ? AND kind = 'chat'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(this.petId, n) as Array<{ content: string; counterparty_pet_id: number | null; created_at: number }>
  }

  friendsWith(otherPetId: number): number {
    const row = this.db.prepare(`
      SELECT strength FROM friendships
      WHERE (pet_a = ? AND pet_b = ?) OR (pet_a = ? AND pet_b = ?)
    `).get(this.petId, otherPetId, otherPetId, this.petId) as { strength: number } | undefined
    return row?.strength ?? 0
  }

  strengthenFriendship(otherPetId: number) {
    const [a, b] = [Math.min(this.petId, otherPetId), Math.max(this.petId, otherPetId)]
    this.db.prepare(`
      INSERT INTO friendships (pet_a, pet_b, strength, last_interaction)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(pet_a, pet_b) DO UPDATE SET
        strength = strength + 1,
        last_interaction = excluded.last_interaction
    `).run(a, b, Date.now())
  }

  getPet() {
    return this.db.prepare('SELECT * FROM pets WHERE token_id = ?').get(this.petId)
  }

  updatePeerIdAndZone(peerId: string, zone = 'park') {
    this.db.prepare(`
      UPDATE pets SET peer_id = ?, zone = ? WHERE token_id = ?
    `).run(peerId, zone, this.petId)
  }

  // Called every 30 min — deterministic stat tick, no LLM
  tickStats() {
    this.db.prepare(`
      UPDATE pets
      SET
        energy = MAX(0, energy - 3),
        hunger = MIN(100, hunger + 4),
        mood   = MAX(0, CASE WHEN energy < 20 THEN mood - 5 ELSE mood END)
      WHERE token_id = ?
    `).run(this.petId)
  }

  // Snapshot for 0G sync — pet state + last 100 memories
  snapshot(): Pick<PetIdentityBlob, 'memorySnapshot'> & { pet: unknown } {
    return {
      pet: this.getPet(),
      memorySnapshot: this.db.prepare(`
        SELECT * FROM memories WHERE pet_id = ? ORDER BY created_at DESC LIMIT 100
      `).all(this.petId),
    }
  }
}