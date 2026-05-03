'use client'

// ── Global human chat box ────────────────────────────────────────────────────
// Bottom-right collapsible panel for owners on /world to talk to each other.
// Wired to the Hub via socket.io ("user-join" / "user-message" / "user-list").
// Wallet identity comes from wagmi `useAccount`. If the wallet is not
// connected, the input is replaced by a "connect wallet to chat" notice.
//
// Spam: Hub enforces 5 msg / 10s and 200-char clip — the client only enforces
// the 200-char limit on the input.
//
// State (collapsed/expanded, draft text) is local to this component and
// therefore persists for the lifetime of the page (does not survive reloads,
// per spec).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import type { OnlineUser, UserChatMessage } from 'shared-types'
import { GlobalChatClient } from './phaser/MultiplayerClient'

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3001'
const MAX_MESSAGE_LEN = 200
const MAX_HISTORY     = 100

function shortAddress(addr: string): string {
  if (!addr.startsWith('0x') || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function GlobalChat() {
  const { address, isConnected } = useAccount()
  const [collapsed, setCollapsed] = useState(false)
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [messages, setMessages] = useState<UserChatMessage[]>([])
  const [draft, setDraft] = useState('')

  const clientRef = useRef<GlobalChatClient | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // One persistent socket per page lifetime. We let the client connect
  // immediately so the user sees the online list even before connecting a
  // wallet — only sending messages requires an address.
  useEffect(() => {
    const client = new GlobalChatClient(HUB_URL)
    clientRef.current = client
    client.onUserList(setUsers)
    client.onMessage((msg) => {
      setMessages((prev) => {
        const next = prev.length >= MAX_HISTORY ? prev.slice(-MAX_HISTORY + 1) : prev
        return [...next, msg]
      })
    })
    return () => {
      client.disconnect()
      clientRef.current = null
    }
  }, [])

  // Re-emit user-join whenever the connected address changes (or appears).
  // Hub treats repeat joins as idempotent for the same address.
  useEffect(() => {
    if (!isConnected || !address) return
    const client = clientRef.current
    if (!client) return
    const lower = address.toLowerCase() as `0x${string}`
    client.join({ address: lower })
  }, [isConnected, address])

  // Auto-scroll to the latest message when a new one arrives (only when
  // expanded — avoids paying for layout while collapsed).
  useEffect(() => {
    if (collapsed) return
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, collapsed])

  const lowerAddress = address?.toLowerCase()
  const onlineCount = users.length

  const handleSend = () => {
    const text = draft.trim()
    if (!text) return
    if (!isConnected || !address) return
    const client = clientRef.current
    if (!client) return
    client.send(text.slice(0, MAX_MESSAGE_LEN))
    setDraft('')
  }

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.address.localeCompare(b.address)),
    [users],
  )

  // ── Collapsed: render as a square chat panel pinned to the corner ─────
  // Square with NO offset from the bottom-right edges, so it fully eclipses
  // the Gemini watermark baked into world-bg.png — no PNG edit needed and
  // looks like an intentional UI affordance rather than a mask. The shape
  // is anchored corner-flush; only the top-left edges are visible so we
  // give those a 4px yellow border for the hard pixel-frame look.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={`Open global chat (${onlineCount} online)`}
        className="fixed bottom-0 right-0 z-30 h-[120px] w-[140px] border border-[color:var(--color-yellow)]/35 bg-[color:var(--color-bg-deep)] hover:border-[color:var(--color-yellow)]/60 transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer group animate-orb-thud"
      >
        {/* Two overlapping speech-bubbles glyph — inline SVG so we can
            theme it with currentColor and scale crisply. Mirrors the user-
            supplied reference: outlined back bubble, filled front bubble. */}
        <svg
          viewBox="0 0 64 56"
          width={56}
          height={48}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-[color:var(--color-yellow)] group-hover:scale-110 transition-transform"
          aria-hidden="true"
        >
          {/* Back bubble: outline only */}
          <path d="M4 4 h32 a4 4 0 0 1 4 4 v18 a4 4 0 0 1 -4 4 h-22 l-6 8 v-8 h-4 a4 4 0 0 1 -4 -4 v-18 a4 4 0 0 1 4 -4 z" />
          {/* Front bubble: filled with bg color so it sits ON TOP of the
              back bubble cleanly — overlap is the whole point of the icon */}
          <path
            d="M28 22 h32 a4 4 0 0 1 4 4 v18 a4 4 0 0 1 -4 4 h-12 l-6 8 v-8 h-14 a4 4 0 0 1 -4 -4 v-18 a4 4 0 0 1 4 -4 z"
            fill="rgba(10,12,46,0.95)"
          />
        </svg>

        <span className="font-[family-name:var(--font-pixel)] text-[8px] tracking-widest text-[color:var(--color-yellow)] leading-none">
          GLOBAL CHAT
        </span>

        {/* Online count badge — top-left of the panel since the right edge
            is flush against the viewport with no room for an external badge */}
        <span
          className="absolute top-1.5 left-1.5 min-w-[24px] h-[20px] px-1.5 flex items-center justify-center border-2 border-[color:var(--color-bg-deep)] bg-[color:var(--color-lime)] font-[family-name:var(--font-pixel)] text-[9px] tracking-tight text-[color:var(--color-bg-deep)] leading-none"
          aria-hidden="true"
        >
          {onlineCount}
        </span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-0 right-0 z-30 w-[360px] max-w-[100vw] animate-panel-pop-br">
      {/* Pin flush to the bottom-right viewport edge so the panel covers the
          Gemini watermark area whether collapsed (orb) or expanded. Subtle
          1px yellow border matches the PetInspector style. */}
      <div className="border border-[color:var(--color-yellow)]/35 bg-[color:var(--color-bg-deep)]">
        {/* Header — click to collapse */}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="flex w-full items-center justify-between border-b border-[color:var(--color-yellow)]/20 bg-[rgba(10,12,46,0.5)] px-3 py-2 cursor-pointer"
          aria-expanded="true"
        >
          <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-yellow)]">
            GLOBAL CHAT
          </span>
          <span className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest text-[color:var(--color-ink-mid)]">
              {onlineCount} ONLINE
            </span>
            <span className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-ink-low)]">
              [-]
            </span>
          </span>
        </button>

        <div className="flex flex-col">
            {/* Online users panel */}
            <div className="border-b border-[color:var(--color-yellow)]/15 bg-[rgba(10,12,46,0.3)] px-3 py-2 max-h-24 overflow-y-auto">
              <p className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-widest text-[color:var(--color-ink-mid)] mb-1">
                ONLINE OWNERS
              </p>
              {sortedUsers.length === 0 ? (
                <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-low)]">
                  no one connected
                </p>
              ) : (
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                  {sortedUsers.map((u) => {
                    const isMe = lowerAddress && u.address.toLowerCase() === lowerAddress
                    return (
                      <li
                        key={u.socketId}
                        className={[
                          'font-[family-name:var(--font-mono)] text-xs',
                          isMe
                            ? 'text-[color:var(--color-lime)]'
                            : 'text-[color:var(--color-ink)]',
                        ].join(' ')}
                        title={u.address}
                      >
                        {shortAddress(u.address)}
                        {isMe ? ' (you)' : ''}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Message list */}
            <div className="px-3 py-2 h-64 overflow-y-auto bg-[rgba(10,12,46,0.2)]">
              {messages.length === 0 ? (
                <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-low)] text-center mt-8">
                  no messages yet — say hi
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {messages.map((m, i) => {
                    const isMe = lowerAddress && m.fromAddress.toLowerCase() === lowerAddress
                    return (
                      <li key={`${m.timestamp}-${i}`} className="leading-tight">
                        <span className="font-[family-name:var(--font-pixel)] text-[9px] tracking-widest text-[color:var(--color-ink-low)] mr-2">
                          {formatTime(m.timestamp)}
                        </span>
                        <span
                          className={[
                            'font-[family-name:var(--font-mono)] text-xs mr-2',
                            isMe
                              ? 'text-[color:var(--color-lime)]'
                              : 'text-[color:var(--color-cyan)]',
                          ].join(' ')}
                        >
                          {shortAddress(m.fromAddress)}
                        </span>
                        <span className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink)] break-words">
                          {m.text}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[color:var(--color-yellow)]/20 bg-[rgba(10,12,46,0.5)] p-2">
              {!isConnected || !address ? (
                <p className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest text-[color:var(--color-yellow)] text-center py-1.5 animate-blink">
                  CONNECT WALLET TO CHAT
                </p>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LEN))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder="type a message..."
                    maxLength={MAX_MESSAGE_LEN}
                    className="flex-1 border border-[color:var(--color-yellow)]/25 bg-[rgba(10,12,46,0.5)] px-2 py-1 font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-low)] outline-none focus:border-[color:var(--color-yellow)]/60"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={draft.trim().length === 0}
                    className="border border-[color:var(--color-yellow)]/50 bg-[color:var(--color-yellow)]/10 hover:bg-[color:var(--color-yellow)]/20 px-3 py-1 font-[family-name:var(--font-pixel)] text-[10px] tracking-widest text-[color:var(--color-yellow)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    SEND
                  </button>
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  )
}
