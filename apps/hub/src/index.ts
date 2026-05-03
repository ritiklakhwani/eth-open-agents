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
import { registerGlobalChat } from './global-chat'
import { getOgTxHash } from 'og-storage'
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

// All keeperhub workflows — used by the KeeperHub integration panel to show
// judges live workflow rows + on-chain proof. Returns most recent 50.
app.get('/api/keeperhub/workflows', () => {
  const workflows = db.prepare(
    'SELECT id, pet_id, kind, status, payload, created_at FROM keeperhub_workflows ORDER BY created_at DESC LIMIT 50',
  ).all()
  return { workflows }
})

// 0G Vault status — proxies the 0G storage indexer for a given CID and
// returns a clean status the integration panel can render inline. If the
// indexer 404s, we report 'local-cache' (we still have the blob in our
// fallback cache because the testnet Flow contract sometimes reverts on
// upload, but the Merkle root is real).
app.get<{ Params: { cid: string } }>('/api/integration/og-status/:cid', async (req) => {
  const cid = req.params.cid
  const indexerBase = process.env.ZERO_G_INDEXER_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai'
  const indexerUrl  = `${indexerBase}/file?root=${cid}`
  // Side-channel: if og-storage captured an on-chain tx hash from the Go CLI
  // upload, surface it so the integration panel can render a chainscan link.
  const txHash = await getOgTxHash(cid).catch(() => null)
  try {
    const r = await fetch(indexerUrl, { signal: AbortSignal.timeout(4000) })
    if (!r.ok) {
      return { cid, status: 'unreachable', indexer: indexerUrl, message: `HTTP ${r.status}`, txHash }
    }
    const j = await r.json() as { code?: number; data?: unknown; message?: string } | Record<string, unknown>
    // The indexer returns one of two shapes:
    //   1. SUCCESS — the raw blob JSON (no `code` field; whatever the user uploaded)
    //   2. NOT FOUND — `{"code":101,"message":"File not found","data":null}`
    // We treat anything that isn't a `code !== 0` error envelope as "on-0g".
    const isError = typeof (j as { code?: number }).code === 'number' && (j as { code?: number }).code !== 0
    if (!isError) {
      return { cid, status: 'on-0g', indexer: indexerUrl, data: j, txHash }
    }
    return { cid, status: 'local-cache', indexer: indexerUrl, message: (j as { message?: string }).message ?? 'not on indexer', txHash }
  } catch (err) {
    return { cid, status: 'unreachable', indexer: indexerUrl, message: (err as Error).message, txHash }
  }
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

// ── KeeperHub: mailbox inbox (real workflow state) ────────────────────────────
// Returns mailbox workflows touching this pet, split into:
//   inbox   — gifts addressed to me (payload.toPetId === petId)
//   pending — gifts I sent that are queued (pet_id === petId, status active)
// Display names resolved via the pets table.
app.get<{ Querystring: { petId: string } }>(
  '/api/keeperhub/mailbox/inbox',
  (req, reply) => {
    const petId = Number(req.query.petId)
    if (!Number.isFinite(petId)) {
      return reply.status(400).send({ error: 'petId required' })
    }

    type Row = { id: string; pet_id: number; status: string; payload: string | null; created_at: number }
    const rows = db.prepare(
      "SELECT id, pet_id, status, payload, created_at FROM keeperhub_workflows WHERE kind = 'mailbox' ORDER BY created_at DESC",
    ).all() as Row[]

    const petNames = new Map<number, string>()
    const petRows = db.prepare('SELECT token_id, ens_name, name FROM pets').all() as Array<{ token_id: number; ens_name: string | null; name: string | null }>
    for (const p of petRows) {
      petNames.set(p.token_id, p.ens_name ?? p.name ?? `pet-${p.token_id}`)
    }

    interface InboxItem { id: string; from: string; message: string; giftAmountUsdc: number; deliveredAt: number; status: string }
    interface PendingItem { id: string; to: string; message: string; giftAmountUsdc: number; triggerCondition: string; status: string }
    const inbox: InboxItem[] = []
    const pending: PendingItem[] = []

    for (const r of rows) {
      let payload: { toPetId?: number; amountUSDC?: string | number } = {}
      try { payload = JSON.parse(r.payload ?? '{}') } catch {}
      const toPetId = typeof payload.toPetId === 'number' ? payload.toPetId : undefined
      const amount = Number(payload.amountUSDC ?? 0) || 0

      if (toPetId === petId) {
        inbox.push({
          id: r.id,
          from: petNames.get(r.pet_id) ?? `pet-${r.pet_id}`,
          message: '',
          giftAmountUsdc: amount,
          deliveredAt: r.created_at,
          status: r.status,
        })
      }

      if (r.pet_id === petId && r.status === 'active') {
        pending.push({
          id: r.id,
          to: toPetId !== undefined ? (petNames.get(toPetId) ?? `pet-${toPetId}`) : 'unknown',
          message: '',
          giftAmountUsdc: amount,
          triggerCondition: 'recipient ENS lastSeenBlock within 5 of head',
          status: r.status,
        })
      }
    }

    return { petId, inbox, pending }
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

  // Global human-owner text chat (separate channel from pet AXL chat).
  // Registers its own io.on('connection') handler that listens for
  // "user-join" / "user-message" — does not interfere with the pet
  // multiplayer "join" / "move" handlers below.
  registerGlobalChat(io)

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
  // chat in the background while a single user watches.
  // Park zone (matches world.tmj): (635, 485, 395, 283). Seed coords stay
  // inside that rect with a 25px margin so pets don't spawn on the edges.
  function seedHeadlessPositions() {
    const livePets = db.prepare(
      "SELECT token_id FROM pets WHERE peer_id IS NOT NULL AND peer_id != ''"
    ).all() as Array<{ token_id: number }>

    let seeded = 0
    for (const { token_id } of livePets) {
      if (positions.has(token_id)) continue
      // Spawn at a random hotspot — pets distribute across the map instead
      // of all clustering in the same fountain box. wander state then takes
      // over and walks them somewhere else.
      const spawn = HOTSPOTS[Math.floor(Math.random() * HOTSPOTS.length)]
      positions.set(token_id, {
        x: spawn.x + (Math.random() - 0.5) * 40,
        y: spawn.y + (Math.random() - 0.5) * 40,
        zone: 'park',
      })
      seeded++
    }
    if (seeded > 0) console.log(`[Hub] Seeded ${seeded} headless pet position(s) in Park`)
  }

  // ── Goal-based wander state ────────────────────────────────────────────
  // Each pet has a personality (speed + loiter ranges) set at first spawn,
  // plus a current target picked from a hotspot list spread across the map.
  // Result: pets walk purposefully to different parts of the world, pause
  // for varying amounts of time, cross paths organically. No two pets move
  // in lockstep, and they cover the whole map — not just the park.
  interface WanderState {
    target:      { x: number; y: number; linger?: boolean }
    loiterUntil: number  // ms timestamp; stand still until then
    baseSpeed:   number  // pixels per tick (~10Hz tick → 25-50 px/sec)
    // Personality dials, rolled once on first spawn:
    minLoiter:   number  // min ms to loiter at a target
    maxLoiter:   number  // max ms to loiter at a target
  }
  const wanderStates = new Map<number, WanderState>()

  // Hotspot destinations — interesting points spread across the WHOLE map,
  // grouped by region. Pets pick one + small jitter as their next target,
  // so each pet walks to the mailbox, then partner row, then breeding,
  // then battlefield, then pond... looks like an owner is sending them.
  //
  // Some hotspots are flagged as "linger" (pond, fountain) — pets pause
  // longer there so it looks like they're swimming or resting.
  interface Hotspot { x: number; y: number; linger?: boolean }
  const HOTSPOTS: Hotspot[] = [
    // — SOCIETY (favoured for demo presence; ~12 hotspots, biggest cluster)
    // Path band between partner row and civilian houses
    { x: 250, y: 280 }, { x: 360, y: 270 }, { x: 470, y: 260 }, { x: 580, y: 280 },
    { x: 200, y: 320 }, { x: 320, y: 320 }, { x: 440, y: 320 }, { x: 540, y: 320 },
    // Civilian house porches
    { x: 130, y: 380 }, { x: 240, y: 420 }, { x: 360, y: 470 }, { x: 460, y: 500 },

    // — PARTNER ROW porches (in front of integration houses) — 4 spots
    { x: 220, y: 215 }, { x: 380, y: 215 }, { x: 560, y: 215 }, { x: 750, y: 215 },

    // — MAILBOX approach + door (3)
    { x: 640, y: 480 }, { x: 600, y: 380 }, { x: 670, y: 530 },

    // — BREEDING hall front (3)
    { x: 1090, y: 380 }, { x: 1190, y: 440 }, { x: 1240, y: 380 },

    // — BATTLEFIELD arena (3)
    { x: 1100, y: 580 }, { x: 1200, y: 660 }, { x: 1280, y: 580 },

    // — CENTRAL PARK (fountain + benches) — kept small so pets don't all
    // collect here. No linger flag — pets pause normal time then move on.
    { x: 720, y: 620 }, { x: 830, y: 620 }, { x: 940, y: 660 },
    { x: 800, y: 500 },

    // — MARKETPLACE stalls (2)
    { x: 380, y: 660 }, { x: 320, y: 600 },

    // — POND (decorative). Hotspots placed INSIDE wander bounds — earlier
    // x=60 was outside WANDER_X_MIN(100) so every visiting pet clamped
    // to x=100, piling up at the same boundary coord.
    { x: 130, y: 700 },
    { x: 220, y: 730 },

    // — Connecting path waypoints (cross-map traversal)
    { x: 480, y: 380 }, { x: 540, y: 460 },
    { x: 850, y: 400 }, { x: 1000, y: 480 },
    { x: 950, y: 350 },
  ]

  // Soft world bounds for wander — clamps motion to the playable map.
  const WANDER_X_MIN = 100, WANDER_X_MAX = 1290
  const WANDER_Y_MIN = 180, WANDER_Y_MAX = 750

  function pickWanderTarget(): { x: number; y: number; linger?: boolean } {
    const h = HOTSPOTS[Math.floor(Math.random() * HOTSPOTS.length)]
    // ±60px jitter (was ±25) so pets don't snap to nearly-identical coords
    // when they pick the same hotspot. Spreads out crowds.
    return {
      x:      h.x + (Math.random() - 0.5) * 120,
      y:      h.y + (Math.random() - 0.5) * 120,
      linger: h.linger,
    }
  }

  function ensureWanderState(petId: number): WanderState {
    let s = wanderStates.get(petId)
    if (!s) {
      // Personality roll — varied speed only. ALL pets keep moving almost
      // continuously: tiny natural hesitation between targets (200-700ms),
      // never a multi-second idle. The only thing that stops a pet is an
      // active chat (handled separately via inConversation).
      s = {
        target:      pickWanderTarget(),
        // Stagger the first move 0-1500ms so they don't all set off at once.
        loiterUntil: Date.now() + Math.random() * 1500,
        // 2.5-5.0 px / 100ms tick = 25-50 px/sec
        baseSpeed:   2.5 + Math.random() * 2.5,
        // Brief hesitation only — pet flicks to next target almost immediately.
        minLoiter:   200,
        maxLoiter:   700,
      }
      wanderStates.set(petId, s)
    }
    return s
  }

  function wanderTick() {
    const now = Date.now()

    // GC: remove ghost positions for pets that have no peer_id in DB AND
    // haven't been moved by anyone in 30s.
    for (const petId of [...positions.keys()]) {
      const last = lastMoveAt.get(petId) ?? 0
      const stale = now - last > 30_000
      const hasWorker = db.prepare(
        "SELECT 1 FROM pets WHERE token_id = ? AND peer_id IS NOT NULL AND peer_id != ''"
      ).get(petId)
      if (!hasWorker && !browserDriven.has(petId) && stale) {
        positions.delete(petId)
        lastMoveAt.delete(petId)
        wanderStates.delete(petId)
        console.log(`[Hub] GC ghost position for pet ${petId}`)
      }
    }

    for (const [petId, pos] of positions) {
      // If browser has driven this pet within IDLE_THRESHOLD, leave alone —
      // the user is moving them. Reset their wander state so when the user
      // releases keys, the pet picks a fresh target from where it ended up.
      const last = lastMoveAt.get(petId) ?? 0
      const recentlyDriven = now - last < IDLE_THRESHOLD_MS
      if (browserDriven.has(petId) && recentlyDriven) {
        wanderStates.delete(petId)
        continue
      }

      // Pause while in conversation — pets stand still during chat.
      const convoUntil = inConversation.get(petId) ?? 0
      if (convoUntil > now) continue
      if (convoUntil > 0) inConversation.delete(petId)

      const state = ensureWanderState(petId)

      // Loitering at last target → stand still until the timer expires.
      if (state.loiterUntil > now) continue

      const dx = state.target.x - pos.x
      const dy = state.target.y - pos.y
      const dist = Math.hypot(dx, dy)
      if (dist < state.baseSpeed * 1.5) {
        // Arrived. Snap, pick a new target, brief hesitation, then move on.
        positions.set(petId, { x: state.target.x, y: state.target.y, zone: pos.zone })

        // If crowded at the arrival point, pick a target FAR from the cluster
        // center so the next walk leg leaves the crowd. No teleport — the
        // pet just walks away naturally during the next tick.
        let crowded = false
        for (const [otherId, otherPos] of positions) {
          if (otherId === petId) continue
          if (Math.hypot(otherPos.x - state.target.x, otherPos.y - state.target.y) < 70) {
            crowded = true
            break
          }
        }
        if (crowded) {
          // Try a few targets, take the one furthest from current position.
          let best = pickWanderTarget()
          let bestDist = Math.hypot(best.x - state.target.x, best.y - state.target.y)
          for (let i = 0; i < 3; i++) {
            const candidate = pickWanderTarget()
            const cd = Math.hypot(candidate.x - state.target.x, candidate.y - state.target.y)
            if (cd > bestDist) { best = candidate; bestDist = cd }
          }
          state.target = best
          state.loiterUntil = now + 50  // basically no hesitation when crowded
        } else {
          state.target = pickWanderTarget()
          state.loiterUntil = now + state.minLoiter
                                  + Math.random() * (state.maxLoiter - state.minLoiter)
        }
        continue
      }

      // ── Per-tick separation while WALKING (boids-style repulsion) ───────
      // Sum a small repulsion vector from any pet within 50 px, scaled by
      // proximity (closer = stronger push). Combined with the walk vector,
      // this nudges direction smoothly without ever teleporting — fixes the
      // sudden-fast-glitch the user reported.
      let repulseX = 0, repulseY = 0
      for (const [otherId, otherPos] of positions) {
        if (otherId === petId) continue
        const ddx = pos.x - otherPos.x
        const ddy = pos.y - otherPos.y
        const dd  = Math.hypot(ddx, ddy)
        if (dd > 50 || dd < 1) continue
        // Force inverse-proportional to distance, clamped to baseSpeed.
        const force = Math.min(state.baseSpeed * 0.7, (50 - dd) * 0.06)
        repulseX += (ddx / dd) * force
        repulseY += (ddy / dd) * force
      }

      // Step toward target with small directional noise + separation force.
      const noise = state.baseSpeed * 0.15
      const stepX = (dx / dist) * state.baseSpeed + repulseX + (Math.random() - 0.5) * noise
      const stepY = (dy / dist) * state.baseSpeed + repulseY + (Math.random() - 0.5) * noise
      const nx = clamp(pos.x + stepX, WANDER_X_MIN, WANDER_X_MAX)
      const ny = clamp(pos.y + stepY, WANDER_Y_MIN, WANDER_Y_MAX)
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

  // Proximity chat: when two pets are within PROXIMITY_INIT_PX, fire one
  // AXL chat exchange almost immediately. Workers then bounce replies back
  // and forth via AXL until the pets drift past PROXIMITY_BREAK_PX (chat-end
  // IPC kills the in-flight reply at the worker so no stale bubble lands).
  // Canned-opener fallback in the worker means even a 429 from Anthropic
  // doesn't blank the chat — bubble still renders.
  //  - PROXIMITY_INIT_PX 140  (fire as soon as two pets approach)
  //  - PROXIMITY_BREAK_PX 220 (don't end on small wander drift mid-chat)
  //  - PROXIMITY_COOLDOWN_MS 3s (allow re-conversation after a brief gap)
  //  - BROKER_THROTTLE_MS 250ms (effectively per-tick — chat starts fast)
  const PROXIMITY_INIT_PX     = 140
  const PROXIMITY_BREAK_PX    = 220
  const PROXIMITY_COOLDOWN_MS = 3_000
  const BROKER_THROTTLE_MS    = 250

  const lastProximityChat = new Map<string, number>()
  let lastBrokerFire = 0

  // Pets currently engaged in a Hub-brokered conversation. Both directions of
  // the pair share the same entry; cleared when bubble lands or proximity breaks.
  const activeChats = new Map<number, number>()  // petId -> partnerPetId

  // Per-pet "just ended a chat" cooldown — blocks the broker from re-pairing
  // a pet for 1.5s after their last chat ended. Without this, in-flight
  // chat-outs from the previous pairing arrive at the gate AFTER activeChats
  // has been overwritten by a new pairing → "no-longer-paired" drops.
  const recentlyPaired = new Map<number, number>()  // petId -> unblockAtMs
  const RE_PAIR_COOLDOWN_MS = 1_500

  function distanceBetween(a: number, b: number): number | null {
    const pa = positions.get(a)
    const pb = positions.get(b)
    if (!pa || !pb) return null
    return Math.hypot(pa.x - pb.x, pa.y - pb.y)
  }

  function endChat(a: number, b: number) {
    if (activeChats.get(a) === b) activeChats.delete(a)
    if (activeChats.get(b) === a) activeChats.delete(b)
    // Mark both as recently paired — cooldown prevents an immediate re-pair
    // race that drops in-flight chat-outs from this just-ended chat.
    const unblockAt = Date.now() + RE_PAIR_COOLDOWN_MS
    recentlyPaired.set(a, unblockAt)
    recentlyPaired.set(b, unblockAt)
    // Tell both workers to abort any in-flight reply they were about to send
    supervisor.broadcast(a, { type: 'chat-end', withPetId: b })
    supervisor.broadcast(b, { type: 'chat-end', withPetId: a })
  }

  // Gate every chat-out IPC: if the speaker is no longer paired with the
  // listener, or they've drifted past PROXIMITY_BREAK_PX, drop the bubble.
  // Also refreshes the wander-pause for BOTH participants every time a
  // chat passes the gate — so pets stand still for the entire conversation,
  // not just the initial 10-second CONVO_PAUSE_MS window.
  // Returns one of: true (deliver), 'not-paired', 'drift', or 'no-position'.
  supervisor.setChatGate((fromId, toId) => {
    const partner = activeChats.get(fromId)
    if (partner !== toId) {
      console.log(`[Broker] gate drop: pet ${fromId}->${toId} no-longer-paired (active=${partner ?? 'none'})`)
      return false
    }
    const d = distanceBetween(fromId, toId)
    if (d == null) {
      console.log(`[Broker] gate drop: pet ${fromId}->${toId} no-position`)
      return false
    }
    if (d > PROXIMITY_BREAK_PX) {
      endChat(fromId, toId)
      console.log(`[Broker] gate drop: pet ${fromId}<->${toId} drifted ${d.toFixed(0)}px`)
      return false
    }
    // Refresh wander pause for both participants — keep them still while
    // chatting actively. Cleared automatically when activeChats is cleared.
    const now = Date.now()
    inConversation.set(fromId, now + CONVO_PAUSE_MS)
    inConversation.set(toId,   now + CONVO_PAUSE_MS)
    return true
  })

  setInterval(() => {
    const now = Date.now()

    // Sweep: if any active pair drifted past the break threshold, end it now
    // so the next reply is skipped at the IPC layer.
    for (const [petId, partner] of activeChats) {
      if (petId > partner) continue   // process each pair once
      const d = distanceBetween(petId, partner)
      if (d == null || d > PROXIMITY_BREAK_PX) {
        endChat(petId, partner)
        console.log(`[Broker] Chat swept pet ${petId}<->${partner} (drift)`)
      }
    }

    if (now - lastBrokerFire < BROKER_THROTTLE_MS) return

    const pets = Array.from(positions.entries())
    // Build candidate pairs within PROXIMITY_INIT_PX that aren't on cooldown
    const candidates: Array<[number, number, { peer_id: string; name: string }, { peer_id: string; name: string }]> = []
    for (let i = 0; i < pets.length; i++) {
      for (let j = i + 1; j < pets.length; j++) {
        const [a, posA] = pets[i]
        const [b, posB] = pets[j]
        if (Math.hypot(posA.x - posB.x, posA.y - posB.y) >= PROXIMITY_INIT_PX) continue
        const pairKey = `${Math.min(a, b)}-${Math.max(a, b)}`
        if ((lastProximityChat.get(pairKey) ?? 0) + PROXIMITY_COOLDOWN_MS > now) continue
        if (activeChats.has(a) || activeChats.has(b)) continue
        // Per-pet cooldown after a just-ended chat — gives in-flight chat-outs
        // from the previous pairing time to land at the gate before a new
        // pairing replaces activeChats[pet].
        const cdA = recentlyPaired.get(a) ?? 0
        const cdB = recentlyPaired.get(b) ?? 0
        if (cdA > now || cdB > now) continue
        if (cdA && cdA <= now) recentlyPaired.delete(a)
        if (cdB && cdB <= now) recentlyPaired.delete(b)

        const petA = db.prepare('SELECT peer_id, name FROM pets WHERE token_id = ?')
          .get(a) as { peer_id: string | null; name: string } | undefined
        const petB = db.prepare('SELECT peer_id, name FROM pets WHERE token_id = ?')
          .get(b) as { peer_id: string | null; name: string } | undefined
        if (!petA || !petB) continue
        // peer_id may be null if AXL didn't initialize. axl.send has a Hub-relay
        // fallback that doesn't need peer_id, so we still queue the pair.
        candidates.push([
          a, b,
          { peer_id: petA.peer_id ?? '', name: petA.name },
          { peer_id: petB.peer_id ?? '', name: petB.name },
        ])
      }
    }

    if (candidates.length === 0) return
    console.log(`[Broker] tick — ${candidates.length} eligible pair(s)`)

    // Sort candidates so player-involved pairs fire first (any pet that's
    // currently browser-driven). Then take up to MAX_FIRES_PER_TICK pairs.
    candidates.sort((c1, c2) => {
      const c1Player = browserDriven.has(c1[0]) || browserDriven.has(c1[1]) ? 1 : 0
      const c2Player = browserDriven.has(c2[0]) || browserDriven.has(c2[1]) ? 1 : 0
      return c2Player - c1Player
    })

    const MAX_FIRES_PER_TICK = 3
    lastBrokerFire = now

    // Track pets already paired in this tick. Without this, two candidate
    // pairs that share a pet (e.g., 31<->44 and 36<->44) both fire and the
    // second overwrites activeChats[44], making the first chat's IPC fail
    // the gate ("not paired anymore").
    const pairedThisTick = new Set<number>()

    let firedCount = 0
    for (const [a, b, petA, petB] of candidates) {
      if (firedCount >= MAX_FIRES_PER_TICK) break
      if (pairedThisTick.has(a) || pairedThisTick.has(b)) continue

      const pairKey = `${Math.min(a, b)}-${Math.max(a, b)}`
      lastProximityChat.set(pairKey, now)
      // Pause both pets so they stand still while talking
      inConversation.set(a, now + CONVO_PAUSE_MS)
      inConversation.set(b, now + CONVO_PAUSE_MS)
      activeChats.set(a, b)
      activeChats.set(b, a)
      pairedThisTick.add(a)
      pairedThisTick.add(b)
      supervisor.broadcast(a, { type: 'chat-request', withPetId: b, withPeerId: petB.peer_id, withName: petB.name })
      supervisor.broadcast(b, { type: 'chat-request', withPetId: a, withPeerId: petA.peer_id, withName: petA.name })
      console.log(`[Broker] Fired chat-request: pet ${a} <-> pet ${b}`)
      firedCount++
    }
  }, 250)   // tick fast so chat starts within ~250ms of pets coming close

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
    // Wander tick at 10Hz (every 100ms — matching the position broadcast
    // cadence). Combined with per-pet speeds of 1.5-3 px/tick, pets cross
    // the map at ~15-30 px/sec. Tiny per-tick steps + frontend tween over
    // 110ms = buttery-smooth motion. Each pet has its own target, speed,
    // and personality loiter range so they never move in lockstep.
    setInterval(wanderTick, 100)
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