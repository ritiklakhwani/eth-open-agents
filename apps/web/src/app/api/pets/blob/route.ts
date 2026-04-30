// /api/pets/blob — uploads a pet identity blob to 0G Storage and returns the CID.
// Falls back to a local cache when 0G testnet is flaky (handled inside og-storage).

import { uploadBlob, type PetIdentityBlob } from 'og-storage'

interface BlobPayload {
  spriteUrl: string
  archetype: string
  name: string
  personality?: string
  traits?: Record<string, number>
}

export async function POST(req: Request) {
  let body: BlobPayload
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body.spriteUrl || !body.archetype || !body.name) {
    return Response.json(
      { error: 'spriteUrl, archetype, name required' },
      { status: 400 },
    )
  }

  const blob: PetIdentityBlob = {
    sprite: body.spriteUrl,
    archetype: body.archetype,
    personality: body.personality ?? defaultPersonalityFor(body.archetype),
    traits: body.traits ?? defaultTraitsFor(body.archetype),
    memorySnapshot: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  try {
    const cid = await uploadBlob(blob)
    return Response.json({ cid })
  } catch (err) {
    console.error('[api/pets/blob] upload failed:', err)
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }
}

function defaultPersonalityFor(archetype: string): string {
  const map: Record<string, string> = {
    sage: 'Calm, thoughtful, speaks in measured riddles. Listens before acting.',
    gremlin: 'Chaotic, mischievous, loves pranks and surprises.',
    athlete: 'Energetic, competitive, hyped for any challenge.',
    joker: 'Pun-obsessed, can\'t resist a wordplay opportunity.',
    scholar: 'Curious, analytical, references obscure facts.',
  }
  return map[archetype] ?? 'A pet with an emerging personality.'
}

function defaultTraitsFor(archetype: string): Record<string, number> {
  const base = { strength: 50, wit: 50, charm: 50, stamina: 50 }
  const buffs: Record<string, Partial<typeof base>> = {
    sage: { wit: 80, charm: 70 },
    gremlin: { wit: 75, stamina: 65 },
    athlete: { strength: 85, stamina: 80 },
    joker: { charm: 85, wit: 75 },
    scholar: { wit: 90, charm: 60 },
  }
  return { ...base, ...buffs[archetype] }
}
