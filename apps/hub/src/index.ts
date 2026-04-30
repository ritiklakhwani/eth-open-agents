import { config as loadEnv } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load .env from repo root (4 levels up from apps/hub/src/index.ts)
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
loadEnv({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

import Fastify from 'fastify'
import cors from '@fastify/cors'
import { randomBytes } from 'crypto'
import { Server as SocketIOServer } from 'socket.io'
import { EventEmitter } from 'events'
import { initDB } from './db'
import { PetSupervisor } from './PetSupervisor'
import type { Zone } from 'shared-types'

// ── Shared event bus (pet workers → SSE clients) ─────────────────────────────
const petEvents = new EventEmitter()

// ── DB + Supervisor ───────────────────────────────────────────────────────────
const db         = initDB()
const supervisor = new PetSupervisor(db)

// ── Fastify ───────────────────────────────────────────────────────────────────
const app = Fastify({ logger: true })
await app.register(cors, { origin: '*' })

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

  reply.hijack()
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

// ── KeeperHub: mailbox send ───────────────────────────────────────────────────
app.post<{ Body: { fromPetId: number; toPetId: number; amountUSDC: string } }>(
  '/api/keeperhub/mailbox/send',
  (req, reply) => {
    const { fromPetId, toPetId, amountUSDC } = req.body
    const toPet = db.prepare('SELECT ens_name, wallet_address FROM pets WHERE token_id = ?')
      .get(toPetId) as { ens_name: string; wallet_address: string } | undefined
    if (!toPet) return reply.status(404).send({ error: 'Recipient pet not found' })

    supervisor.broadcast(fromPetId, {
      type:                'mailbox-send',
      toPetId,
      toPetEnsName:        toPet.ens_name,
      toPetWalletAddress:  toPet.wallet_address,
      amountUSDC,
      walletIntegrationId: process.env.KEEPERHUB_WALLET_INTEGRATION_ID ?? '',
    })
    return { ok: true }
  },
)

// ── KeeperHub: subscription scan + approve ────────────────────────────────────
app.post<{ Body: { petId: number } }>('/api/keeperhub/subscription/scan', (req) => {
  supervisor.broadcast(req.body.petId, { type: 'subscription-scan' })
  return { ok: true }
})

app.post<{ Body: { petId: number; subscriptionId: number } }>(
  '/api/keeperhub/subscription/approve',
  (req) => {
    const { petId, subscriptionId } = req.body
    supervisor.broadcast(petId, {
      type:                'subscription-approve',
      subscriptionId,
      walletIntegrationId: process.env.KEEPERHUB_WALLET_INTEGRATION_ID ?? '',
    })
    return { ok: true }
  },
)

// ── Battle: start ─────────────────────────────────────────────────────────────
app.post<{ Body: { petAId: number; petBId: number; stakeAmount: string } }>(
  '/api/battle/start',
  (req, reply) => {
    const { petAId, petBId, stakeAmount } = req.body
    type PetRow = { peer_id: string | null; name: string; wallet_address: string }
    const petA = db.prepare('SELECT peer_id, name, wallet_address FROM pets WHERE token_id = ?').get(petAId) as PetRow | undefined
    const petB = db.prepare('SELECT peer_id, name, wallet_address FROM pets WHERE token_id = ?').get(petBId) as PetRow | undefined
    if (!petA?.peer_id || !petB?.peer_id) return reply.status(400).send({ error: 'Pets not ready' })

    const judges = db.prepare(
      'SELECT token_id, peer_id FROM pets WHERE token_id NOT IN (?, ?) AND peer_id IS NOT NULL LIMIT 3'
    ).all(petAId, petBId) as Array<{ token_id: number; peer_id: string }>

    const battleId = `battle-${randomBytes(8).toString('hex')}`
    supervisor.broadcast(petAId, {
      type:        'battle-start',
      battleId,
      myWallet:    petA.wallet_address,
      withPetId:   petBId,
      withPeerId:  petB.peer_id,
      withName:    petB.name,
      withWallet:  petB.wallet_address,
      stakeAmount,
      judges:      judges.map(j => ({ petId: j.token_id, peerId: j.peer_id })),
    })
    return { ok: true, battleId }
  },
)

// ── Adoption transfer webhook (called by KeeperHub workflow) ──────────────────
app.post<{ Body: { tokenId: string; from: string; to: string } }>(
  '/api/adoption-transfer',
  (req) => {
    const { tokenId, from, to } = req.body
    db.prepare('UPDATE pets SET owner_address = ? WHERE token_id = ?').run(to, Number(tokenId))
    console.log(`[Hub] Adoption transfer: pet ${tokenId} ${from} → ${to}`)
    return { ok: true }
  },
)

// ── Adoption chain bootstrap (idempotent, runs once at startup) ───────────────
async function bootstrapAdoptionChain() {
  const existing = db.prepare("SELECT id FROM keeperhub_workflows WHERE kind = 'adoption-chain' LIMIT 1").get()
  if (existing) return
  const { connectKeeperHub, createAdoptionTransferChain } = await import('keeperhub')
  const client = await connectKeeperHub()
  try {
    const workflow = await createAdoptionTransferChain(client, {
      walletIntegrationId: process.env.KEEPERHUB_WALLET_INTEGRATION_ID ?? '',
    })
    db.prepare(
      'INSERT OR IGNORE INTO keeperhub_workflows (id, pet_id, kind, status, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(workflow.id, 0, 'adoption-chain', 'active', JSON.stringify(workflow), Date.now())
    console.log('[Hub] Adoption chain workflow registered:', workflow.id)
  } finally {
    await client.close()
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function main() {
  await app.listen({ port: 3001, host: '0.0.0.0' })

  // Attach Socket.io to the same HTTP server after Fastify binds
  const io = new SocketIOServer(app.server, {
    cors: { origin: '*' },
  })
  supervisor.setIO(io)

  // In-memory position table: petId → { x, y, zone }
  const positions = new Map<number, { x: number; y: number; zone: Zone }>()

  io.on('connection', (socket) => {
    let playerId: number | undefined

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
      if (playerId != null) {
        positions.delete(playerId)
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

  // Proximity chat: when two pets are within 80px, trigger one AXL chat exchange.
  // Cooldown prevents spamming — one exchange per pair per minute.
  const lastProximityChat = new Map<string, number>()
  const PROXIMITY_COOLDOWN_MS = 60_000

  setInterval(() => {
    const pets = Array.from(positions.entries())
    const now  = Date.now()
    for (let i = 0; i < pets.length; i++) {
      for (let j = i + 1; j < pets.length; j++) {
        const [a, posA] = pets[i]
        const [b, posB] = pets[j]
        const dist = Math.hypot(posA.x - posB.x, posA.y - posB.y)
        if (dist >= 80) continue

        const pairKey = `${Math.min(a, b)}-${Math.max(a, b)}`
        if ((lastProximityChat.get(pairKey) ?? 0) + PROXIMITY_COOLDOWN_MS > now) continue
        lastProximityChat.set(pairKey, now)

        // Look up peer IDs so workers can address each other over AXL
        const petA = db.prepare('SELECT peer_id, name FROM pets WHERE token_id = ?')
          .get(a) as { peer_id: string | null; name: string } | undefined
        const petB = db.prepare('SELECT peer_id, name FROM pets WHERE token_id = ?')
          .get(b) as { peer_id: string | null; name: string } | undefined
        if (!petA?.peer_id || !petB?.peer_id) continue

        supervisor.broadcast(a, { type: 'chat-request', withPetId: b, withPeerId: petB.peer_id, withName: petB.name })
        supervisor.broadcast(b, { type: 'chat-request', withPetId: a, withPeerId: petA.peer_id, withName: petA.name })
      }
    }
  }, 2_000)

  await supervisor.start()
  bootstrapAdoptionChain().catch(err => console.error('[Hub] adoption-chain bootstrap failed:', err.message))
  console.log('[Hub] Ready on http://localhost:3001')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})