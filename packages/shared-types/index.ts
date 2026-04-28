// Shared types between Hub (Karmanay) and Frontend (Ritik).
// Ritik writes, Karmanay imports as read-only.

export type Zone = 'park' | 'office' | 'arena' | 'lounge' | 'kitchen' | 'mailbox'

export type Archetype = 'sage' | 'gremlin' | 'athlete' | 'joker' | 'scholar'

export interface Pet {
  id: number
  tokenId: number
  name: string
  ensName: string            // e.g. "mira.tama.eth"
  ownerAddress: `0x${string}`
  walletAddress: `0x${string}`
  spriteUrl: string
  blobCID: string            // 0G Storage CID
  archetype: Archetype
  mood: number               // 0-100
  energy: number             // 0-100
  hunger: number             // 0-100
  zone: Zone
  position: { x: number; y: number }
  peerId: string             // AXL ed25519 pubkey
}

// Socket.io events Hub broadcasts
export interface SocketEvents {
  positions: Record<number, { x: number; y: number; zone: Zone }>
  chat: { from: number; to: number; text: string; timestamp: number }
  zoneEnter: { petId: number; zone: Zone }
  zoneExit: { petId: number; zone: Zone }
  petJoined: { pet: Pet }
  petLeft: { petId: number }
}

// REST endpoints
export interface APIRoutes {
  'GET /api/pets': { response: Pet[] }
  'GET /api/pets/:id': { response: Pet }
  'POST /api/pets/sprite': {
    request: FormData       // photo file
    response: { spriteUrl: string }
  }
  'POST /api/pets/blob': {
    request: { spriteUrl: string; archetype: Archetype; name: string }
    response: { cid: string }
  }
  'GET /api/sse/:petId': { response: 'event-stream' }
}

// Memory entries (pet-runtime → SQLite)
export interface MemoryEntry {
  id: number
  petId: number
  kind: 'chat' | 'event' | 'thought'
  content: unknown
  counterpartyPetId?: number
  createdAt: number
}

// KeeperHub workflow tracking
export interface KeeperHubWorkflow {
  id: string
  petId: number
  kind: 'allowance' | 'gift' | 'mailbox' | 'battle-escrow' | 'adoption-chain' | 'subscription'
  status: 'pending' | 'active' | 'completed' | 'failed'
  payload: unknown
  createdAt: number
}
