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

// ── A6: Persist sprite URL after mint so the world page can render the
// user's actual sprite (otherwise pets always show as default rectangles).
app.post<{ Params: { id: string }; Body: { spriteUrl: string } }>(
  '/api/pets/:id/sprite',
  (req, reply) => {
    const tokenId = Number(req.params.id)
    const { spriteUrl } = req.body
    if (!Number.isFinite(tokenId)) return reply.status(400).send({ error: 'invalid id' })
    if (typeof spriteUrl !== 'string' || !spriteUrl.length) {
      return reply.status(400).send({ error: 'spriteUrl required' })
    }
    const result = db.prepare('UPDATE pets SET sprite_url = ? WHERE token_id = ?')
      .run(spriteUrl, tokenId)
    if (result.changes === 0) {
      return reply.status(404).send({ error: 'pet not found' })
    }
    return { ok: true, tokenId, spriteUrl }
  },
)

// ── ENS Most Creative: persist parent_name so the ENS subname is minted
// nested as <child>.<parent>.tama.eth (subname tree for breeding lineage).
// BreedingFlow POSTs this right after the child mints. PetSupervisor's
// mintEnsSubnameForPet reads it before deciding which parent to nest under.
app.post<{ Params: { id: string }; Body: { parentName: string } }>(
  '/api/pets/:id/parent',
  (req, reply) => {
    const tokenId = Number(req.params.id)
    const { parentName } = req.body
    if (!Number.isFinite(tokenId)) return reply.status(400).send({ error: 'invalid id' })
    if (typeof parentName !== 'string' || !parentName.length) {
      return reply.status(400).send({ error: 'parentName required' })
    }
    const result = db.prepare('UPDATE pets SET parent_name = ? WHERE token_id = ?')
      .run(parentName, tokenId)
    if (result.changes === 0) {
      return reply.status(404).send({ error: 'pet not found' })
    }
    return { ok: true, tokenId, parentName }
  },
)

// ── A4: Subscription seed map endpoint — frontend cancel route reads this
// to translate slug IDs (sub_netflix etc.) into the real on-chain numeric IDs.
// Without this, the cancel workflow targets the wrong ID and reverts/no-ops.
app.get('/api/keeperhub/subscription/map', () => {
  const row = db.prepare(
    "SELECT payload FROM keeperhub_workflows WHERE kind = 'sub-registry-seed' LIMIT 1"
  ).get() as { payload: string } | undefined
  if (!row) return { map: {}, seeded: false }
  try {
    return { map: JSON.parse(row.payload), seeded: true }
  } catch {
    return { map: {}, seeded: false }
  }
})

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

// ── A4: Subscription Registry bootstrap (idempotent) ──────────────────────────
//
// Registers 5 fake recurring subscriptions on SubscriptionRegistry.sol so when
// the cancel workflow fires `cancelSub(id)` from the KeeperHub wallet, the
// transaction succeeds and emits a real `SubscriptionCancelled` event on
// Sepolia. Without this, the cancel workflow targets non-existent IDs and
// silently no-ops — making the KeeperHub Subscription Pet punchline cosmetic.
//
// Subs are registered FROM the KeeperHub wallet (0x4F1d...2416) via MCP
// `execute_contract_call` so that wallet becomes the on-chain owner. The
// cancel workflow uses the same wallet, so msg.sender == owner check passes.
//
// Maps slug ID (sub_netflix etc.) → on-chain numeric ID. Saved in SQLite as
// keeperhub_workflows.payload JSON. Frontend reads this to translate UI clicks.
async function bootstrapSubscriptionRegistry() {
  const existing = db.prepare(
    "SELECT id, payload FROM keeperhub_workflows WHERE kind = 'sub-registry-seed' LIMIT 1"
  ).get() as { id: string; payload: string } | undefined
  if (existing) {
    console.log('[Hub] Subscription registry seed already exists:', existing.payload)
    return
  }

  const { connectKeeperHub } = await import('keeperhub')
  const { ADDRESSES_SEPOLIA } = await import('contracts-sdk')
  const SEPOLIA_CHAIN_ID = '11155111'

  const REGISTER_SUB_ABI = JSON.stringify([{
    type: 'function',
    name: 'registerSub',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token',     type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'amount',    type: 'uint256' },
      { name: 'frequency', type: 'uint256' },
      { name: 'label',     type: 'string'  },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  }])

  // Match the slug list the frontend uses in /api/keeperhub/subscription/cancel
  const seedSubs = [
    { slug: 'sub_netflix', label: 'Netflix',      amountUsdc: 15.49 },
    { slug: 'sub_spotify', label: 'Spotify',       amountUsdc:  9.99 },
    { slug: 'sub_dropbox', label: 'Dropbox Plus',  amountUsdc: 11.99 },
    { slug: 'sub_nyt',     label: 'NYT Cooking',   amountUsdc:  5.00 },
    { slug: 'sub_chatgpt', label: 'ChatGPT Plus',  amountUsdc: 20.00 },
  ]

  // Send all subs to the KeeperHub wallet itself as recipient (placeholder —
  // demo fixture, no real merchant). USDC has 6 decimals.
  const RECIPIENT = '0x4F1d4AB98b491d9e85607FA58DFc5453cF402416'
  const MONTHLY_SECONDS = String(30 * 24 * 60 * 60)
  const USDC_ADDR = ADDRESSES_SEPOLIA.USDC

  const client = await connectKeeperHub()
  const slugToOnchainId: Record<string, number> = {}

  try {
    // Read current nextId so we know which IDs we'll get
    const nextIdResult = await client.callTool('execute_contract_call', {
      contract_address: ADDRESSES_SEPOLIA.SubscriptionRegistry,
      network: SEPOLIA_CHAIN_ID,
      function_name: 'nextId',
      function_args: '[]',
      abi: JSON.stringify([{
        type: 'function',
        name: 'nextId',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
      }]),
    }) as { result?: string } | string
    const nextIdRaw = typeof nextIdResult === 'string' ? nextIdResult : (nextIdResult.result ?? '1')
    const nextId = parseInt(String(nextIdRaw).replace(/[^\d]/g, ''), 10) || 1
    console.log(`[Hub] SubscriptionRegistry.nextId = ${nextId}`)

    let assignedId = nextId
    for (const sub of seedSubs) {
      const amountWei = String(Math.round(sub.amountUsdc * 1_000_000)) // USDC 6dp

      console.log(`[Hub] Registering sub: ${sub.label} ($${sub.amountUsdc}/mo) → expected id ${assignedId}`)
      try {
        await client.callTool('execute_contract_call', {
          contract_address: ADDRESSES_SEPOLIA.SubscriptionRegistry,
          network: SEPOLIA_CHAIN_ID,
          function_name: 'registerSub',
          function_args: JSON.stringify([USDC_ADDR, RECIPIENT, amountWei, MONTHLY_SECONDS, sub.label]),
          abi: REGISTER_SUB_ABI,
          gas_limit_multiplier: '1.5',
        })
        slugToOnchainId[sub.slug] = assignedId
        assignedId++
        // Brief pause to let the chain settle between txs
        await new Promise((r) => setTimeout(r, 4000))
      } catch (err) {
        console.error(`[Hub] Failed to register ${sub.label}:`, (err as Error).message.slice(0, 200))
        // continue — partial bootstrap is still useful
      }
    }

    if (Object.keys(slugToOnchainId).length === 0) {
      console.warn('[Hub] Subscription registry bootstrap failed for all subs — workflow cancellations will no-op')
      return
    }

    db.prepare(
      'INSERT OR IGNORE INTO keeperhub_workflows (id, pet_id, kind, status, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      `sub-seed-${Date.now()}`,
      0,
      'sub-registry-seed',
      'active',
      JSON.stringify(slugToOnchainId),
      Date.now(),
    )
    console.log(
      `[Hub] Subscription registry seeded: ${JSON.stringify(slugToOnchainId)}`
    )
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

  // Track which pets are currently controlled by an open browser socket.
  // When a browser is driving a pet, the Hub-side wander tick leaves it alone.
  // When all browsers for a pet disconnect, it falls back to headless wander.
  const browserDriven = new Set<number>()

  // Track the last time each pet's position was updated by an actual user
  // key press. If the user releases all keys for 2s, wander takes over —
  // gives the auto-mode UX without a manual toggle.
  const lastMoveAt = new Map<number, number>()
  const IDLE_THRESHOLD_MS = 2_000

  // Pets currently in a conversation pause. While in this Map, the wander tick
  // leaves them alone — they stand still while their bubbles render. Cleared
  // automatically once the timestamp expires.
  const inConversation = new Map<number, number>()  // petId → expiresAt
  const CONVO_PAUSE_MS = 10_000

  io.on('connection', (socket) => {
    let playerId: number | undefined

    socket.on('join', ({ petId }: { petId: number }) => {
      playerId = petId
      socket.join('world')
      browserDriven.add(petId)
      console.log(`[Socket] Pet ${petId} joined (browser-driven)`)
    })

    socket.on('move', ({ x, y, zone }: { x: number; y: number; zone: Zone }) => {
      if (playerId == null) return
      positions.set(playerId, { x, y, zone })
      lastMoveAt.set(playerId, Date.now())
      // Update zone in DB
      db.prepare('UPDATE pets SET pos_x = ?, pos_y = ?, zone = ? WHERE token_id = ?')
        .run(x, y, zone, playerId)
    })

    socket.on('disconnect', () => {
      if (playerId != null) {
        browserDriven.delete(playerId)
        // If this pet has a real worker (= row with peer_id in DB) it stays in
        // positions and falls back to headless wander. If it doesn't, we
        // remove it so other browsers stop seeing a ghost sprite.
        const row = db.prepare(
          "SELECT peer_id FROM pets WHERE token_id = ? AND peer_id IS NOT NULL AND peer_id != ''"
        ).get(playerId) as { peer_id: string } | undefined
        if (!row) {
          positions.delete(playerId)
        }
        io.to('world').emit('petLeft', { petId: playerId })
        console.log(
          `[Socket] Pet ${playerId} disconnected (${row ? 'now headless' : 'removed — no worker'})`
        )
      }
    })
  })

  // ── Headless wander: seed positions for all alive pets at boot, then nudge
  // them every 5s so they drift around the park. Browser-driven pets are
  // skipped (the user is moving them). This makes the proximity broker
  // work without requiring a browser per pet — multiple AXL nodes can
  // chat in the background while a single user watches. Park is (0,0)→(480,480).
  function seedHeadlessPositions() {
    const livePets = db.prepare(
      "SELECT token_id FROM pets WHERE peer_id IS NOT NULL AND peer_id != ''"
    ).all() as Array<{ token_id: number }>

    let seeded = 0
    for (const { token_id } of livePets) {
      if (positions.has(token_id)) continue
      positions.set(token_id, {
        x: 60 + Math.random() * 360,    // 60..420 — inside park, away from edges
        y: 60 + Math.random() * 360,
        zone: 'park',
      })
      seeded++
    }
    if (seeded > 0) console.log(`[Hub] Seeded ${seeded} headless pet position(s) in Park`)
  }

  function wanderTick() {
    const now = Date.now()

    // GC: remove ghost positions for pets that have no peer_id in DB AND
    // haven't been moved by anyone in 30s. Browser tabs that closed without
    // a clean disconnect, or stale entries from an earlier session.
    for (const petId of [...positions.keys()]) {
      const last = lastMoveAt.get(petId) ?? 0
      const stale = now - last > 30_000
      const hasWorker = db.prepare(
        "SELECT 1 FROM pets WHERE token_id = ? AND peer_id IS NOT NULL AND peer_id != ''"
      ).get(petId)
      if (!hasWorker && !browserDriven.has(petId) && stale) {
        positions.delete(petId)
        lastMoveAt.delete(petId)
        console.log(`[Hub] GC ghost position for pet ${petId}`)
      }
    }

    for (const [petId, pos] of positions) {
      // If browser has driven this pet within IDLE_THRESHOLD, leave alone.
      // Otherwise (idle or headless), nudge them.
      const last = lastMoveAt.get(petId) ?? 0
      const recentlyDriven = now - last < IDLE_THRESHOLD_MS
      if (browserDriven.has(petId) && recentlyDriven) continue

      // Pause while in conversation — pets stand still during chat
      const convoUntil = inConversation.get(petId) ?? 0
      if (convoUntil > now) continue
      if (convoUntil > 0) inConversation.delete(petId)

      const nx = clamp(pos.x + (Math.random() - 0.5) * 40, 40, 440)
      const ny = clamp(pos.y + (Math.random() - 0.5) * 40, 40, 440)
      positions.set(petId, { x: nx, y: ny, zone: pos.zone })
    }
  }

  function clamp(v: number, lo: number, hi: number) {
    return v < lo ? lo : v > hi ? hi : v
  }

  // Broadcast all positions at 10 Hz
  setInterval(() => {
    if (io.sockets.adapter.rooms.get('world')?.size) {
      io.to('world').emit('positions', Object.fromEntries(positions))
    }
  }, 100)

  // Proximity chat: when two pets are within 80px, trigger one AXL chat exchange.
  // Tuned for "pets visibly chatting" feel without smashing Anthropic Haiku
  // (50 req/min cap). The canned-opener fallback in the worker means even
  // a 429 doesn't blank the chat — bubble still renders.
  //  - Per-pair cooldown 30s (so same two pets keep talking when adjacent)
  //  - Global throttle 4s (~15 broker fires/min × 2 workers ≈ 30 Haiku/min)
  //  - Random pair selection per tick — fairness across pets
  const lastProximityChat = new Map<string, number>()
  const PROXIMITY_COOLDOWN_MS = 30_000
  let lastBrokerFire = 0
  const BROKER_THROTTLE_MS = 4_000

  setInterval(() => {
    const now = Date.now()
    if (now - lastBrokerFire < BROKER_THROTTLE_MS) return

    const pets = Array.from(positions.entries())
    // Build candidate pairs within 80px that aren't on cooldown
    const candidates: Array<[number, number, { peer_id: string; name: string }, { peer_id: string; name: string }]> = []
    for (let i = 0; i < pets.length; i++) {
      for (let j = i + 1; j < pets.length; j++) {
        const [a, posA] = pets[i]
        const [b, posB] = pets[j]
        if (Math.hypot(posA.x - posB.x, posA.y - posB.y) >= 80) continue
        const pairKey = `${Math.min(a, b)}-${Math.max(a, b)}`
        if ((lastProximityChat.get(pairKey) ?? 0) + PROXIMITY_COOLDOWN_MS > now) continue

        const petA = db.prepare('SELECT peer_id, name FROM pets WHERE token_id = ?')
          .get(a) as { peer_id: string | null; name: string } | undefined
        const petB = db.prepare('SELECT peer_id, name FROM pets WHERE token_id = ?')
          .get(b) as { peer_id: string | null; name: string } | undefined
        if (!petA?.peer_id || !petB?.peer_id) continue

        candidates.push([
          a, b,
          { peer_id: petA.peer_id, name: petA.name },
          { peer_id: petB.peer_id, name: petB.name },
        ])
      }
    }

    if (candidates.length === 0) return

    // Pick one pair at random from candidates to fire this tick.
    const [a, b, petA, petB] = candidates[Math.floor(Math.random() * candidates.length)]
    const pairKey = `${Math.min(a, b)}-${Math.max(a, b)}`
    lastProximityChat.set(pairKey, now)
    lastBrokerFire = now

    // Pause both pets so they stand still while talking
    inConversation.set(a, now + CONVO_PAUSE_MS)
    inConversation.set(b, now + CONVO_PAUSE_MS)

    supervisor.broadcast(a, { type: 'chat-request', withPetId: b, withPeerId: petB.peer_id, withName: petB.name })
    supervisor.broadcast(b, { type: 'chat-request', withPetId: a, withPeerId: petA.peer_id, withName: petA.name })
    console.log(`[Broker] Fired chat-request: pet ${a} <-> pet ${b} (paused ${CONVO_PAUSE_MS / 1000}s)`)
  }, 2_000)

  await supervisor.start()
  bootstrapAdoptionChain().catch(err => console.error('[Hub] adoption-chain bootstrap failed:', err.message))
  bootstrapSubscriptionRegistry().catch(err => console.error('[Hub] sub-registry bootstrap failed:', err.message))

  // A3: ENS heartbeat — bumps lastSeenBlock for every alive pet every 10 min.
  // This makes the KeeperHub mailbox HERO conditional fire organically:
  // a queued gift transfers automatically once recipient's tama.lastSeenBlock
  // is within 5 blocks of head. No more Trigger-Now button required.
  supervisor.startEnsHeartbeat()

  // Wait briefly for re-spawned workers to register peer_ids, then seed positions.
  // After that, nudge them every 5s so the park has constant background motion.
  setTimeout(() => {
    seedHeadlessPositions()
    setInterval(wanderTick, 5_000)
  }, 8_000)
  // Re-seed any newly-minted pets every 30s so freshly-spawned workers join
  // the wander pool once their peer_id lands in the DB.
  setInterval(seedHeadlessPositions, 30_000)

  console.log('[Hub] Ready on http://localhost:3001')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})