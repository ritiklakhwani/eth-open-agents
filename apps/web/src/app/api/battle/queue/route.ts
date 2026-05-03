// /api/battle/queue — proxy to Hub :3001 with auto-opponent picking.
//
// Frontend POSTs:    { petId, stakeUsdc, format }    (no opponent)
// Hub expects:       POST /battle/start { petAId, petBId, stakeAmount, format }
//
// We auto-pick the first non-self pet with a peer_id (i.e. running). On Hub
// timeout/error or no opponent available, we fall back to canned response.
//
// Dev override: set BATTLE_FIXED_PAIR=3,7 (two token_ids). Only those pets may
// queue; they always match each other. No stub fallback when this is set — you
// get a 4xx/5xx with a clear reason instead.

import { battleIdToEscrowKey } from 'contracts-sdk'
import { callHub, fetchAllPets, proxyOrFallback } from '@/lib/hub'

interface QueuePayload {
  petId: number
  stakeUsdc: number
  format: 'debate' | 'joke-duel' | 'trivia'
}

function parseBattleFixedPair(): [number, number] | null {
  const raw = process.env.BATTLE_FIXED_PAIR?.trim()
  if (!raw) return null
  const parts = raw.split(/[\s,]+/).map((s) => Number.parseInt(s.trim(), 10))
  if (parts.length !== 2 || !parts.every((n) => Number.isFinite(n) && n > 0) || parts[0] === parts[1]) {
    console.warn('[battle/queue] BATTLE_FIXED_PAIR invalid; ignored:', raw)
    return null
  }
  return [parts[0], parts[1]]
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
  const fixedPair = parseBattleFixedPair()

  if (fixedPair) {
    const [p1, p2] = fixedPair
    if (body.petId !== p1 && body.petId !== p2) {
      return Response.json(
        {
          error:
            `BATTLE_FIXED_PAIR is ${p1},${p2}. Open the arena as pet ${p1} or ${p2} only (` +
            `?pet=… or your in-app pet selector).`,
        },
        { status: 400 },
      )
    }
  }

  const buildHubMatch = async () => {
    const pets = await fetchAllPets()
    let opponents = pets.filter(
      (p) => p.token_id !== body.petId && p.peer_id !== null && p.peer_id !== '',
    )

    if (fixedPair) {
      const [a, b] = fixedPair
      const otherId = body.petId === a ? b : a
      const opp = pets.find((p) => p.token_id === otherId)
      if (!opp || !opp.peer_id || opp.peer_id === '') return null
      opponents = [opp]
    }

    if (opponents.length === 0) return null

    let opponent = opponents[0]
    let hubResp: { ok?: boolean; battleId?: string; escrowBattleKey?: string } | null = null
    for (const candidate of opponents) {
      const resp = await callHub<{ ok?: boolean; battleId?: string; escrowBattleKey?: string }>(
        '/api/battle/start',
        {
          method: 'POST',
          body: {
            petAId: body.petId,
            petBId: candidate.token_id,
            stakeAmount: String(stake),
            format: body.format,
          },
        },
      )
      if (resp?.ok && resp.battleId) {
        opponent = candidate
        hubResp = resp
        break
      }
    }
    if (!hubResp?.battleId) return null

    const judges = pets
      .filter((p) => p.token_id !== body.petId && p.token_id !== opponent.token_id && p.peer_id)
      .slice(0, 1)
      .map((p) => ({
        tokenId: p.token_id,
        name: p.name ?? `pet-${p.token_id}`,
        ensName: p.ens_name ?? `pet-${p.token_id}.tama.eth`,
      }))

    const id = hubResp.battleId
      return {
      battleId: id,
      escrowBattleKey: hubResp.escrowBattleKey ?? battleIdToEscrowKey(id),
      /** Same as Hub `pet_a` / BattleEscrow pet1 wallet order. */
      escrowPet1TokenId: body.petId,
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
  }

  if (fixedPair) {
    const [a, b] = fixedPair
    const otherId = body.petId === a ? b : a
    const match = await buildHubMatch()
    if (!match) {
      return Response.json(
        {
          error:
            `Could not start fixed battle (${body.petId} vs ${otherId}). ` +
            `Both need running Hub workers (peer_id on /api/pets). If both are online, check Hub logs for /api/battle/start.`,
        },
        { status: 503 },
      )
    }
    await new Promise((r) => setTimeout(r, 300))
    return Response.json({ ...match, source: 'hub' as const })
  }

  const result = await proxyOrFallback(buildHubMatch, () => {
    const battleId = `battle_${Date.now().toString(36)}`
    return {
      battleId,
      escrowBattleKey: battleIdToEscrowKey(battleId),
      escrowPet1TokenId: body.petId,
      petId: body.petId,
      opponent: { tokenId: 7, name: 'rusty', ensName: 'rusty.tama.eth' },
      judges: [
        { tokenId: 11, name: 'tofu', ensName: 'tofu.tama.eth' },
      ],
      format: body.format,
      stakeUsdc: stake,
      status: 'matched',
    }
  })

  await new Promise((r) => setTimeout(r, 300))

  return Response.json(result)
}
