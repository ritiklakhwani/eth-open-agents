'use client'

import { useEffect, useState } from 'react'
import { PixelDialog, PixelButton, PixelCard } from './ui'
import { useActivityEvents } from '@/hooks/useActivityEvents'

interface SubscriptionPanelProps {
  open: boolean
  onClose: () => void
  petId: number
}

interface Subscription {
  id: string
  name: string
  amountUsdc: number
  frequency: string
  lastUsedDays: number
  recommendation: 'CANCEL' | 'KEEP' | 'REVIEW'
  reason: string
}

interface ScanResp {
  petId: number
  scannedAt: number
  subscriptions: Subscription[]
  petCommentary: string
  source: 'hub' | 'stub'
}

interface CancelResp {
  workflowId: string
  cancelledSubIds: string[]
  monthlySavingsUsdc: number
  annualSavingsUsdc: number
  status: string
  source: 'hub' | 'stub'
}

type View = 'idle' | 'scanning' | 'review' | 'scheduling' | 'done'

const RECOMMEND_COLOR: Record<Subscription['recommendation'], string> = {
  CANCEL: 'var(--color-red)',
  REVIEW: 'var(--color-yellow)',
  KEEP:   'var(--color-lime)',
}

export function SubscriptionPanel({ open, onClose, petId }: SubscriptionPanelProps) {
  const [view, setView] = useState<View>('idle')
  const [scan, setScan] = useState<ScanResp | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CancelResp | null>(null)

  // Subscribe to live Hub activity. When the worker's Brain.decide() finishes
  // it emits subscription-proposals via socket.io. Karmanay's mock tx history
  // doesn't line up with our UI's canned 5-item list, so we don't try to
  // merge per-row — instead we use the first real proposal's `reason` as the
  // petCommentary so the user sees actual LLM output.
  const { events } = useActivityEvents(
    open ? petId : null,
    'subscription-proposals',
  )

  useEffect(() => {
    if (events.length === 0) return
    const latest = events[events.length - 1]
    if (latest.type !== 'subscription-proposals' || !latest.proposals?.length) return
    setScan((prev) =>
      prev
        ? {
            ...prev,
            petCommentary: latest.proposals![0].reason || prev.petCommentary,
            source: 'hub' as const,
          }
        : prev,
    )
  }, [events])

  async function runScan() {
    setView('scanning')
    setError(null)
    try {
      const res = await fetch('/api/keeperhub/subscription/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId }),
      })
      if (!res.ok) {
        const { error: e } = (await res.json()) as { error?: string }
        throw new Error(e ?? `scan failed (${res.status})`)
      }
      const json = (await res.json()) as ScanResp
      setScan(json)
      // Pre-select all CANCEL recommendations
      const initial = new Set(
        json.subscriptions.filter((s) => s.recommendation === 'CANCEL').map((s) => s.id),
      )
      setSelected(initial)
      setView('review')
    } catch (err) {
      setError((err as Error).message)
      setView('idle')
    }
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function scheduleCancellations() {
    if (selected.size === 0) {
      setError('Select at least one subscription to cancel.')
      return
    }
    setView('scheduling')
    setError(null)
    try {
      const res = await fetch('/api/keeperhub/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId, subIds: [...selected] }),
      })
      if (!res.ok) {
        const { error: e } = (await res.json()) as { error?: string }
        throw new Error(e ?? `cancel failed (${res.status})`)
      }
      const json = (await res.json()) as CancelResp
      setResult(json)
      setView('done')
    } catch (err) {
      setError((err as Error).message)
      setView('review')
    }
  }

  function reset() {
    setView('idle')
    setScan(null)
    setSelected(new Set())
    setError(null)
    setResult(null)
  }

  return (
    <PixelDialog
      open={open}
      onClose={() => { onClose(); setTimeout(reset, 200) }}
      title="OFFICE — SUBSCRIPTION PET"
      size="lg"
    >
      {view === 'idle' && (
        <div className="flex flex-col gap-5">
          <p className="font-[family-name:var(--font-pixel-readable)] text-lg text-[color:var(--color-ink-mid)]">
            Your pet can audit your recurring USDC subscriptions and propose cancellations.
            Approved cancellations are scheduled via KeeperHub.
          </p>
          {error && (
            <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)]">
              ! {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <PixelButton variant="ghost" onClick={onClose}>Close</PixelButton>
            <PixelButton variant="primary" onClick={runScan}>▶ Scan my subs</PixelButton>
          </div>
        </div>
      )}

      {view === 'scanning' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-cyan)] animate-blink">
            ▒▒▒ ANALYZING ▒▒▒
          </div>
          <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)]">
            Pet brain is reviewing recurring tx history...
          </p>
        </div>
      )}

      {view === 'review' && scan && (
        <div className="flex flex-col gap-5">
          <PixelCard variant="cyan" title="PET COMMENTARY">
            <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink)] italic">
              &ldquo;{scan.petCommentary}&rdquo;
            </p>
          </PixelCard>

          <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto pr-1">
            {scan.subscriptions.map((s) => {
              const checked = selected.has(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={[
                    'cursor-pointer text-left border-4 p-3 transition-none',
                    checked
                      ? 'bg-[color:var(--color-bg-hi)] border-[color:var(--color-pink)]'
                      : 'bg-[color:var(--color-bg-mid)] border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-hi)]',
                  ].join(' ')}
                >
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-ink)]">
                      {checked ? '[X]' : '[ ]'} {s.name.toUpperCase()}
                    </span>
                    <span
                      className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest"
                      style={{ color: RECOMMEND_COLOR[s.recommendation] }}
                    >
                      {s.recommendation}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] font-[family-name:var(--font-pixel)] text-[color:var(--color-ink-mid)]">
                    <span>${s.amountUsdc.toFixed(2)} / {s.frequency}</span>
                    <span>used {s.lastUsedDays}d ago</span>
                  </div>
                  <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-mid)] mt-1">
                    {s.reason}
                  </p>
                </button>
              )
            })}
          </div>

          {error && (
            <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)]">
              ! {error}
            </p>
          )}
          <div className="flex justify-between gap-3">
            <PixelButton variant="ghost" onClick={() => setView('idle')}>← Back</PixelButton>
            <PixelButton variant="success" onClick={scheduleCancellations} disabled={selected.size === 0}>
              ▶ Schedule {selected.size} cancellation{selected.size === 1 ? '' : 's'}
            </PixelButton>
          </div>
        </div>
      )}

      {view === 'scheduling' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-cyan)] animate-blink">
            ▒ SCHEDULING ▒
          </div>
          <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)]">
            Registering KeeperHub workflow...
          </p>
        </div>
      )}

      {view === 'done' && result && (
        <div className="flex flex-col gap-5">
          <div className="text-center py-2">
            <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-lime)] animate-pixel-bounce mb-2">
              ★ SCHEDULED ★
            </div>
            <p className="font-[family-name:var(--font-pixel-readable)] text-lg text-[color:var(--color-ink)]">
              You will save <span className="text-[color:var(--color-lime)]">${result.monthlySavingsUsdc.toFixed(2)}</span> per month
            </p>
            <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)]">
              (${result.annualSavingsUsdc.toFixed(2)} per year)
            </p>
          </div>
          <PixelCard variant="elevated">
            <div className="flex flex-col gap-2">
              <Row label="WORKFLOW" value={short(result.workflowId)} valueColor="var(--color-cyan)" />
              <Row label="CANCELLED" value={`${result.cancelledSubIds.length} subscriptions`} valueColor="var(--color-pink)" />
              <Row label="STATUS" value={result.status.toUpperCase()} valueColor="var(--color-yellow)" />
            </div>
          </PixelCard>
          <div className="flex justify-end">
            <PixelButton variant="primary" onClick={() => { onClose(); setTimeout(reset, 200) }}>Close</PixelButton>
          </div>
        </div>
      )}
    </PixelDialog>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
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
