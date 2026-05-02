import { io, type Socket } from 'socket.io-client'
import type {
  SocketEvents,
  Zone,
  OnlineUser,
  UserChatMessage,
  UserJoinPayload,
  UserMessagePayload,
} from 'shared-types'

interface ServerToClient {
  positions: (data: SocketEvents['positions']) => void
  chat:      (data: SocketEvents['chat']) => void
  petLeft:   (data: SocketEvents['petLeft']) => void
  // ── GLOBAL CHAT (humans, not pets) ────────────────────────────────────────
  'user-list':    (data: SocketEvents['user-list']) => void
  'user-message': (data: UserChatMessage) => void
}

interface ClientToServer {
  join: (data: { petId: number }) => void
  move: (data: { x: number; y: number; zone: Zone }) => void
  // ── GLOBAL CHAT (humans, not pets) ────────────────────────────────────────
  'user-join':    (data: UserJoinPayload) => void
  'user-message': (data: UserMessagePayload) => void
}

export class MultiplayerClient {
  private socket: Socket<ServerToClient, ClientToServer>
  readonly playerId: number

  constructor(playerId: number, serverUrl = 'http://localhost:3001') {
    this.playerId  = playerId
    this.socket    = io(serverUrl) as Socket<ServerToClient, ClientToServer>
  }

  join() {
    this.socket.emit('join', { petId: this.playerId })
  }

  move(x: number, y: number, zone: Zone) {
    this.socket.emit('move', { x, y, zone })
  }

  onPositions(cb: (positions: SocketEvents['positions']) => void) {
    this.socket.on('positions', cb)
  }

  onChat(cb: (event: SocketEvents['chat']) => void) {
    this.socket.on('chat', cb)
  }

  onPetLeft(cb: (event: SocketEvents['petLeft']) => void) {
    this.socket.on('petLeft', cb)
  }

  disconnect() {
    this.socket.disconnect()
  }
}

// ── GLOBAL HUMAN-CHAT CLIENT ────────────────────────────────────────────────
// Lightweight wrapper around its own socket.io-client connection — kept
// separate from MultiplayerClient so the chat box can mount/unmount without
// disturbing the Phaser pet multiplayer session, and so non-Phaser pages
// could reuse it.
export class GlobalChatClient {
  private socket: Socket<ServerToClient, ClientToServer>

  constructor(serverUrl = 'http://localhost:3001') {
    this.socket = io(serverUrl) as Socket<ServerToClient, ClientToServer>
  }

  join(payload: UserJoinPayload) {
    this.socket.emit('user-join', payload)
  }

  send(text: string) {
    this.socket.emit('user-message', { text })
  }

  onUserList(cb: (users: OnlineUser[]) => void) {
    this.socket.on('user-list', (data) => cb(data.users))
  }

  onMessage(cb: (msg: UserChatMessage) => void) {
    this.socket.on('user-message', cb)
  }

  onConnect(cb: () => void) {
    this.socket.on('connect', cb)
  }

  disconnect() {
    this.socket.disconnect()
  }
}
