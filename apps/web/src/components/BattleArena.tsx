'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { PixelDialog, PixelButton, PixelCard } from './ui'
import { BattleEscrowStakePanel } from './BattleEscrowStakePanel'
import { useActivityEvents } from '@/hooks/useActivityEvents'

interface BattleArenaProps {
  open: boolean
  onClose: () => void
  petId: number
}

interface PetIdentity {
  tokenId: number
  name: string
  ensName: string
  spriteUrl: string
}

interface QueueResp {
  battleId: string
  /** keccak256(utf8(battleId)) — BattleEscrow createBattle/stake/settle key */
  escrowBattleKey?: string
  /** Hub pet_a / on-chain BattleEscrow pet1 — needed when this tab is the opponent. */
  escrowPet1TokenId?: number
  petId: number
  opponent: { tokenId: number; name: string; ensName: string }
  judges: Array<{ tokenId: number; name: string; ensName: string }>
  format: string
  stakeUsdc: number
  status: string
}

interface StatusEvent {
  at: number
  phase: string
  detail: string
  petWon?: boolean
  petId?: number | null
  petName?: string | null
  metadata?: Record<string, unknown>
}
interface JudgeVote { judge: string; votedFor: string; reasoning?: string }
interface StatusResp {
  battleId: string
  elapsedMs: number
  events: StatusEvent[]
  current: StatusEvent
  finished: boolean
  judgeVotes: JudgeVote[]
  payoutTxHash: string | null
  settlementTxHash?: string | null
  winner?: number | null
  status?: string
  escrowSettledOnChain?: boolean
  escrowOnChain?: { pet1Staked: boolean; pet2Staked: boolean; settled: boolean } | null
  settlementError?: string | null
  workerOnChainStatus?: string | null
  source?: 'hub' | 'stub' | 'hub-offline'
  judges?: Array<{ petId: number; score: number; reasoning?: string }>
}

type View = 'idle' | 'queueing' | 'live' | 'done'
type Format = 'debate' | 'joke-duel' | 'trivia'

interface PendingBattle {
  battleId: string
  escrowBattleKey: string
  escrowPet1TokenId?: number
  yourPetId: number
  opponentPetId: number
  opponentName: string
  opponentEnsName: string
  role: 'initiator' | 'opponent'
  stakeUsdc: number
  format: string
}

const PRIMARY_FORMAT = {
  id: 'joke-duel' as const,
  label: 'JOKE DUEL',
  blurb: 'Clean roast battle. Two pets trade lines, the judge picks the funniest one, and the winner takes the pot.',
}

/** Alchemy free tier + multiple tabs → 429 if too many Hub/status polls. */
const BATTLE_STATUS_POLL_MS = 4_000

export function BattleArena({ open, onClose, petId }: BattleArenaProps) {
  const [view, setView] = useState<View>('idle')
  const [format] = useState<Format>('joke-duel')
  const [stake, setStake] = useState(1)
  const [match, setMatch] = useState<QueueResp | null>(null)
  const [status, setStatus] = useState<StatusResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingBattles, setPendingBattles] = useState<PendingBattle[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [petIdentities, setPetIdentities] = useState<Record<number, PetIdentity>>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptViewportRef = useRef<HTMLDivElement | null>(null)
  const transcriptTailRef = useRef<HTMLDivElement | null>(null)
  /** Avoid applying status / "done" from a stale poll or socket after match.battleId changes. */
  const matchBattleIdRef = useRef<string | null>(null)

  useEffect(() => {
    matchBattleIdRef.current = match?.battleId ?? null
  }, [match?.battleId])

  const pollStatus = useCallback(async (battleId: string) => {
    stopPolling()
    const fetchOne = async () => {
      try {
        const res = await fetch(`/api/battle/status?battleId=${battleId}`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as StatusResp
        if (json.battleId !== battleId || matchBattleIdRef.current !== battleId) return
        setStatus(json)
        if (json.finished && matchBattleIdRef.current === battleId) {
          stopPolling()
          setView('done')
        }
      } catch {
        // transient; keep polling
      }
    }
    await fetchOne()
    pollRef.current = setInterval(fetchOne, BATTLE_STATUS_POLL_MS)
  }, [])

  useEffect(() => {
    if (!open || view !== 'live' || !match?.battleId) return
    setStatus(null)
    void pollStatus(match.battleId)
    return () => {
      stopPolling()
    }
  }, [open, view, match?.battleId, pollStatus])

  useEffect(() => {
    if (!open) {
      stopPolling()
    }
  }, [open])

  useEffect(() => {
    if (!open || view !== 'idle') return
    let cancelled = false
    setPendingLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/battle/pending-for-pet?petId=${petId}`, { cache: 'no-store' })
        const data = (await res.json()) as { battles?: PendingBattle[] }
        if (!cancelled) setPendingBattles(Array.isArray(data.battles) ? data.battles : [])
      } catch {
        if (!cancelled) setPendingBattles([])
      } finally {
        if (!cancelled) setPendingLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, petId, view])

  // Subscribe to live Hub activity. When the worker emits battle-result, we
  // know the real fight finished — flip to "done" with the actual winner +
  // settlement text, even if our deterministic stub timeline wasn't done yet.
  const { events: activityEvents } = useActivityEvents(
    open ? petId : null,
    ['battle-result', 'battle-progress'],
  )

  useEffect(() => {
    if (activityEvents.length === 0) return
    const latest = activityEvents[activityEvents.length - 1]
    if (!latest.battleId) return
    if (!match || latest.battleId !== match.battleId) return
    if (latest.type === 'battle-progress') {
      void pollStatus(latest.battleId)
      return
    }
    if (latest.type !== 'battle-result') return
    stopPolling()
    void (async () => {
      try {
        const res = await fetch(
          `/api/battle/status?battleId=${encodeURIComponent(latest.battleId!)}`,
          { cache: 'no-store' },
        )
        if (res.ok) {
          const data = (await res.json()) as StatusResp
          const bid = latest.battleId!
          if (data.battleId === bid && matchBattleIdRef.current === bid) {
            setStatus(data)
            setView('done')
          }
          return
        }
      } catch {
        /* fallback */
      }
      const bid = latest.battleId!
      if (matchBattleIdRef.current !== bid) return
      const youWon = latest.winner === petId
      const onChain = String(latest.onChainStatus ?? 'unknown')
      const hubLikeStatus =
        onChain === 'settle-submitted'
          ? 'settled'
          : (latest.winner ?? 0) > 0
            ? 'judged'
            : 'error'
      const settleHash = latest.settlementTxHash ?? null
      setStatus({
        battleId: bid,
        elapsedMs: 0,
        events: [],
        current: {
          at: 0,
          phase: hubLikeStatus === 'error' ? 'error' : 'verdict',
          detail: latest.text ?? `Pet ${latest.winner} wins!`,
          petWon: youWon,
        },
        finished: true,
        judgeVotes: [],
        payoutTxHash: settleHash,
        settlementTxHash: settleHash,
        winner: latest.winner ?? null,
        status: hubLikeStatus,
        source: 'hub',
        escrowSettledOnChain: onChain === 'settle-submitted',
        settlementError: latest.settlementError ?? null,
        workerOnChainStatus: latest.onChainStatus ?? null,
      })
      setView('done')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityEvents, match, pollStatus])

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function startBattle() {
    setView('queueing')
    setError(null)
    try {
      const res = await fetch('/api/battle/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId, stakeUsdc: stake, format }),
      })
      if (!res.ok) {
        const { error: e } = (await res.json()) as { error?: string }
        throw new Error(e ?? `queue failed (${res.status})`)
      }
      const json = (await res.json()) as QueueResp
      matchBattleIdRef.current = json.battleId
      setMatch(json)
      setView('live')
    } catch (err) {
      setError((err as Error).message)
      setView('idle')
    }
  }

  function reset() {
    stopPolling()
    matchBattleIdRef.current = null
    setView('idle')
    setMatch(null)
    setStatus(null)
    setError(null)
  }

  function resumeBattle(b: PendingBattle) {
    const fmt = (['debate', 'joke-duel', 'trivia'].includes(b.format) ? b.format : 'joke-duel') as Format
    const escrowPet1 =
      b.escrowPet1TokenId ?? (b.role === 'initiator' ? b.yourPetId : b.opponentPetId)
    matchBattleIdRef.current = b.battleId
    setMatch({
      battleId: b.battleId,
      escrowBattleKey: b.escrowBattleKey,
      escrowPet1TokenId: escrowPet1,
      petId: b.yourPetId,
      opponent: {
        tokenId: b.opponentPetId,
        name: b.opponentName,
        ensName: b.opponentEnsName,
      },
      judges: [],
      format: fmt,
      stakeUsdc: b.stakeUsdc,
      status: 'matched',
    })
    setError(null)
    setView('live')
  }

  const judgeFromEvents = findJudgePetId(status)
  const judgeTokenId = match?.judges[0]?.tokenId ?? status?.judges?.[0]?.petId ?? judgeFromEvents ?? null
  const judge = match?.judges[0] ?? (judgeTokenId ? { tokenId: judgeTokenId, name: `pet-${judgeTokenId}`, ensName: `pet-${judgeTokenId}.tama.eth` } : null)
  const youIdentity = petIdentities[petId]
  const opponentIdentity = match ? petIdentities[match.opponent.tokenId] : undefined
  const judgeIdentity = judgeTokenId ? petIdentities[judgeTokenId] : undefined
  const transcript = buildBattleTranscript(
    status?.events ?? [],
    match,
    petId,
    judgeIdentity?.name ?? judge?.name ?? 'judge',
    petIdentities,
  )
  const youWon = status ? (status.winner != null ? status.winner === petId : !!status.current.petWon) : false
  const stepStates = getBattleFlowStates(status, transcript)

  useEffect(() => {
    const ids = [petId, match?.opponent.tokenId, judgeTokenId].filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value),
    )
    if (!open || ids.length === 0) return

    const missing = ids.filter((id) => !petIdentities[id])
    if (missing.length === 0) return

    let cancelled = false
    ;(async () => {
      try {
        const responses = await Promise.all(
          missing.map(async (id) => {
            const res = await fetch(`/api/pets/${id}`, { cache: 'no-store' })
            const json = (await res.json()) as {
              pet?: { name?: string; ensName?: string; spriteUrl?: string; tokenId?: number }
            }
            const pet = json.pet
            return pet
              ? ({
                  tokenId: pet.tokenId ?? id,
                  name: pet.name ?? `pet-${id}`,
                  ensName: pet.ensName ?? `${pet.name ?? `pet-${id}`}.tama.eth`,
                  spriteUrl: pet.spriteUrl ?? '/sprites/sage.png',
                } satisfies PetIdentity)
              : null
          }),
        )
        if (cancelled) return
        setPetIdentities((prev) => {
          const next = { ...prev }
          for (const pet of responses) {
            if (pet) next[pet.tokenId] = pet
          }
          return next
        })
      } catch {
        // best effort only; existing names from match still render
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, petId, match?.opponent.tokenId, judgeTokenId, petIdentities])

  useEffect(() => {
    if (!open || transcript.length === 0) return
    const latest = transcript[transcript.length - 1]
    if (latest.kind === 'system') return
    const t = window.setTimeout(() => {
      transcriptTailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 140)
    return () => window.clearTimeout(t)
  }, [open, transcript.length])

  return (
    <PixelDialog
      open={open}
      onClose={() => { stopPolling(); onClose(); setTimeout(reset, 200) }}
      title="ARENA — BATTLE"
      size="lg"
    >
      {view === 'idle' && (
        <div className="flex flex-col gap-5">
          <PixelCard variant="warm" title="JOKE DUEL">
            <div className="flex flex-col gap-4">
              <p className="font-[family-name:var(--font-pixel-readable)] text-sm leading-7 text-[color:var(--color-ink)]">
                Pick one clean roast battle, choose the stake, then match. After both owners fund, approve, and stake,
                the two pets trade jokes, the judge pet decides, and the result lands as a simple win or loss.
              </p>
              <div className="border border-[color:var(--color-yellow)]/30 bg-[rgba(10,12,46,0.55)] p-4">
                <div className="mb-2 font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-yellow)]">
                  {PRIMARY_FORMAT.label}
                </div>
                <p className="font-[family-name:var(--font-pixel-readable)] text-sm leading-7 text-[color:var(--color-ink-mid)]">
                  {PRIMARY_FORMAT.blurb}
                </p>
              </div>
            </div>
          </PixelCard>

          {pendingLoading && (
            <p className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-cyan)] tracking-widest animate-blink">
              LOADING ACTIVE BATTLES…
            </p>
          )}

          {pendingBattles.length > 0 && (
            <PixelCard variant="cyan" title="ACTIVE MATCH — SAME BATTLE ID">
              <p className="font-[family-name:var(--font-pixel-readable)] text-xs text-[color:var(--color-ink-mid)] mb-3">
                If someone matched you, open the same battle here to stake as <strong>pet2</strong>. You must
                control this URL&apos;s pet (e.g. <code className="font-mono">?pet=</code>) and connect the wallet
                that owns that NFT.
              </p>
              <ul className="flex flex-col gap-3">
                {pendingBattles.map((b) => (
                  <li
                    key={b.battleId}
                    className="border-2 border-[color:var(--color-border)] bg-[color:var(--color-bg-mid)] p-3 flex flex-col gap-2"
                  >
                    <div className="flex flex-wrap justify-between gap-2 items-baseline">
                      <span
                        className={[
                          'font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest',
                          b.role === 'opponent' ? 'text-[color:var(--color-yellow)]' : 'text-[color:var(--color-lime)]',
                        ].join(' ')}
                      >
                        {b.role === 'opponent' ? '◆ Opponent — join & stake' : '◇ Your match — continue'}
                      </span>
                      <span className="font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-yellow)]">
                        {b.stakeUsdc} USDC
                      </span>
                    </div>
                    <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink)]">
                      vs <span className="text-[color:var(--color-cyan)]">{b.opponentName}</span>{' '}
                      <span className="text-[color:var(--color-ink-low)] text-xs">({b.opponentEnsName})</span>
                    </p>
                    <p className="font-mono text-[10px] text-[color:var(--color-ink-low)] truncate" title={b.battleId}>
                      {b.battleId}
                    </p>
                    <PixelButton variant="primary" className="self-start" onClick={() => resumeBattle(b)}>
                      Open battle & stake
                    </PixelButton>
                  </li>
                ))}
              </ul>
            </PixelCard>
          )}

          <PixelCard variant="warm" title="STAKE">
            <h4 className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest uppercase text-[color:var(--color-ink-low)] mb-2">
              STAKE (USDC)
            </h4>
            <div className="flex flex-wrap gap-2">
              {[1, 5, 10, 25].map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(v)}
                  className={[
                    'cursor-pointer border-4 px-4 py-2 font-[family-name:var(--font-pixel)] text-sm transition-none',
                    stake === v
                      ? 'bg-[color:var(--color-yellow)] text-[color:var(--color-bg-deep)] border-[color:var(--color-bg-deep)]'
                      : 'bg-[rgba(10,12,46,0.55)] text-[color:var(--color-ink)] border-[color:var(--color-yellow)]/25 hover:bg-[rgba(10,12,46,0.8)]',
                  ].join(' ')}
                >
                  {v}
                </button>
              ))}
            </div>
          </PixelCard>

          {error && (
            <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)]">
              ! {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <PixelButton variant="ghost" onClick={onClose}>Close</PixelButton>
            <PixelButton variant="danger" onClick={startBattle}>★ Start Joke Duel</PixelButton>
          </div>
        </div>
      )}

      {view === 'queueing' && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-cyan)] animate-blink">
            ▒ FINDING A JOKE DUEL ▒
          </div>
          <p className="max-w-xl font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-mid)]">
            Looking for one opponent and one judge. The arena will open as soon as the match is locked.
          </p>
        </div>
      )}

      {view === 'live' && match && (
        <div className="flex flex-col gap-4">
          <PixelCard variant="pink" title="ARENA FLOOR">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <ArenaPerson
                label="YOU"
                value={youIdentity?.name ?? `pet-${match.petId}`}
                sub={youIdentity?.ensName ?? formatDisplayLabel(match.format)}
                color="var(--color-pink)"
                spriteUrl={youIdentity?.spriteUrl}
              />
              <div className="flex flex-col items-center gap-2">
                <div className="font-[family-name:var(--font-pixel)] text-4xl text-[color:var(--color-yellow)]">VS</div>
                <div className="flex items-center gap-2 rounded-full border border-[color:var(--color-yellow)]/35 bg-[rgba(10,12,46,0.55)] px-3 py-1">
                  <PixelSprite
                    src={judgeIdentity?.spriteUrl}
                    alt={judgeIdentity?.name ?? judge?.name ?? 'judge'}
                    size={28}
                    ring="var(--color-yellow)"
                  />
                  <div className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest text-[color:var(--color-yellow)]">
                    {judge ? `JUDGE · ${judgeIdentity?.name ?? judge.name}` : 'JUDGE READY'}
                  </div>
                </div>
              </div>
              <ArenaPerson
                label="OPP"
                value={opponentIdentity?.name ?? match.opponent.name}
                sub={opponentIdentity?.ensName ?? match.opponent.ensName}
                color="var(--color-cyan)"
                spriteUrl={opponentIdentity?.spriteUrl}
              />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <MiniStat label="Mode" value="Joke Duel" color="var(--color-yellow)" />
              <MiniStat label="Stake" value={`${match.stakeUsdc} USDC`} color="var(--color-yellow)" />
              <MiniStat
                label="Status"
                value={status ? formatDisplayLabel(status.current.phase) : 'Setting up'}
                color={status?.finished ? (youWon ? 'var(--color-lime)' : 'var(--color-red)') : 'var(--color-cyan)'}
              />
            </div>
          </PixelCard>

          <PixelCard variant="cyan" title="BATTLE FLOW">
            <div className="grid gap-2 sm:grid-cols-5">
              <StepPill label="Fund" state={stepStates.fund.state} value={stepStates.fund.value} />
              <StepPill label="Approve" state={stepStates.approve.state} value={stepStates.approve.value} />
              <StepPill label="Stake" state={stepStates.stake.state} value={stepStates.stake.value} />
              <StepPill label="Duel" state={stepStates.duel.state} value={stepStates.duel.value} />
              <StepPill label="Judge" state={stepStates.judge.state} value={stepStates.judge.value} />
            </div>
            <p className="mt-4 font-[family-name:var(--font-pixel-readable)] text-[15px] leading-7 text-[color:var(--color-ink)]">
              {status?.current.detail ??
                'Fund the pet wallet, approve USDC, then stake. Once both pets are staked, the joke exchange and judge decision appear here.'}
            </p>
          </PixelCard>

          <BattleEscrowStakePanel key={match.battleId} match={match} />

          <PixelCard variant="default" title="JOKE EXCHANGE">
            <div
              ref={transcriptViewportRef}
              className="flex max-h-[min(44vh,440px)] flex-col gap-4 overflow-y-auto overscroll-y-contain pr-2 scroll-smooth"
            >
              {transcript.length > 0 ? (
                transcript.map((turn, i) => (
                  <TranscriptBubble
                    key={`${turn.kind}-${i}-${turn.phase}`}
                    kind={turn.kind}
                    align={turn.kind === 'you' ? 'right' : turn.kind === 'judge' || turn.kind === 'system' ? 'center' : 'left'}
                    speaker={turn.speaker}
                    text={turn.text}
                    spriteUrl={
                      turn.kind === 'you'
                        ? youIdentity?.spriteUrl
                        : turn.kind === 'judge' || turn.kind === 'system'
                          ? judgeIdentity?.spriteUrl
                          : opponentIdentity?.spriteUrl
                    }
                    accent={turn.kind === 'you' ? 'var(--color-pink)' : turn.kind === 'judge' ? 'var(--color-yellow)' : 'var(--color-cyan)'}
                    meta={`${Math.round(turn.at / 1000)}s · ${formatDisplayLabel(turn.phase)}`}
                    latest={i === transcript.length - 1}
                  />
                ))
              ) : (
                <div className="rounded-sm border border-[color:var(--color-yellow)]/25 bg-[rgba(10,12,46,0.45)] p-4 text-center">
                  <p className="font-[family-name:var(--font-pixel)] text-xs tracking-widest text-[color:var(--color-cyan)] animate-blink">
                    WAITING FOR THE FIRST JOKE…
                  </p>
                </div>
              )}
              <div ref={transcriptTailRef} />
            </div>
          </PixelCard>
        </div>
      )}

      {view === 'done' && status && match && (
        <div className="flex flex-col gap-5">
          {status.source === 'hub-offline' && (
            <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)] border-2 border-[color:var(--color-red)] p-2">
              Could not load battle from Hub — results below may be incomplete.
            </p>
          )}

          {status.settlementError && (
            <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-red)]">
              Escrow: {status.settlementError}
            </p>
          )}

          {status.status === 'judged' && !status.escrowSettledOnChain && status.source === 'hub' && (
            <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-yellow)]">
              Judge verdict recorded; USDC was not paid on-chain ({status.workerOnChainStatus ?? 'see events'}).
            </p>
          )}
          <PixelCard variant="pink" title={youWon ? 'YOU WON' : 'YOU LOST'}>
            <div className="text-center py-2">
              <div
                className="mb-3 font-[family-name:var(--font-pixel)] text-3xl animate-bounce-pixel"
                style={{ color: youWon ? 'var(--color-lime)' : 'var(--color-red)' }}
              >
                {youWon ? '★ VICTORY ★' : '✗ DEFEAT ✗'}
              </div>
              <p className="mx-auto max-w-2xl font-[family-name:var(--font-pixel-readable)] text-base leading-7 text-[color:var(--color-ink)]">
                {status.current.detail}
              </p>
            </div>
            <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <ArenaPerson
                label={youWon ? 'WINNER' : 'YOU'}
                value={youIdentity?.name ?? `pet-${match.petId}`}
                sub={youIdentity?.ensName ?? formatDisplayLabel(match.format)}
                color={youWon ? 'var(--color-lime)' : 'var(--color-pink)'}
                spriteUrl={youIdentity?.spriteUrl}
              />
              <div className="flex flex-col items-center gap-2">
                <PixelSprite
                  src={judgeIdentity?.spriteUrl}
                  alt={judgeIdentity?.name ?? judge?.name ?? 'judge'}
                  size={42}
                  ring="var(--color-yellow)"
                  className="animate-bounce-pixel"
                />
                <div className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest text-[color:var(--color-yellow)]">
                  {judgeIdentity?.name ?? judge?.name ?? 'judge'}
                </div>
              </div>
              <ArenaPerson
                label={youWon ? 'OPP' : 'WINNER'}
                value={opponentIdentity?.name ?? match.opponent.name}
                sub={opponentIdentity?.ensName ?? match.opponent.ensName}
                color={youWon ? 'var(--color-cyan)' : 'var(--color-lime)'}
                spriteUrl={opponentIdentity?.spriteUrl}
              />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <MiniStat label="Mode" value="Joke Duel" color="var(--color-yellow)" />
              <MiniStat label="Judge" value={judge?.name ?? 'AXL judge'} color="var(--color-cyan)" />
              <MiniStat
                label="USDC"
                value={
                  status.settlementTxHash && status.escrowSettledOnChain
                    ? `Paid out`
                    : status.escrowSettledOnChain
                      ? 'Recorded'
                      : 'Pending / skipped'
                }
                color={status.escrowSettledOnChain ? 'var(--color-lime)' : 'var(--color-yellow)'}
              />
            </div>
            {status.settlementTxHash && status.escrowSettledOnChain && (
              <p className="mt-4 text-center font-mono text-[10px]">
                <a
                  className="text-[color:var(--color-cyan)] underline"
                  href={`https://sepolia.etherscan.io/tx/${status.settlementTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View settlement tx ↗
                </a>
              </p>
            )}
          </PixelCard>

          <PixelCard variant="default" title="FINAL EXCHANGE">
            <div className="flex max-h-[min(44vh,420px)] flex-col gap-4 overflow-y-auto overscroll-y-contain pr-2 scroll-smooth">
              {transcript.map((turn, i) => (
                <TranscriptBubble
                  key={`${turn.kind}-done-${i}-${turn.phase}`}
                  kind={turn.kind}
                  align={turn.kind === 'you' ? 'right' : turn.kind === 'judge' || turn.kind === 'system' ? 'center' : 'left'}
                  speaker={turn.speaker}
                  text={turn.text}
                  spriteUrl={
                    turn.kind === 'you'
                      ? youIdentity?.spriteUrl
                      : turn.kind === 'judge' || turn.kind === 'system'
                        ? judgeIdentity?.spriteUrl
                        : opponentIdentity?.spriteUrl
                  }
                  accent={turn.kind === 'you' ? 'var(--color-pink)' : turn.kind === 'judge' ? 'var(--color-yellow)' : 'var(--color-cyan)'}
                  meta={`${Math.round(turn.at / 1000)}s · ${formatDisplayLabel(turn.phase)}`}
                  latest={i === transcript.length - 1}
                />
              ))}
            </div>
          </PixelCard>

          <div className="flex justify-end gap-3">
            <PixelButton variant="ghost" onClick={reset}>↺ Rematch</PixelButton>
            <PixelButton variant="primary" onClick={() => { onClose(); setTimeout(reset, 200) }}>
              Close
            </PixelButton>
          </div>
        </div>
      )}
    </PixelDialog>
  )
}

function ArenaPerson({
  label,
  value,
  sub,
  color,
  spriteUrl,
}: {
  label: string
  value: string
  sub: string
  color: string
  spriteUrl?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-sm border border-[color:var(--color-yellow)]/18 bg-[rgba(10,12,46,0.45)] p-4 text-center">
      <PixelSprite src={spriteUrl} alt={value} size={60} ring={color} className="animate-pet-bob" />
      <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-ink-low)]">
        {label}
      </span>
      <span className="font-[family-name:var(--font-pixel)] text-xl" style={{ color }}>
        {value}
      </span>
      <span className="font-[family-name:var(--font-pixel-readable)] text-xs text-[color:var(--color-ink-mid)]">
        {sub}
      </span>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="border border-[color:var(--color-yellow)]/18 bg-[rgba(10,12,46,0.45)] p-3">
      <div className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-ink-low)]">
        {label}
      </div>
      <div className="mt-2 font-[family-name:var(--font-pixel-readable)] text-[17px] leading-6" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

type StepState = 'idle' | 'active' | 'done'

function StepPill({ label, value, state }: { label: string; value: string; state: StepState }) {
  return (
    <div
      className={[
        'relative overflow-hidden border px-4 py-3 transition-all min-w-0',
        state === 'done'
          ? 'border-[color:var(--color-lime)]/35 bg-[rgba(16,26,44,0.82)]'
          : state === 'active'
            ? 'border-[color:var(--color-cyan)]/35 bg-[rgba(16,26,44,0.9)]'
            : 'border-[color:var(--color-yellow)]/12 bg-[rgba(15,18,52,0.72)]',
      ].join(' ')}
    >
      {state === 'active' && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] animate-pulse bg-[linear-gradient(90deg,rgba(0,0,0,0),rgba(61,241,255,0.95),rgba(0,0,0,0))]" />
      )}
      {state === 'done' && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-[linear-gradient(90deg,rgba(0,0,0,0),rgba(96,255,143,0.95),rgba(0,0,0,0))]" />
      )}
      <div className="mb-2 flex min-w-0 flex-col items-start gap-1">
        <div className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-ink-low)]">
          {label}
        </div>
        <div
          className="max-w-full truncate font-[family-name:var(--font-pixel)] text-[8px] tracking-[0.12em]"
          style={{
            color:
              state === 'done'
                ? 'var(--color-lime)'
                : state === 'active'
                  ? 'var(--color-cyan)'
                  : 'var(--color-ink-low)',
          }}
        >
          {state === 'done' ? 'DONE' : state === 'active' ? 'LIVE' : 'WAIT'}
        </div>
      </div>
      <div className="font-[family-name:var(--font-pixel-readable)] text-[13px] leading-5 text-[color:var(--color-ink)] break-words">
        {value}
      </div>
    </div>
  )
}

function PixelSprite({
  src,
  alt,
  size,
  ring,
  framed = true,
  className = '',
}: {
  src?: string
  alt: string
  size: number
  ring: string
  framed?: boolean
  className?: string
}) {
  if (!framed) {
    return src ? (
      <img
        src={src}
        alt={alt}
        className={['shrink-0 object-contain [image-rendering:pixelated] drop-shadow-[0_3px_0_rgba(10,12,46,0.45)]', className].join(' ')}
        style={{ width: size, height: size }}
      />
    ) : (
      <div className={className} style={{ width: size, height: size }} />
    )
  }
  return (
    <div
      className={['flex shrink-0 items-center justify-center overflow-hidden rounded-sm border-2 bg-[rgba(10,12,46,0.65)]', className].join(' ')}
      style={{ width: size, height: size, borderColor: ring }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain [image-rendering:pixelated]"
        />
      ) : (
        <span className="font-[family-name:var(--font-pixel)] text-[9px] text-[color:var(--color-ink-low)]">PET</span>
      )}
    </div>
  )
}

type TranscriptTurn = {
  at: number
  phase: string
  kind: 'you' | 'opp' | 'judge' | 'system'
  speaker: string
  text: string
}

function TranscriptBubble({
  kind,
  align,
  speaker,
  text,
  spriteUrl,
  accent,
  meta,
  latest,
}: {
  kind: 'you' | 'opp' | 'judge' | 'system'
  align: 'left' | 'right' | 'center'
  speaker: string
  text: string
  spriteUrl?: string
  accent: string
  meta: string
  latest?: boolean
}) {
  const wrapper =
    align === 'right' ? 'items-end text-right' : align === 'center' ? 'items-center text-center' : 'items-start text-left'
  const bubbleTone = kind === 'judge' ? 'rgba(255,245,225,0.98)' : '#fff5e1'
  const bubbleInk = '#0a0c2e'

  if (kind === 'system') {
    return (
      <div className="flex flex-col items-center gap-1 text-center animate-reveal">
        <div className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest" style={{ color: accent }}>
          {speaker}
        </div>
        <div className="rounded-full border border-[color:var(--color-yellow)]/25 bg-[rgba(10,12,46,0.55)] px-4 py-2 font-[family-name:var(--font-pixel-readable)] text-[13px] leading-5 text-[color:var(--color-ink-mid)]">
          {text}
        </div>
        <div className="font-[family-name:var(--font-pixel-readable)] text-[11px] text-[color:var(--color-ink-low)]">
          {meta}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-1 ${wrapper} ${latest ? 'animate-reveal' : ''}`}>
      <div className={`flex max-w-[96%] items-end gap-2 ${align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : ''}`}>
        <PixelSprite
          src={spriteUrl}
          alt={speaker}
          size={align === 'center' ? 34 : 42}
          ring={accent}
          framed={false}
          className={align === 'center' ? '' : 'animate-pet-bob'}
        />
        <div className={`flex flex-col gap-1 ${wrapper}`}>
          <div className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest" style={{ color: accent }}>
            {speaker}
          </div>
          <div
            className="relative w-fit max-w-[min(76%,560px)] border-2 border-[color:#0a0c2e] px-4 py-3 shadow-[4px_4px_0_0_rgba(10,12,46,0.55)]"
            style={{
              background:
                `repeating-linear-gradient(180deg, ${bubbleTone} 0px, ${bubbleTone} 4px, rgba(10,12,46,0.06) 5px, ${bubbleTone} 6px)`,
            }}
          >
            <PixelTail side={align === 'right' ? 'right' : 'left'} hidden={align === 'center'} />
            <div
              className="font-[family-name:var(--font-pixel)] text-[11px] leading-[1.55] tracking-[0.015em] whitespace-pre-wrap break-words text-center sm:text-[12px]"
              style={{ color: bubbleInk }}
            >
              {text}
            </div>
          </div>
        </div>
      </div>
      <div className="font-[family-name:var(--font-pixel-readable)] text-[11px] text-[color:var(--color-ink-low)]">
        {meta}
      </div>
    </div>
  )
}

function PixelTail({ side, hidden }: { side: 'left' | 'right'; hidden?: boolean }) {
  if (hidden) return null
  const rows = [
    { outer: 10, inner: 8, top: 0, inset: 1 },
    { outer: 8, inner: 6, top: 2, inset: 1 },
    { outer: 6, inner: 4, top: 4, inset: 1 },
    { outer: 4, inner: 2, top: 6, inset: 1 },
  ]
  return (
    <div
      className="absolute top-4"
      style={side === 'right' ? { right: -10 } : { left: -10 }}
    >
      {rows.map((row, idx) => (
        <div
          key={idx}
          className="absolute bg-[color:#0a0c2e]"
          style={{
            top: row.top,
            width: row.outer,
            height: 2,
            left: side === 'right' ? 10 - row.outer : 0,
          }}
        >
          <div
            className="absolute top-0 h-full bg-[color:#fff5e1]"
            style={{
              width: row.inner,
              left: side === 'right' ? 10 - row.outer + row.inset : row.inset,
            }}
          />
        </div>
      ))}
    </div>
  )
}

function formatDisplayLabel(value: string | null | undefined): string {
  if (!value) return 'Waiting'
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildBattleTranscript(
  events: StatusEvent[],
  match: QueueResp | null,
  petId: number,
  judgeName: string,
  identities: Record<number, PetIdentity>,
): TranscriptTurn[] {
  if (!match) return []

  const turns: TranscriptTurn[] = []
  for (const e of events) {
    const phase = e.phase.toLowerCase()
    if (phase.startsWith('round-')) {
      const speakerPetId = typeof e.metadata?.speakerPetId === 'number'
        ? e.metadata.speakerPetId
        : typeof e.petId === 'number'
          ? e.petId
          : null
      const extracted = extractQuotedText(e.detail)
      const isThinking = phase.includes('thinking') || e.detail.toLowerCase().includes('preparing')
      const kind =
        isThinking
          ? 'system'
          : speakerPetId === petId
          ? 'you'
          : speakerPetId === match.opponent.tokenId
            ? 'opp'
            : e.detail.includes(match.opponent.name) || e.detail.includes(match.opponent.ensName)
              ? 'opp'
              : 'you'
      turns.push({
        at: e.at,
        phase: e.phase,
        kind,
        speaker:
          kind === 'you'
            ? identities[petId]?.name ?? 'You'
            : kind === 'opp'
              ? identities[match.opponent.tokenId]?.name ?? match.opponent.name
              : kind === 'system'
                ? speakerPetId === petId
                  ? identities[petId]?.name ?? 'You'
                  : identities[match.opponent.tokenId]?.name ?? match.opponent.name
                : match.opponent.name,
        text: normalizeBattleLine(extracted ?? e.detail, petId, match, identities),
      })
      continue
    }

    if (phase === 'judging' || phase === 'votes' || phase === 'verdict' || phase === 'battle-result') {
      turns.push({
        at: e.at,
        phase: e.phase,
        kind: 'judge',
        speaker: judgeName,
        text: normalizeBattleLine(e.detail, petId, match, identities),
      })
    }
  }
  return turns
}

function normalizeBattleLine(
  text: string,
  petId: number,
  match: QueueResp,
  identities: Record<number, PetIdentity>,
): string {
  const yourName = identities[petId]?.name ?? `pet-${petId}`
  const oppId = match.opponent.tokenId
  const oppName = identities[oppId]?.name ?? match.opponent.name
  return text
    .replace(new RegExp(`\\b[Pp]et\\s+#?${petId}\\b`, 'g'), yourName)
    .replace(new RegExp(`\\b[Pp]et\\s+#?${oppId}\\b`, 'g'), oppName)
}

function findJudgePetId(status: StatusResp | null): number | null {
  if (!status) return null
  for (let i = status.events.length - 1; i >= 0; i -= 1) {
    const metadata = status.events[i]?.metadata
    if (!metadata) continue
    const judgePetIds = metadata.judgePetIds
    if (Array.isArray(judgePetIds) && typeof judgePetIds[0] === 'number') {
      return judgePetIds[0]
    }
  }
  return null
}

function extractQuotedText(detail: string): string | null {
  const match = detail.match(/"([^"]+)"/)
  return match?.[1] ?? null
}

function short(s: string): string {
  if (s.length <= 16) return s
  return `${s.slice(0, 8)}…${s.slice(-6)}`
}

function getBattleFlowStates(
  status: StatusResp | null,
  transcript: TranscriptTurn[],
): Record<'fund' | 'approve' | 'stake' | 'duel' | 'judge', { state: StepState; value: string }> {
  const phase = status?.current.phase.toLowerCase() ?? ''
  const bothStaked = !!status?.escrowOnChain?.pet1Staked && !!status?.escrowOnChain?.pet2Staked
  const hasTranscript = transcript.some((t) => t.kind === 'you' || t.kind === 'opp')
  const hasJudge = transcript.some((t) => t.kind === 'judge')

  const laterThanCreate = phase.includes('escrow-created') || phase.includes('escrow-stakes') || hasTranscript || hasJudge || !!status?.finished

  return {
    fund: {
      state: laterThanCreate ? 'done' as StepState : 'active' as StepState,
      value: laterThanCreate ? 'Wallet primed' : 'Start here',
    },
    approve: {
      state: laterThanCreate ? 'done' as StepState : phase.includes('escrow-create') ? 'active' as StepState : 'idle' as StepState,
      value: laterThanCreate ? 'Allowance ready' : 'Pet wallet',
    },
    stake: {
      state: bothStaked ? 'done' as StepState : phase.includes('escrow-stakes') ? 'active' as StepState : 'idle' as StepState,
      value: bothStaked ? 'Both locked' : phase.includes('escrow-stakes') ? 'Confirming' : 'Escrow',
    },
    duel: {
      state: hasTranscript ? (status?.finished ? 'done' : 'active') as StepState : 'idle' as StepState,
      value: hasTranscript ? `${transcript.filter((t) => t.kind === 'you' || t.kind === 'opp').length} punchlines` : 'Waiting',
    },
    judge: {
      state: status?.finished ? 'done' as StepState : hasJudge || phase.includes('judging') || phase.includes('votes') ? 'active' as StepState : 'idle' as StepState,
      value: status?.finished ? 'Decision in' : hasJudge || phase.includes('judging') ? 'Deliberating' : 'Stand by',
    },
  }
}
