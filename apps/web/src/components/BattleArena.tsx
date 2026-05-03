'use client'

import { useEffect, useState, useRef } from 'react'
import { PixelDialog, PixelButton, PixelCard } from './ui'
import { useActivityEvents } from '@/hooks/useActivityEvents'

interface BattleArenaProps {
  open: boolean
  onClose: () => void
  petId: number
}

interface QueueResp {
  battleId: string
  petId: number
  opponent: { tokenId: number; name: string; ensName: string }
  judges: Array<{ tokenId: number; name: string; ensName: string }>
  format: string
  stakeUsdc: number
  status: string
}

interface StatusEvent { at: number; phase: string; detail: string; petWon?: boolean }
interface JudgeVote { judge: string; votedFor: string }
interface StatusResp {
  battleId: string
  elapsedMs: number
  events: StatusEvent[]
  current: StatusEvent
  finished: boolean
  judgeVotes: JudgeVote[]
  payoutTxHash: string | null
}

type View = 'idle' | 'queueing' | 'live' | 'done'
type Format = 'debate' | 'joke-duel' | 'trivia'

const FORMATS: Array<{ id: Format; label: string; blurb: string }> = [
  { id: 'debate',    label: 'DEBATE',     blurb: 'Reasoned argument. Sage and Scholar shine.' },
  { id: 'joke-duel', label: 'JOKE DUEL',  blurb: 'Pun-off. Joker and Gremlin shine.' },
  { id: 'trivia',    label: 'TRIVIA',     blurb: 'Speed knowledge. Athlete and Scholar shine.' },
]

export function BattleArena({ open, onClose, petId }: BattleArenaProps) {
  const [view, setView] = useState<View>('idle')
  const [format, setFormat] = useState<Format>('debate')
  const [stake, setStake] = useState(1)
  const [match, setMatch] = useState<QueueResp | null>(null)
  const [status, setStatus] = useState<StatusResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!open) {
      stopPolling()
    }
  }, [open])

  // Subscribe to live Hub activity. When the worker emits battle-result, we
  // know the real fight finished — flip to "done" with the actual winner +
  // settlement text, even if our deterministic stub timeline wasn't done yet.
  const { events: activityEvents } = useActivityEvents(
    open ? petId : null,
    'battle-result',
  )

  useEffect(() => {
    if (activityEvents.length === 0) return
    const latest = activityEvents[activityEvents.length - 1]
    if (latest.type !== 'battle-result' || !latest.battleId) return
    if (!match || latest.battleId !== match.battleId) return
    // Synthesize a "done" status from the real result
    const youWon = latest.winner === petId
    setStatus((prev) => ({
      battleId: latest.battleId!,
      elapsedMs: prev?.elapsedMs ?? 0,
      events: prev?.events ?? [],
      current: {
        at: 0,
        phase: 'verdict',
        detail: latest.text ?? `Pet ${latest.winner} wins!`,
        petWon: youWon,
      },
      finished: true,
      judgeVotes: prev?.judgeVotes ?? [],
      payoutTxHash: prev?.payoutTxHash ?? null,
    }))
    setView('done')
    stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityEvents, match])

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
      setMatch(json)
      setView('live')
      void pollStatus(json.battleId)
    } catch (err) {
      setError((err as Error).message)
      setView('idle')
    }
  }

  async function pollStatus(battleId: string) {
    stopPolling()
    const fetchOne = async () => {
      try {
        const res = await fetch(`/api/battle/status?battleId=${battleId}`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as StatusResp
        setStatus(json)
        if (json.finished) {
          stopPolling()
          setView('done')
        }
      } catch {
        // transient; keep polling
      }
    }
    await fetchOne()
    pollRef.current = setInterval(fetchOne, 1000)
  }

  function reset() {
    stopPolling()
    setView('idle')
    setMatch(null)
    setStatus(null)
    setError(null)
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
            Pick a format. Stake escrowed via BattleEscrow. Three judge pets on
            separate AXL nodes deliberate. Winner takes the pot, plus an ENS belt.
          </p>

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

          <PixelCard variant="default" title="JUDGES (AXL NODES)">
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
            <ul className="flex flex-col gap-1">
              {(status?.events ?? []).map((e, i) => (
                <li
                  key={i}
                  className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-mid)]"
                >
                  <span className="text-[color:var(--color-pink)] mr-2">►</span>
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
          <div className="text-center py-2">
            <div
              className="font-[family-name:var(--font-pixel)] text-2xl animate-pixel-bounce mb-2"
              style={{ color: status.current.petWon ? 'var(--color-lime)' : 'var(--color-red)' }}
            >
              {status.current.petWon ? '★ VICTORY ★' : '✗ DEFEAT ✗'}
            </div>
            <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink)]">
              {status.current.detail}
            </p>
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

          {status.payoutTxHash && (
            <PixelCard variant="default">
              <Row label="ESCROW PAYOUT" value={short(status.payoutTxHash)} valueColor="var(--color-lime)" />
              <Row label="ENS BELT" value={`${status.current.petWon ? 'minted' : 'not awarded'}`} valueColor="var(--color-yellow)" />
            </PixelCard>
          )}

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

function short(s: string): string {
  if (s.length <= 16) return s
  return `${s.slice(0, 8)}…${s.slice(-6)}`
}
