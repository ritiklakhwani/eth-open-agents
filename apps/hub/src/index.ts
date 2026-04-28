import 'dotenv/config'
import Fastify from 'fastify'
import { Server as SocketIOServer } from 'socket.io'
import { EventEmitter } from 'events'
import { initDB } from './db'
import { PetSupervisor } from './PetSupervisor'
import type { Zone } from 'shared-types'

// ── Shared event bus (pet workers → SSE clients) ─────────────────────────────
export const petEvents = new EventEmitter()

// ── DB + Supervisor ───────────────────────────────────────────────────────────
const db         = initDB()
const supervisor = new PetSupervisor(db)

// ── Fastify ───────────────────────────────────────────────────────────────────
const app = Fastify({ logger: true })

// ── REST routes ───────────────────────────────────────────────────────────────
app.get('/api/pets', () =>
  db.prepare('SELECT * FROM pets').all()
)

app.get<{ Params: { id: string } }>('/api/pets/:id', (req, reply) => {
  const pet = db.prepare('SELECT * FROM pets WHERE token_id = ?').get(req.params.id)
  if (!pet) return reply.status(404).send({ error: 'Pet not found' })
  return pet
})

// SSE — streams pet state updates to the frontend every second
app.get<{ Params: { petId: string } }>('/api/sse/:petId', (req, reply) => {
  const { petId } = req.params

  reply.raw.setHeader('Content-Type',  'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection',    'keep-alive')
  reply.raw.flushHeaders()

  const send = (data: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Send current state immediately
  const pet = db.prepare('SELECT * FROM pets WHERE token_id = ?').get(petId)
  if (pet) send(pet)

  // Forward pet-specific events from internal bus
  const onEvent = (data: unknown) => send(data)
  petEvents.on(`pet:${petId}`, onEvent)

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 30_000)

  req.raw.on('close', () => {
    clearInterval(heartbeat)
    petEvents.off(`pet:${petId}`, onEvent)
  })
})

// ── Boot ──────────────────────────────────────────────────────────────────────
async function main() {
  await app.listen({ port: 3001, host: '0.0.0.0' })

  // Attach Socket.io to the same HTTP server after Fastify binds
  const io = new SocketIOServer(app.server, {
    cors: { origin: '*' },
  })

  // In-memory position table: petId → { x, y, zone }
  const positions = new Map<number, { x: number; y: number; zone: Zone }>()

  io.on('connection', (socket) => {
    let playerId: number

    socket.on('join', ({ petId }: { petId: number }) => {
      playerId = petId
      socket.join('world')
      console.log(`[Socket] Pet ${petId} joined`)
    })

    socket.on('move', ({ x, y, zone }: { x: number; y: number; zone: Zone }) => {
      if (playerId == null) return
      positions.set(playerId, { x, y, zone })
      // Update zone in DB
      db.prepare('UPDATE pets SET pos_x = ?, pos_y = ?, zone = ? WHERE token_id = ?')
        .run(x, y, zone, playerId)
    })

    socket.on('disconnect', () => {
      positions.delete(playerId)
      if (playerId != null) {
        io.to('world').emit('petLeft', { petId: playerId })
        console.log(`[Socket] Pet ${playerId} disconnected`)
      }
    })
  })

  // Broadcast all positions at 10 Hz
  setInterval(() => {
    if (io.sockets.adapter.rooms.get('world')?.size) {
      io.to('world').emit('positions', Object.fromEntries(positions))
    }
  }, 100)

  // Proximity chat: when two pets are within 80px, trigger AXL chat (Phase 6)
  setInterval(() => {
    const pets = Array.from(positions.entries())
    for (let i = 0; i < pets.length; i++) {
      for (let j = i + 1; j < pets.length; j++) {
        const [a, posA] = pets[i]
        const [b, posB] = pets[j]
        const dist = Math.hypot(posA.x - posB.x, posA.y - posB.y)
        if (dist < 80) {
          // Workers handle the actual AXL chat in Phase 6
          petEvents.emit('proximity', { a, b })
        }
      }
    }
  }, 2_000)

  await supervisor.start()
  console.log('[Hub] Ready on http://localhost:3001')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})