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

  return (
    <div className="fixed bottom-4 right-4 z-30 w-[360px] max-w-[calc(100vw-2rem)]">
      <div className="border border-[color:var(--color-yellow)]/35 bg-[rgba(10,12,46,0.78)] backdrop-blur-sm">
        {/* Header — click to collapse / expand */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center justify-between border-b border-[color:var(--color-yellow)]/20 bg-[rgba(10,12,46,0.5)] px-3 py-2 cursor-pointer"
          aria-expanded={!collapsed}
        >
          <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-yellow)]">
            GLOBAL CHAT
          </span>
          <span className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest text-[color:var(--color-ink-mid)]">
              {onlineCount} ONLINE
            </span>
            <span className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-ink-low)]">
              {collapsed ? '[+]' : '[-]'}
            </span>
          </span>
        </button>

        {!collapsed && (
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
        )}
      </div>
    </div>
  )
}
