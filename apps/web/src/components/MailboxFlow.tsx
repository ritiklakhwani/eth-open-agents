'use client'

import { useEffect, useState } from 'react'
import { PixelDialog, PixelButton, PixelCard, PixelInput } from './ui'

interface MailboxFlowProps {
  open: boolean
  onClose: () => void
  petId: number
}

interface InboxItem {
  id: string
  from: string
  message: string
  giftAmountUsdc: number
  deliveredAt: number
  status: string
}
interface PendingItem {
  id: string
  to: string
  message: string
  giftAmountUsdc: number
  triggerCondition: string
  status: string
}
interface InboxResp { inbox: InboxItem[]; pending: PendingItem[]; source: 'hub' | 'stub' }

interface SendResp {
  workflowId: string
  status: string
  fromPetId: number
  toPetName: string
  triggerCondition: string
  estimatedDeliveryMs: string
  source: 'hub' | 'stub'
}

type View = 'inbox' | 'compose' | 'sent'

export function MailboxFlow({ open, onClose, petId }: MailboxFlowProps) {
  const [view, setView] = useState<View>('inbox')
  const [inbox, setInbox] = useState<InboxResp | null>(null)
  const [inboxLoading, setInboxLoading] = useState(false)

  // Compose state
  const [toName, setToName] = useState('')
  const [message, setMessage] = useState('')
  const [giftAmount, setGiftAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sentResult, setSentResult] = useState<SendResp | null>(null)

  useEffect(() => {
    if (!open) return
    void loadInbox()
  }, [open, petId])

  async function loadInbox() {
    setInboxLoading(true)
    try {
      const res = await fetch(`/api/keeperhub/mailbox/inbox?petId=${petId}`, { cache: 'no-store' })
      if (res.ok) setInbox((await res.json()) as InboxResp)
    } finally {
      setInboxLoading(false)
    }
  }

  async function sendGift() {
    setSendError(null)
    if (toName.trim().length < 2 || message.trim().length < 1) {
      setSendError('Recipient name and message required.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/keeperhub/mailbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPetId: petId,
          toPetName: toName.trim(),
          message: message.trim(),
          giftAmountUsdc: giftAmount ? Number(giftAmount) : 0,
        }),
      })
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string }
        throw new Error(error ?? `send failed (${res.status})`)
      }
      const result = (await res.json()) as SendResp
      setSentResult(result)
      setView('sent')
    } catch (err) {
      setSendError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  function backToInbox() {
    setView('inbox')
    setSentResult(null)
    setToName('')
    setMessage('')
    setGiftAmount('')
    void loadInbox()
  }

  return (
    <PixelDialog open={open} onClose={onClose} title="MAILBOX — KEEPERHUB" size="lg">
      {view === 'inbox' && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)]">
              Cross-time gifts. KeeperHub fires when recipient comes online.
            </p>
            <PixelButton size="sm" variant="primary" onClick={() => setView('compose')}>
              + COMPOSE
            </PixelButton>
          </div>

          {inboxLoading && !inbox && (
            <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-cyan)] animate-blink">
              ▒ LOADING ▒
            </p>
          )}

          {inbox && (
            <>
              <Section title="DELIVERED">
                {inbox.inbox.length === 0 && (
                  <Empty text="No gifts received yet." />
                )}
                {inbox.inbox.map((g) => (
                  <PixelCard key={g.id} variant="default" className="mb-2">
                    <div className="flex flex-col gap-1">
                      <Row label="FROM" value={g.from} valueColor="var(--color-cyan)" />
                      <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink)] py-1">
                        &ldquo;{g.message}&rdquo;
                      </p>
                      <div className="flex justify-between text-[10px] font-[family-name:var(--font-pixel)] uppercase tracking-widest">
                        {g.giftAmountUsdc > 0 ? (
                          <span className="text-[color:var(--color-lime)]">
                            + {g.giftAmountUsdc} USDC
                          </span>
                        ) : (
                          <span className="text-[color:var(--color-ink-low)]">No gift</span>
                        )}
                        <span className="text-[color:var(--color-ink-low)]">
                          {timeAgo(g.deliveredAt)}
                        </span>
                      </div>
                    </div>
                  </PixelCard>
                ))}
              </Section>

              <Section title="PENDING (KEEPERHUB QUEUED)">
                {inbox.pending.length === 0 && <Empty text="Nothing queued." />}
                {inbox.pending.map((g) => (
                  <PixelCard key={g.id} variant="default" className="mb-2">
                    <div className="flex flex-col gap-1">
                      <Row label="TO" value={g.to} valueColor="var(--color-yellow)" />
                      <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)] py-1">
                        &ldquo;{g.message}&rdquo;
                      </p>
                      <Row label="WHEN" value={g.triggerCondition} valueColor="var(--color-pink)" />
                    </div>
                  </PixelCard>
                ))}
              </Section>
            </>
          )}

          <div className="flex justify-end">
            <PixelButton variant="ghost" onClick={onClose}>Close</PixelButton>
          </div>
        </div>
      )}

      {view === 'compose' && (
        <div className="flex flex-col gap-4">
          <PixelInput
            label="Recipient ENS or pet name"
            placeholder="rusty.tama.eth"
            value={toName}
            onChange={(e) => setToName(e.target.value)}
            maxLength={64}
          />
          <label className="flex flex-col gap-2">
            <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-ink-mid)]">
              Message
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="Saw this and thought of you..."
              className="w-full border-4 border-[color:var(--color-border)] focus:border-[color:var(--color-cyan)] bg-[color:var(--color-bg-deep)] text-[color:var(--color-ink)] font-[family-name:var(--font-pixel-readable)] text-base px-3 py-2 outline-none"
            />
          </label>
          <PixelInput
            label="Gift amount (USDC, optional)"
            placeholder="0"
            type="number"
            min={0}
            step="0.01"
            value={giftAmount}
            onChange={(e) => setGiftAmount(e.target.value)}
          />
          {sendError && (
            <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)]">
              ! {sendError}
            </p>
          )}
          <div className="flex justify-between">
            <PixelButton variant="ghost" onClick={() => setView('inbox')}>← Back</PixelButton>
            <PixelButton variant="success" loading={sending} onClick={sendGift}>
              ▶ Send via KeeperHub
            </PixelButton>
          </div>
        </div>
      )}

      {view === 'sent' && sentResult && (
        <div className="flex flex-col gap-5">
          <div className="text-center py-2">
            <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-lime)] animate-pixel-bounce mb-2">
              ★ QUEUED ★
            </div>
            <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)]">
              KeeperHub will deliver when {sentResult.toPetName} comes online.
            </p>
          </div>
          <PixelCard variant="elevated">
            <div className="flex flex-col gap-2">
              <Row label="WORKFLOW" value={short(sentResult.workflowId)} valueColor="var(--color-cyan)" />
              <Row label="TRIGGER" value={sentResult.triggerCondition} valueColor="var(--color-pink)" />
              <Row label="STATUS" value={sentResult.status.toUpperCase()} valueColor="var(--color-yellow)" />
            </div>
          </PixelCard>
          <div className="flex justify-end gap-3">
            <PixelButton variant="ghost" onClick={backToInbox}>← Back to inbox</PixelButton>
            <PixelButton variant="primary" onClick={onClose}>Close</PixelButton>
          </div>
        </div>
      )}
    </PixelDialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest uppercase text-[color:var(--color-ink-low)] mb-2">
        {title}
      </h4>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-low)] italic">
      {text}
    </p>
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

function timeAgo(ts: number): string {
  const ms = Date.now() - ts
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
