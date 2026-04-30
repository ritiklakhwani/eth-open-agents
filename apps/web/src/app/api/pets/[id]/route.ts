// /api/pets/[id] — proxy to the Hub's /api/pets/:id (port 3001).
//
// Frontend never hits the Hub directly so we can:
//   * fall back to mock data when the Hub isn't running (dev / disconnected demo)
//   * normalize snake_case Hub columns into the camelCase Pet shape from shared-types

import type { Pet, Zone, Archetype } from 'shared-types'

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3001'

interface HubPetRow {
  token_id: number
  name: string | null
  owner_address: string | null
  wallet_address: string | null
  ens_name: string | null
  peer_id: string | null
  blob_cid: string | null
  archetype: string | null
  mood: number
  energy: number
  hunger: number
  zone: string
  pos_x: number
  pos_y: number
  created_at: number | null
}

const ARCHETYPES: Archetype[] = ['sage', 'gremlin', 'athlete', 'joker', 'scholar']
const ZONES: Zone[] = ['park', 'office', 'arena', 'lounge', 'kitchen', 'mailbox']

function normalize(row: HubPetRow): Pet {
  const archetype = (ARCHETYPES.includes(row.archetype as Archetype)
    ? row.archetype
    : 'sage') as Archetype
  const zone = (ZONES.includes(row.zone as Zone) ? row.zone : 'park') as Zone

  return {
    id: row.token_id,
    tokenId: row.token_id,
    name: row.name ?? `pet-${row.token_id}`,
    ensName: row.ens_name ?? `${row.name ?? 'pet'}.tama.eth`,
    ownerAddress: (row.owner_address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    walletAddress: (row.wallet_address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    spriteUrl: `/sprites/${archetype}.png`,
    blobCID: row.blob_cid ?? '',
    archetype,
    mood: row.mood,
    energy: row.energy,
    hunger: row.hunger,
    zone,
    position: { x: row.pos_x, y: row.pos_y },
    peerId: row.peer_id ?? '',
  }
}

function mockPet(id: number): Pet {
  return {
    id,
    tokenId: id,
    name: `mira`,
    ensName: `mira.tama.eth`,
    ownerAddress: '0x2379D6F597d3F58709d53359916889de679C8cA9',
    walletAddress: '0x0000000000000000000000000000000000000000',
    spriteUrl: '/sprites/sage.png',
    blobCID: '',
    archetype: 'sage',
    mood: 78,
    energy: 64,
    hunger: 42,
    zone: 'park',
    position: { x: 240, y: 240 },
    peerId: '',
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const tokenId = Number(id)
  if (!Number.isFinite(tokenId)) {
    return Response.json({ error: 'invalid id' }, { status: 400 })
  }

  try {
    const res = await fetch(`${HUB_URL}/api/pets/${tokenId}`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    })
    if (res.ok) {
      const row = (await res.json()) as HubPetRow
      return Response.json({ pet: normalize(row), source: 'hub', friendsCount: 0 })
    }
    // 404 / 5xx — fall through to mock
  } catch {
    // Hub down — fall through to mock
  }

  return Response.json({ pet: mockPet(tokenId), source: 'mock', friendsCount: 0 })
}
