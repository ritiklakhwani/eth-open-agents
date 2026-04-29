import { io, type Socket } from 'socket.io-client'
import type { SocketEvents, Zone } from 'shared-types'

interface ServerToClient {
  positions: (data: SocketEvents['positions']) => void
  chat:      (data: SocketEvents['chat']) => void
  petLeft:   (data: SocketEvents['petLeft']) => void
}

interface ClientToServer {
  join: (data: { petId: number }) => void
  move: (data: { x: number; y: number; zone: Zone }) => void
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