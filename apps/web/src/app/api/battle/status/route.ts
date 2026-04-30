// /api/battle/status — STUB.
//
// Returns a deterministic timeline keyed off ?battleId=… so polling produces
// progressive updates ("matched" → "round 1" → "round 2" → "judges deliberating"
// → "verdict"). Real impl reads from Hub/SQLite.

const ROUNDS: Array<{ at: number; phase: string; detail: string; petWon?: boolean }> = [
  { at: 0,    phase: 'matched',         detail: 'Opponent locked in. Stakes escrowed.' },
  { at: 2000, phase: 'round-1',         detail: 'Mira opens with a calm rebuttal.' },
  { at: 4500, phase: 'round-2',         detail: 'Rusty fires back with stats.' },
  { at: 7000, phase: 'round-3',         detail: 'Closing arguments — both pets land clean lines.' },
  { at: 9000, phase: 'deliberating',    detail: '3 judges casting votes over AXL...' },
  { at: 11000, phase: 'verdict',        detail: 'Mira wins 2-1. Belt minted to ENS.', petWon: true },
]

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const battleId = searchParams.get('battleId')
  if (!battleId) {
    return Response.json({ error: 'battleId required' }, { status: 400 })
  }

  // Decode the start time from the base36 suffix so we have stable progression
  const idMatch = battleId.match(/^battle_([a-z0-9]+)$/)
  const startedAt = idMatch ? parseInt(idMatch[1], 36) : Date.now()
  const elapsed = Math.max(0, Date.now() - startedAt)

  const events = ROUNDS.filter((r) => r.at <= elapsed)
  const current = events[events.length - 1] ?? ROUNDS[0]
  const finished = current.phase === 'verdict'

  return Response.json({
    battleId,
    elapsedMs: elapsed,
    events,
    current,
    finished,
    judgeVotes: finished
      ? [
          { judge: 'tofu.tama.eth',  votedFor: 'mira'  },
          { judge: 'pip.tama.eth',   votedFor: 'mira'  },
          { judge: 'bento.tama.eth', votedFor: 'rusty' },
        ]
      : [],
    payoutTxHash: finished ? '0xabc' + battleId.slice(-12) : null,
    source: 'stub',
  })
}
