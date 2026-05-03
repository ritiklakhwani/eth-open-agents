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

const FORMATS: Array<{ id: Format; label: string; blurb: string }> = [
  { id: 'debate',    label: 'DEBATE',     blurb: 'Reasoned argument. Sage and Scholar shine.' },
  { id: 'joke-duel', label: 'JOKE DUEL',  blurb: 'Pun-off. Joker and Gremlin shine.' },
  { id: 'trivia',    label: 'TRIVIA',     blurb: 'Speed knowledge. Athlete and Scholar shine.' },
]

/** Alchemy free tier + multiple tabs → 429 if too many Hub/status polls. */
const BATTLE_STATUS_POLL_MS = 4_000

export function BattleArena({ open, onClose, petId }: BattleArenaProps) {
  const [view, setView] = useState<View>('idle')
  const [format, setFormat] = useState<Format>('debate')
  const [stake, setStake] = useState(1)
  const [match, setMatch] = useState<QueueResp | null>(null)
  const [status, setStatus] = useState<StatusResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingBattles, setPendingBattles] = useState<PendingBattle[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
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
    const fmt = (['debate', 'joke-duel', 'trivia'].includes(b.format) ? b.format : 'debate') as Format
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

  return (
    <PixelDialog
      open={open}
      onClose={() => { stopPolling(); onClose(); setTimeout(reset, 200) }}
      title="ARENA — BATTLE"
      size="lg"
    >
      {view === 'idle' && (
        <div className="flex flex-col gap-5">
          <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)]">
            Pick a format. Stake escrowed via BattleEscrow. One judge pet on a
            separate AXL node deliberates. Winner takes the pot, plus an ENS belt.
          </p>

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

          <div>
            <h4 className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest uppercase text-[color:var(--color-ink-low)] mb-2">
              FORMAT
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {FORMATS.map((f) => {
                const active = format === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={[
                      'cursor-pointer text-left border p-3 transition-colors',
                      active
                        ? 'bg-[color:var(--color-yellow)]/10 border-[color:var(--color-yellow)]/60'
                        : 'bg-[rgba(10,12,46,0.55)] border-[color:var(--color-yellow)]/15 hover:border-[color:var(--color-yellow)]/35 hover:bg-[rgba(10,12,46,0.75)]',
                    ].join(' ')}
                  >
                    <div className="font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-yellow)] mb-1">
                      {f.label}
                    </div>
                    <div className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-mid)]">
                      {f.blurb}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <h4 className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest uppercase text-[color:var(--color-ink-low)] mb-2">
              STAKE (USDC)
            </h4>
            <div className="flex gap-2">
              {[1, 5, 10, 25].map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(v)}
                  className={[
                    'cursor-pointer border-4 px-4 py-2 font-[family-name:var(--font-pixel)] text-sm transition-none',
                    stake === v
                      ? 'bg-[color:var(--color-yellow)] text-[color:var(--color-bg-deep)] border-[color:var(--color-bg-deep)]'
                      : 'bg-[color:var(--color-bg-mid)] text-[color:var(--color-ink)] border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-hi)]',
                  ].join(' ')}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)]">
              ! {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <PixelButton variant="ghost" onClick={onClose}>Close</PixelButton>
            <PixelButton variant="danger" onClick={startBattle}>★ Find Match</PixelButton>
          </div>
        </div>
      )}

      {view === 'queueing' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-cyan)] animate-blink">
            ▒ MATCHMAKING ▒
          </div>
        </div>
      )}

      {view === 'live' && match && (
        <div className="flex flex-col gap-4">
          <div className="sticky top-0 z-10 space-y-3 border-b-4 border-[color:var(--color-pink)] bg-[color:var(--color-bg-mid)] pb-3 pt-1 shadow-[0_4px_0_0_var(--color-bg-deep)]">
            <p className="font-[family-name:var(--font-pixel)] text-[10px] uppercase leading-relaxed tracking-widest text-[color:var(--color-yellow)]">
              ★ Stake USDC here first — &quot;Join / open battle&quot; does not send on-chain stakes. Scroll down for
              match info and live feed.
            </p>
            <BattleEscrowStakePanel key={match.battleId} match={match} />
          </div>

          <PixelCard variant="pink" title="MATCH">
            <div className="flex items-center justify-between gap-4">
              <Combatant label="YOU" value={`pet #${match.petId}`} color="var(--color-pink)" />
              <span className="font-[family-name:var(--font-pixel)] text-2xl text-[color:var(--color-yellow)]">VS</span>
              <Combatant label="OPP" value={match.opponent.name} color="var(--color-cyan)" />
            </div>
            <div className="mt-3 flex justify-between text-[10px] font-[family-name:var(--font-pixel)] uppercase tracking-widest">
              <span className="text-[color:var(--color-ink-low)]">{match.format.toUpperCase()}</span>
              <span className="text-[color:var(--color-yellow)]">STAKE {match.stakeUsdc} USDC</span>
            </div>
          </PixelCard>

          <PixelCard variant="cyan" title="CURRENT STATUS">
            <div className="flex flex-col gap-2">
              <Row
                label="PHASE"
                value={
                  (status
                    ? status.current.phase
                    : 'setup — stakes / poll not started'
                  ).toUpperCase()
                }
                valueColor="var(--color-cyan)"
              />
              <Row
                label="ELAPSED"
                value={`${Math.round((status?.elapsedMs ?? 0) / 1000)}s / ~90s`}
                valueColor="var(--color-yellow)"
              />
              <Row
                label="SOURCE"
                value={
                  !status
                    ? 'LOADING… (scroll up for stake panel)'
                    : status.source === 'hub'
                      ? 'LIVE HUB + AXL'
                      : status.source === 'hub-offline'
                        ? 'HUB UNAVAILABLE (no stub for this id)'
                        : 'DEMO STUB (offline queue id)'
                }
                valueColor={
                  !status
                    ? 'var(--color-ink-mid)'
                    : status.source === 'hub'
                      ? 'var(--color-lime)'
                      : status.source === 'hub-offline'
                        ? 'var(--color-red)'
                        : 'var(--color-yellow)'
                }
              />
              <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink)]">
                {status?.current.detail ?? (
                  <>
                    Use the <strong>stake panel at the top</strong> (scroll up if needed): Approve + Stake for on-chain
                    pet1, then pet2. The timeline below updates from the Hub while you stake.
                  </>
                )}
              </p>
            </div>
          </PixelCard>

          <PixelCard variant="default" title="ESCROW (CHAIN)">
            {status?.escrowOnChain ? (
              <div className="flex flex-col gap-1 font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink)]">
                <Row
                  label="PET1 STAKED"
                  value={status.escrowOnChain.pet1Staked ? 'yes' : 'no'}
                  valueColor={status.escrowOnChain.pet1Staked ? 'var(--color-lime)' : 'var(--color-yellow)'}
                />
                <Row
                  label="PET2 STAKED"
                  value={status.escrowOnChain.pet2Staked ? 'yes' : 'no'}
                  valueColor={status.escrowOnChain.pet2Staked ? 'var(--color-lime)' : 'var(--color-yellow)'}
                />
                <Row
                  label="SETTLED"
                  value={status.escrowOnChain.settled ? 'yes' : 'no'}
                  valueColor={status.escrowOnChain.settled ? 'var(--color-lime)' : 'var(--color-ink-mid)'}
                />
              </div>
            ) : (
              <p className="font-[family-name:var(--font-pixel-readable)] text-xs text-[color:var(--color-ink-mid)]">
                {status?.source === 'hub'
                  ? 'RPC read pending or battle not registered on BattleEscrow yet.'
                  : 'Chain snapshot only with live Hub status.'}
              </p>
            )}
          </PixelCard>

          <PixelCard variant="default" title="TRACKS IN PLAY">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <TrackPill label="Gensyn AXL" value="debate + judges" />
              <TrackPill label="BattleEscrow" value="stake both pets, then fight" />
              <TrackPill label="ENS" value="winner belt" />
            </div>
          </PixelCard>

          <PixelCard variant="default" title="JUDGE (AXL NODE)">
            <ul className="flex flex-col gap-1">
              {match.judges.map((j) => (
                <li key={j.tokenId} className="flex justify-between font-[family-name:var(--font-pixel-readable)] text-sm">
                  <span className="text-[color:var(--color-ink)]">{j.name}</span>
                  <span className="text-[color:var(--color-cyan)]">{j.ensName}</span>
                </li>
              ))}
            </ul>
          </PixelCard>

          <PixelCard variant="default" title="LIVE FEED">
            <ul className="flex max-h-[min(36vh,280px)] flex-col gap-1 overflow-y-auto overscroll-y-contain pr-1 leading-snug">
              {(status?.events ?? []).map((e, i) => (
                <li
                  key={i}
                  className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-mid)]"
                >
                  <span className="text-[color:var(--color-pink)] mr-2">►</span>
                  <span className="text-[color:var(--color-ink-low)] mr-2">{Math.round(e.at / 1000)}s</span>
                  <span className="text-[color:var(--color-cyan)] mr-2">{e.phase.toUpperCase()}</span>
                  <span>{e.detail}</span>
                </li>
              ))}
              {(!status || status.events.length === 0) && (
                <li className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-cyan)] animate-blink">
                  ▒ WAITING FOR FIRST ROUND ▒
                </li>
              )}
            </ul>
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
          <div className="text-center py-2">
            {(() => {
              const youWon = status.winner != null ? status.winner === petId : !!status.current.petWon
              return (
                <>
            <div
              className="font-[family-name:var(--font-pixel)] text-2xl animate-pixel-bounce mb-2"
              style={{ color: youWon ? 'var(--color-lime)' : 'var(--color-red)' }}
            >
              {youWon ? '★ VICTORY ★' : '✗ DEFEAT ✗'}
            </div>
            <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink)]">
              {status.current.detail}
            </p>
                </>
              )
            })()}
          </div>

          <PixelCard variant="elevated" title="JUDGE VOTES">
            <ul className="flex flex-col gap-1">
              {status.judgeVotes.map((v, i) => (
                <li key={i} className="flex justify-between font-[family-name:var(--font-pixel-readable)] text-sm">
                  <span className="text-[color:var(--color-ink-mid)]">{v.judge}</span>
                  <span className="text-[color:var(--color-pink)]">→ {v.votedFor}</span>
                </li>
              ))}
            </ul>
          </PixelCard>

          <PixelCard variant="default" title="TRACK INTEGRATIONS">
            <Row
              label="GENSYN AXL"
              value={`${status.judgeVotes.length} judge vote(s) collected`}
              valueColor="var(--color-cyan)"
            />
            <Row
              label="USDC PAYOUT"
              value={
                status.settlementTxHash && status.escrowSettledOnChain
                  ? `settle tx ${short(status.settlementTxHash)}`
                  : status.escrowSettledOnChain
                    ? 'recorded'
                    : 'not completed on-chain'
              }
              valueColor={
                status.settlementTxHash && status.escrowSettledOnChain ? 'var(--color-lime)' : 'var(--color-yellow)'
              }
            />
            {status.settlementTxHash && status.escrowSettledOnChain && (
              <p className="font-mono text-[10px] mt-1">
                <a
                  className="text-[color:var(--color-cyan)] underline"
                  href={`https://sepolia.etherscan.io/tx/${status.settlementTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  sepolia.etherscan.io ↗
                </a>
              </p>
            )}
            <Row
              label="ENS BELT"
              value="Hub updates tama.belts.debate for winner"
              valueColor="var(--color-yellow)"
            />
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

function Combatant({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-ink-low)]">
        {label}
      </span>
      <span className="font-[family-name:var(--font-pixel)] text-base" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2 mb-1">
      <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-ink-low)] shrink-0">
        {label}
      </span>
      <span className="font-[family-name:var(--font-pixel-readable)] text-sm truncate" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  )
}

function TrackPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-[color:var(--color-border)] bg-[color:var(--color-bg-mid)] p-2">
      <div className="font-[family-name:var(--font-pixel)] text-[9px] uppercase tracking-widest text-[color:var(--color-pink)]">
        {label}
      </div>
      <div className="font-[family-name:var(--font-pixel-readable)] text-xs text-[color:var(--color-ink-mid)]">
        {value}
      </div>
    </div>
  )
}

function short(s: string): string {
  if (s.length <= 16) return s
  return `${s.slice(0, 8)}…${s.slice(-6)}`
}
