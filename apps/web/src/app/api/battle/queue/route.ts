// /api/battle/queue — STUB.
//
// Real flow: pet activity opens AXL channel to opponent, runs N-round debate,
// 3 separate AXL-node pets vote, winner takes BattleEscrow stake. This stub
// returns canned battle metadata + a polling id.

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

  await new Promise((r) => setTimeout(r, 500))

  const battleId = `battle_${Date.now().toString(36)}`
  return Response.json({
    battleId,
    petId: body.petId,
    opponent: { tokenId: 7, name: 'rusty', ensName: 'rusty.tama.eth' },
    judges: [
      { tokenId: 11, name: 'tofu', ensName: 'tofu.tama.eth' },
      { tokenId: 12, name: 'pip',  ensName: 'pip.tama.eth' },
      { tokenId: 13, name: 'bento', ensName: 'bento.tama.eth' },
    ],
    format: body.format,
    stakeUsdc: body.stakeUsdc ?? 1,
    status: 'matched',
    source: 'stub',
  })
}
