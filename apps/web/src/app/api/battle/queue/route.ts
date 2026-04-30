// /api/battle/queue — proxy to Hub :3001 with auto-opponent picking.
//
// Frontend POSTs:    { petId, stakeUsdc, format }    (no opponent)
// Hub expects:       POST /battle/start { petAId, petBId, stakeAmount }
//
// We auto-pick the first non-self pet with a peer_id (i.e. running). On Hub
// timeout/error or no opponent available, we fall back to canned response.

import { callHub, fetchAllPets, proxyOrFallback } from '@/lib/hub'

interface QueuePayload {
  petId: number
  stakeUsdc: number
  format: 'debate' | 'joke-duel' | 'trivia'
}

export async function POST(req: Request) {
  let body: QueuePayload
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.petId || !body.format) {
    return Response.json({ error: 'petId, format required' }, { status: 400 })
  }
  const stake = body.stakeUsdc ?? 1

  const result = await proxyOrFallback(
    async () => {
      const pets = await fetchAllPets()
      const opponent = pets.find(
        (p) => p.token_id !== body.petId && p.peer_id !== null && p.peer_id !== '',
      )
      if (!opponent) return null  // no opponent available → fall through to stub

      // Hub picks 3 judges internally from remaining pets — needs 5+ pets total
      // for a real battle. If fewer, Hub will respond 400 and we fall back.
      const hubResp = await callHub<{ ok?: boolean; battleId?: string }>(
        '/api/battle/start',
        {
          method: 'POST',
          body: {
            petAId: body.petId,
            petBId: opponent.token_id,
            stakeAmount: String(stake),
          },
        },
      )
      if (!hubResp?.ok || !hubResp.battleId) return null

      // Pull 3 judges from the same Hub /api/pets list for display purposes
      const judges = pets
        .filter((p) => p.token_id !== body.petId && p.token_id !== opponent.token_id && p.peer_id)
        .slice(0, 3)
        .map((p) => ({
          tokenId: p.token_id,
          name: p.name ?? `pet-${p.token_id}`,
          ensName: p.ens_name ?? `pet-${p.token_id}.tama.eth`,
        }))

      return {
        battleId: hubResp.battleId,
        petId: body.petId,
        opponent: {
          tokenId: opponent.token_id,
          name: opponent.name ?? `pet-${opponent.token_id}`,
          ensName: opponent.ens_name ?? `pet-${opponent.token_id}.tama.eth`,
        },
        judges,
        format: body.format,
        stakeUsdc: stake,
        status: 'matched',
      }
    },
    () => ({
      battleId: `battle_${Date.now().toString(36)}`,
      petId: body.petId,
      opponent: { tokenId: 7, name: 'rusty', ensName: 'rusty.tama.eth' },
      judges: [
        { tokenId: 11, name: 'tofu',  ensName: 'tofu.tama.eth'  },
        { tokenId: 12, name: 'pip',   ensName: 'pip.tama.eth'   },
        { tokenId: 13, name: 'bento', ensName: 'bento.tama.eth' },
      ],
      format: body.format,
      stakeUsdc: stake,
      status: 'matched',
    }),
  )

  await new Promise((r) => setTimeout(r, 300))

  return Response.json(result)
}
