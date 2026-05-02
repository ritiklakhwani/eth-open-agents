// ── Global user chat handlers ────────────────────────────────────────────────
// Registers the "user-join" / "user-message" socket events for HUMAN owners
// connecting to the /world page. This is independent of the pet AXL chat
// channel — pets keep talking via their own broker (see index.ts). Messages
// are kept in-memory only on the Hub; nothing is persisted to SQLite.
//
// Broadcast model:
//   "user-list"    fan-out on every join / disconnect
//   "user-message" fan-out on every accepted message
//
// Spam protection: per-socket sliding window (5 messages / 10s). Excess
// messages are dropped silently. Maximum text length 200 chars.

import type { Server as SocketIOServer, Socket } from 'socket.io'
import type {
  OnlineUser,
  UserChatMessage,
  UserJoinPayload,
  UserMessagePayload,
} from 'shared-types'

const RATE_LIMIT_WINDOW_MS = 10_000
const RATE_LIMIT_MAX       = 5
const MAX_MESSAGE_LEN      = 200

interface OnlineUserEntry {
  socketId: string
  address: `0x${string}`
  ensName?: string
}

export function registerGlobalChat(io: SocketIOServer) {
  // socketId -> entry. Single source of truth for online owners.
  const users = new Map<string, OnlineUserEntry>()
  // socketId -> recent message timestamps (sliding window).
  const sendTimes = new Map<string, number[]>()

  const snapshot = (): OnlineUser[] =>
    Array.from(users.values()).map((u) => ({
      socketId: u.socketId,
      address:  u.address,
      ensName:  u.ensName,
    }))

  const broadcastUserList = () => {
    io.emit('user-list', { users: snapshot() })
  }

  io.on('connection', (socket: Socket) => {
    socket.on('user-join', (payload: UserJoinPayload) => {
      if (!payload || typeof payload.address !== 'string') return
      const addr = payload.address.toLowerCase() as `0x${string}`
      if (!/^0x[0-9a-f]{40}$/.test(addr)) return

      const existing = users.get(socket.id)
      if (existing && existing.address === addr) return // idempotent

      users.set(socket.id, {
        socketId: socket.id,
        address:  addr,
        ensName:  typeof payload.ensName === 'string' ? payload.ensName : undefined,
      })
      console.log(`[GlobalChat] user-join ${addr.slice(0, 6)}...${addr.slice(-4)} (socket ${socket.id})`)
      broadcastUserList()
    })

    socket.on('user-message', (payload: UserMessagePayload) => {
      const entry = users.get(socket.id)
      if (!entry) return // never joined
      if (!payload || typeof payload.text !== 'string') return

      const text = payload.text.trim()
      if (text.length === 0) return
      const clipped = text.slice(0, MAX_MESSAGE_LEN)

      // Rate limit (sliding window)
      const now = Date.now()
      const times = sendTimes.get(socket.id) ?? []
      const recent = times.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
      if (recent.length >= RATE_LIMIT_MAX) {
        // drop silently
        sendTimes.set(socket.id, recent)
        return
      }
      recent.push(now)
      sendTimes.set(socket.id, recent)

      const msg: UserChatMessage = {
        fromAddress: entry.address,
        text:        clipped,
        timestamp:   now,
      }
      io.emit('user-message', msg)
    })

    socket.on('disconnect', () => {
      if (users.delete(socket.id)) {
        sendTimes.delete(socket.id)
        broadcastUserList()
      }
    })
  })
}
