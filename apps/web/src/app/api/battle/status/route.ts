// /api/battle/status — proxy Hub battle state. Stub only for queue fallback ids (`battle_*`).
// Real Hub ids (`battle-<hex>`) never use the canned timeline when Hub is unreachable.

import { callHub } from '@/lib/hub'

interface EscrowOnChain {
  pet1Staked: boolean
  pet2Staked: boolean
  settled: boolean
}

export interface StatusResp {
  battleId: string
  elapsedMs: number
  events: Array<{
    at: number
    phase: string
    detail: string
    petWon?: boolean
    petId?: number | null
    petName?: string | null
    metadata?: Record<string, unknown>
  }>
  current: {
    at: number
    phase: string
    detail: string
    petWon?: boolean
    petId?: number | null
    petName?: string | null
    metadata?: Record<string, unknown>
  }
  finished: boolean
  judgeVotes: Array<{ judge: string; votedFor: string; reasoning?: string }>
  payoutTxHash: string | null
  settlementTxHash?: string | null
  winner?: number | null
  status?: string
  escrowSettledOnChain?: boolean
  escrowOnChain?: EscrowOnChain | null
  settlementError?: string | null
  workerOnChainStatus?: string | null
  source?: 'hub' | 'stub' | 'hub-offline'
}

const ROUNDS: Array<{ at: number; phase: string; detail: string; petWon?: boolean }> = [
  { at: 0,    phase: 'matched',         detail: 'Opponent locked in. Stakes escrowed.' },
  { at: 2000, phase: 'round-1',         detail: 'Mira opens with a calm rebuttal.' },
  { at: 4500, phase: 'round-2',         detail: 'Rusty fires back with stats.' },
  { at: 7000, phase: 'round-3',         detail: 'Closing arguments — both pets land clean lines.' },
  { at: 9000, phase: 'deliberating',    detail: 'Judge pet casts a vote over AXL...' },
  { at: 11000, phase: 'verdict',        detail: 'Mira wins by judge verdict. Belt minted to ENS.', petWon: true },
]

/** Queue route stub ids only: `battle_<base36>` — not Hub-generated `battle-<16 hex>`. */
function isQueueStubBattleId(battleId: string): boolean {
  return /^battle_[a-z0-9]+$/.test(battleId)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const battleId = searchParams.get('battleId')
  if (!battleId) {
    return Response.json({ error: 'battleId required' }, { status: 400 })
  }

  const hubStatus = await callHub<StatusResp>(
    `/api/battle/status?battleId=${encodeURIComponent(battleId)}`,
    { method: 'GET', timeoutMs: 12_000 },
  )
  if (hubStatus) {
    const payout = hubStatus.payoutTxHash ?? null
    return Response.json({
      ...hubStatus,
      payoutTxHash:          payout,
      settlementTxHash:      hubStatus.settlementTxHash ?? payout,
      source:                'hub' as const,
    })
  }

  if (!isQueueStubBattleId(battleId)) {
    return Response.json({
      battleId,
      elapsedMs: 0,
      events: [],
      current: {
        at:      0,
        phase:   'hub-offline',
        detail:
          'Hub did not return this battle (down, timeout, or battle missing). ' +
            'Check NEXT_PUBLIC_HUB_URL and that the battle id exists. No demo timeline applied.',
        petWon:  undefined,
        petId:   null,
        petName: null,
        metadata: {},
      },
      finished: false,
      judgeVotes: [],
      payoutTxHash: null,
      settlementTxHash: null,
      escrowSettledOnChain: false,
      escrowOnChain: null,
      source: 'hub-offline' as const,
    })
  }

  const idMatch = battleId.match(/^battle_([a-z0-9]+)$/)
  const startedAt = idMatch ? Number.parseInt(idMatch[1], 36) : Date.now()
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
      ? [{ judge: 'tofu.tama.eth', votedFor: 'mira' }]
      : [],
    payoutTxHash: finished ? '0xabc' + battleId.slice(-12) : null,
    settlementTxHash: finished ? '0xabc' + battleId.slice(-12) : null,
    escrowSettledOnChain: false,
    source: 'stub' as const,
  })
}
