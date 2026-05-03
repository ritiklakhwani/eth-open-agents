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
import { connectKeeperHub } from 'keeperhub/client.js'
import type { Zone } from 'shared-types'
import { battleIdToEscrowKey } from 'contracts-sdk'

// ── Shared event bus (pet workers → SSE clients) ─────────────────────────────
const petEvents = new EventEmitter()

// ── DB + Supervisor ───────────────────────────────────────────────────────────
const db         = initDB()
const supervisor = new PetSupervisor(db)
let worldIO: SocketIOServer | undefined

// ── Fastify ───────────────────────────────────────────────────────────────────
const app = Fastify({ logger: true })
await app.register(cors, { origin: '*' })

type MailboxDeliveredBody = {
  workflowId?: string
  workflowName?: string
  fromPetId?: number
  toPetId?: number
  amountUSDC?: string | number
  executionId?: string | null
  /// Sepolia tx hash of the actual ERC20 transfer fired by KeeperHub's
  /// transfer-1 node. Surface this in the inbox so judges can click and
  /// see the on-chain proof on Etherscan.
  txHash?: string | null
}

type MailboxWorkflowPayload = {
  toPetId?: number | string
  amountUSDC?: string | number
  message?: string
  deliveryMode?: string
  deliveredAt?: number
  executionId?: string | null
  txHash?: string | null
  lastAutoDeliveryAttemptAt?: number
  lastAutoDeliveryError?: string
}

function parseMailboxPayload(payload: string | null): MailboxWorkflowPayload {
  try {
    return JSON.parse(payload ?? '{}') as MailboxWorkflowPayload
  } catch {
    return {}
  }
}

function hasPublicHubBaseUrl(): boolean {
  const raw = process.env.HUB_BASE_URL?.trim()
  if (!raw) return false

  try {
    const { hostname } = new URL(raw)
    return !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)
  } catch {
    return false
  }
}

function markMailboxWorkflowDelivered(body: MailboxDeliveredBody):
  | { ok: true; workflowId: string; status: 'completed'; deliveredAt: number }
  | { ok: false; error: string } {
  const { workflowId, workflowName, fromPetId, toPetId, amountUSDC, executionId, txHash } = body

  type Row = { id: string; pet_id: number; payload: string | null }
  let row: Row | undefined
  const nameMatch = workflowName?.match(/^mailbox-(\d+)-to-(\d+)$/)
  const lookupFromPetId = typeof fromPetId === 'number' && Number.isFinite(fromPetId)
    ? fromPetId
    : nameMatch ? Number(nameMatch[1]) : undefined
  const lookupToPetId = typeof toPetId === 'number' && Number.isFinite(toPetId)
    ? toPetId
    : nameMatch ? Number(nameMatch[2]) : undefined

  if (workflowId) {
    row = db.prepare(
      "SELECT id, pet_id, payload FROM keeperhub_workflows WHERE id = ? AND kind = 'mailbox'",
    ).get(workflowId) as Row | undefined
  }

  if (!row && lookupFromPetId !== undefined && lookupToPetId !== undefined) {
    const candidates = db.prepare(
      "SELECT id, pet_id, payload FROM keeperhub_workflows WHERE kind = 'mailbox' AND pet_id = ? AND status = 'active' ORDER BY created_at DESC",
    ).all(lookupFromPetId) as Row[]

    row = candidates.find((candidate) => {
      const payload = parseMailboxPayload(candidate.payload)
      const sameRecipient = Number(payload.toPetId) === lookupToPetId
      const sameAmount = amountUSDC === undefined || String(payload.amountUSDC ?? '') === String(amountUSDC)
      return sameRecipient && sameAmount
    })
  }

  if (!row) {
    return { ok: false, error: 'mailbox workflow not found' }
  }

  const payload = parseMailboxPayload(row.payload) as Record<string, unknown>
  const deliveredAt = Date.now()
  const nextPayload: Record<string, unknown> = {
    ...payload,
    deliveredAt,
    executionId: executionId ?? payload.executionId ?? null,
    txHash:      txHash ?? (payload as { txHash?: string }).txHash ?? null,
  }

  db.prepare(
    "UPDATE keeperhub_workflows SET status = 'completed', payload = ? WHERE id = ? AND kind = 'mailbox'",
  ).run(JSON.stringify(nextPayload), row.id)

  worldIO?.to('world').emit('activity', {
    type: 'mailbox-delivered',
    petId: row.pet_id,
    toPetId: typeof nextPayload.toPetId === 'number' ? nextPayload.toPetId : lookupToPetId,
    workflowId: row.id,
    timestamp: deliveredAt,
  })

  return { ok: true, workflowId: row.id, status: 'completed', deliveredAt }
}

function startMailboxAutoDelivery() {
  if (!process.env.KEEPERHUB_API_KEY) {
    console.warn('[Mailbox] Auto-delivery disabled: KEEPERHUB_API_KEY not set')
    return
  }

  type Row = { id: string; pet_id: number; payload: string | null }
  type PetRow = { name: string | null; peer_id: string | null }
  const inFlight = new Set<string>()
  let running = false

  const tick = async () => {
    if (running) return
    running = true
    try {
      const rows = db.prepare(
        "SELECT id, pet_id, payload FROM keeperhub_workflows WHERE kind = 'mailbox' AND status = 'active' ORDER BY created_at ASC",
      ).all() as Row[]

      for (const row of rows) {
        if (inFlight.has(row.id)) continue
        const payload = parseMailboxPayload(row.payload)

        const toPetId = Number(payload.toPetId)
        if (!Number.isFinite(toPetId)) continue

        const toPet = db.prepare('SELECT name, peer_id FROM pets WHERE token_id = ?')
          .get(toPetId) as PetRow | undefined
        if (!toPet?.name || !toPet.peer_id || !supervisor.hasWorker(toPetId)) {
          console.log(`[Mailbox] Workflow ${row.id} waiting for recipient pet ${toPetId} to be online`)
          continue
        }

        const now = Date.now()
        const lastAttempt = typeof payload.lastAutoDeliveryAttemptAt === 'number'
          ? payload.lastAutoDeliveryAttemptAt
          : 0
        if (lastAttempt + 120_000 > now) continue

        inFlight.add(row.id)
        try {
          const nextPayload = {
            ...payload,
            lastAutoDeliveryAttemptAt: now,
            lastAutoDeliveryError: undefined,
            autoDeliveryMode: hasPublicHubBaseUrl() ? 'hub-auto-with-webhook' : 'hub-auto',
          }
          db.prepare(
            "UPDATE keeperhub_workflows SET payload = ? WHERE id = ? AND kind = 'mailbox' AND status = 'active'",
          ).run(JSON.stringify(nextPayload), row.id)

          await supervisor.bumpLastSeen(toPet.name)

          const client = await connectKeeperHub()
          let executionId: string | null = null
          let txHash: string | null = null
          try {
            const exec = await client.callTool('execute_workflow', { workflowId: row.id }) as { executionId?: string }
            executionId = exec.executionId ?? null

            // Poll until execution finishes, then read logs to extract the
            // transfer node's on-chain tx hash. Without this the judge has
            // no clickable proof — just a workflow status.
            if (executionId) {
              for (let i = 0; i < 12; i++) {
                await new Promise(r => setTimeout(r, 3_000))
                const st = await client.callTool('get_execution_status', { executionId }) as { status?: string }
                if (st.status && !['running', 'pending', 'queued'].includes(st.status)) break
              }
              const logs = await client.callTool('get_execution_logs', { executionId }) as {
                logs?: Array<{ nodeId: string; output: { transactionHash?: string } | null }>
              }
              const transferLog = (logs.logs ?? []).find(l => l.nodeId === 'transfer-1')
              txHash = transferLog?.output?.transactionHash ?? null
            }
          } finally {
            await client.close()
          }

          const result = markMailboxWorkflowDelivered({
            workflowId: row.id,
            fromPetId: row.pet_id,
            toPetId,
            amountUSDC: payload.amountUSDC,
            executionId,
            txHash,
          })
          if (!result.ok) {
            console.warn(`[Mailbox] Auto-delivery could not mark ${row.id}: ${result.error}`)
          } else {
            console.log(`[Mailbox] Auto-delivered workflow ${row.id} to pet ${toPetId} (tx ${txHash ?? 'pending'})`)
          }
        } catch (err) {
          const latestPayload = parseMailboxPayload(row.payload)
          db.prepare(
            "UPDATE keeperhub_workflows SET payload = ? WHERE id = ? AND kind = 'mailbox' AND status = 'active'",
          ).run(JSON.stringify({
            ...latestPayload,
            lastAutoDeliveryAttemptAt: Date.now(),
            lastAutoDeliveryError: (err as Error).message.slice(0, 200),
          }), row.id)
          console.warn(`[Mailbox] Auto-delivery failed for ${row.id}: ${(err as Error).message}`)
        } finally {
          inFlight.delete(row.id)
        }
      }
    } finally {
      running = false
    }
  }

  setTimeout(() => { void tick() }, 5_000)
  setInterval(() => { void tick() }, 15_000)
  console.log(`[Mailbox] Auto-delivery bridge enabled (${hasPublicHubBaseUrl() ? 'public webhook acknowledgements enabled' : 'local mode'})`)
}

// ── REST routes ───────────────────────────────────────────────────────────────
app.get('/api/pets', () =>
  db.prepare('SELECT * FROM pets').all()
)

app.get('/api/keeperhub/webhook/health', () => ({
  ok: true,
  mode: hasPublicHubBaseUrl() ? 'hub-auto-with-webhook' : 'hub-auto',
  hubBaseUrl: hasPublicHubBaseUrl() ? process.env.HUB_BASE_URL?.trim().replace(/\/$/, '') : null,
  timestamp: Date.now(),
}))

app.get<{ Params: { id: string } }>('/api/pets/:id', (req, reply) => {
  const tokenId = Number(req.params.id)
  const pet = db.prepare('SELECT * FROM pets WHERE token_id = ?').get(tokenId)
  if (!pet) return reply.status(404).send({ error: 'Pet not found' })
  // Count distinct partners with strength >= 3 — the threshold the
  // pet-runtime memory module uses to fire the first ENS attestation.
  // Anyone the pet has chatted with at least 3 times counts as a friend.
  const friends = db.prepare(
    'SELECT COUNT(*) AS n FROM friendships WHERE (pet_a = ? OR pet_b = ?) AND strength >= 3',
  ).get(tokenId, tokenId) as { n: number } | undefined
  return { ...(pet as object), friendsCount: friends?.n ?? 0 }
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
app.post<{ Body: { fromPetId: number; toPetId: number; amountUSDC: string; message?: string } }>(
  '/api/keeperhub/mailbox/send',
  (req, reply) => {
    const { fromPetId, toPetId, amountUSDC } = req.body
    const message = typeof req.body.message === 'string' ? req.body.message.slice(0, 200) : ''
    const toPet = db.prepare('SELECT ens_name, wallet_address FROM pets WHERE token_id = ?')
      .get(toPetId) as { ens_name: string; wallet_address: string } | undefined
    if (!toPet) return reply.status(404).send({ error: 'Recipient pet not found' })

    supervisor.broadcast(fromPetId, {
      type:                'mailbox-send',
      toPetId,
      toPetEnsName:        toPet.ens_name,
      toPetWalletAddress:  toPet.wallet_address,
      amountUSDC,
      message,
      walletIntegrationId: process.env.KEEPERHUB_WALLET_INTEGRATION_ID ?? '',
    })
    return { ok: true }
  },
)

// ── KeeperHub: mailbox inbox (real workflow state) ────────────────────────────
// Returns mailbox workflows touching this pet, split into:
//   inbox   — gifts addressed to me that have actually completed delivery
//   pending — gifts I sent that are still queued (pet_id === petId, status active)
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

    interface InboxItem {
      id:            string
      from:          string
      message:       string
      giftAmountUsdc: number
      deliveredAt:   number
      status:        string
      /// Sepolia tx hash from KeeperHub's transfer node — clickable Etherscan
      /// proof for judges. Null if delivery hasn't fired yet (status=active).
      txHash:        string | null
      /// KeeperHub workflow id — surfaces a clickable link to the workflow
      /// graph in KeeperHub dashboard, showing the conditional + transfer.
      workflowId:    string
    }
    interface PendingItem { id: string; to: string; message: string; giftAmountUsdc: number; triggerCondition: string; status: string; workflowId: string }
    const inbox: InboxItem[] = []
    const pending: PendingItem[] = []

    const deliveredStatuses = new Set(['completed', 'delivered'])

    for (const r of rows) {
      let payload: { toPetId?: number; amountUSDC?: string | number; deliveredAt?: number; message?: string; txHash?: string | null } = {}
      try { payload = JSON.parse(r.payload ?? '{}') } catch {}
      const toPetId = typeof payload.toPetId === 'number' ? payload.toPetId : undefined
      const amount = Number(payload.amountUSDC ?? 0) || 0
      const message = typeof payload.message === 'string' ? payload.message : ''
      const txHash = typeof payload.txHash === 'string' ? payload.txHash : null

      if (toPetId === petId && deliveredStatuses.has(r.status)) {
        inbox.push({
          id: r.id,
          from: petNames.get(r.pet_id) ?? `pet-${r.pet_id}`,
          message,
          giftAmountUsdc: amount,
          deliveredAt: typeof payload.deliveredAt === 'number' ? payload.deliveredAt : r.created_at,
          status: r.status,
          txHash,
          workflowId: r.id,
        })
      }

      if (r.pet_id === petId && r.status === 'active') {
        pending.push({
          id: r.id,
          to: toPetId !== undefined ? (petNames.get(toPetId) ?? `pet-${toPetId}`) : 'unknown',
          message,
          giftAmountUsdc: amount,
          triggerCondition: 'recipient ENS lastSeenBlock within 30 blocks of head',
          status: r.status,
          workflowId: r.id,
        })
      }
    }

    return { petId, inbox, pending }
  },
)

// KeeperHub calls this after a mailbox transfer executes. The demo
// trigger-latest route also calls it after execute_workflow succeeds.
app.post<{
  Body: MailboxDeliveredBody
}>('/api/keeperhub/mailbox/delivered', (req, reply) => {
  const result = markMailboxWorkflowDelivered(req.body)
  if (!result.ok) {
    return reply.status(404).send({ error: result.error })
  }
  return result
})

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
app.post<{ Body: { petAId: number; petBId: number; stakeAmount: string; format?: string } }>(
  '/api/battle/start',
  (req, reply) => {
    const { petAId, petBId, stakeAmount } = req.body
    const format = req.body.format ?? 'debate'
    type PetRow = { peer_id: string | null; name: string; ens_name: string | null; wallet_address: string }
    const petA = db.prepare('SELECT peer_id, name, wallet_address FROM pets WHERE token_id = ?').get(petAId) as PetRow | undefined
    const petB = db.prepare('SELECT peer_id, name, ens_name, wallet_address FROM pets WHERE token_id = ?').get(petBId) as PetRow | undefined
    if (!petA?.peer_id || !petB?.peer_id || !supervisor.hasWorker(petAId) || !supervisor.hasWorker(petBId)) {
      return reply.status(400).send({ error: 'Pets not ready' })
    }

    const judgeCandidates = db.prepare(
      'SELECT token_id, name, ens_name, peer_id FROM pets WHERE token_id NOT IN (?, ?) AND peer_id IS NOT NULL LIMIT 1'
    ).all(petAId, petBId) as Array<{ token_id: number; name: string | null; ens_name: string | null; peer_id: string }>
    const judges = judgeCandidates.filter(j => supervisor.hasWorker(j.token_id)).slice(0, 1)

    const battleId = `battle-${randomBytes(8).toString('hex')}`
    db.prepare(
      'INSERT OR IGNORE INTO battles (id, pet_a, pet_b, stake, format, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(battleId, petAId, petBId, stakeAmount, format, 'active', Date.now())
    supervisor.recordBattleEvent(
      battleId,
      'matched',
      `${petA.name} matched with ${petB.name} for ${format}. ${stakeAmount} USDC stake selected.`,
      petAId,
      {
        track: 'Gensyn AXL + BattleEscrow + ENS',
        stakeAmount,
        format,
        opponentPetId: petBId,
        judgePetIds: judges.map(j => j.token_id),
      },
    )
    supervisor.recordBattleEvent(
      battleId,
      'judges',
      judges.length > 0
        ? `Judge selected: ${judges[0].ens_name ?? judges[0].name ?? `pet-${judges[0].token_id}`}.`
        : 'No judge pet available; battle will fall back to timeout/tie handling.',
      undefined,
      { judgeCount: judges.length },
    )

    supervisor.broadcast(petAId, {
      type:        'battle-start',
      battleId,
      format,
      myWallet:    petA.wallet_address,
      withPetId:   petBId,
      withPeerId:  petB.peer_id,
      withName:    petB.name,
      withWallet:  petB.wallet_address,
      stakeAmount,
      judges:      judges.map(j => ({ petId: j.token_id, peerId: j.peer_id })),
    })
    return { ok: true, battleId, escrowBattleKey: battleIdToEscrowKey(battleId) }
  },
)

/// Active battles this pet is part of (initiator or opponent). Lets the
/// opponent open the arena with the same `battleId` to stake without re-queuing.
app.get<{ Querystring: { petId: string } }>(
  '/api/battle/pending-for-pet',
  (req, reply) => {
    const raw = req.query.petId
    const petId = typeof raw === 'string' ? Number(raw) : Number.NaN
    if (!Number.isFinite(petId) || petId <= 0) {
      return reply.status(400).send({ error: 'petId required' })
    }
    type Row = {
      id: string
      pet_a: number
      pet_b: number
      stake: string
      format: string
      status: string
      created_at: number
    }
    const rows = db
      .prepare(
        `SELECT id, pet_a, pet_b, stake, format, status, created_at
         FROM battles
         WHERE status = 'active' AND (pet_a = ? OR pet_b = ?)
         ORDER BY created_at DESC`,
      )
      .all(petId, petId) as Row[]

    type NameRow = { name: string | null; ens_name: string | null }
    const nameFor = (tid: number) =>
      db.prepare('SELECT name, ens_name FROM pets WHERE token_id = ?').get(tid) as NameRow | undefined

    const battles = rows.map((r) => {
      const isA = r.pet_a === petId
      const opponentPetId = isA ? r.pet_b : r.pet_a
      const opp = nameFor(opponentPetId)
      const stakeNum = Number.parseFloat(r.stake)
      const stakeUsdc = Number.isFinite(stakeNum) ? stakeNum : 0
      return {
        battleId:        r.id,
        escrowBattleKey: battleIdToEscrowKey(r.id),
        /** BattleEscrow on-chain pet1 is always Hub `pet_a` (who queued). */
        escrowPet1TokenId: r.pet_a,
        yourPetId:       petId,
        opponentPetId,
        opponentName:    opp?.name ?? `pet-${opponentPetId}`,
        opponentEnsName: opp?.ens_name ?? `${opp?.name ?? `pet-${opponentPetId}`}.tama.eth`,
        role:            isA ? ('initiator' as const) : ('opponent' as const),
        stakeUsdc,
        format:          r.format,
      }
    })

    return { battles }
  },
)

app.get<{ Querystring: { battleId: string } }>(
  '/api/battle/status',
  async (req, reply) => {
    const { battleId } = req.query
    if (!battleId) return reply.status(400).send({ error: 'battleId required' })
    type BattleRow = { id: string; pet_a: number; pet_b: number; stake: string; format: string; status: string; winner: number | null; judges: string | null; payouts: string | null; created_at: number; settled_at: number | null }
    const row = db.prepare('SELECT * FROM battles WHERE id = ?').get(battleId) as BattleRow | undefined
    if (!row) return reply.status(404).send({ error: 'Battle not found' })
    type EventRow = { phase: string; detail: string; pet_id: number | null; metadata: string | null; created_at: number }
    const eventRows = db.prepare(
      'SELECT phase, detail, pet_id, metadata, created_at FROM battle_events WHERE battle_id = ? ORDER BY created_at ASC',
    ).all(battleId) as EventRow[]
    const pets = db.prepare('SELECT token_id, name, ens_name FROM pets').all() as Array<{ token_id: number; name: string | null; ens_name: string | null }>
    const petNames = new Map(pets.map(p => [p.token_id, p.ens_name ?? p.name ?? `pet-${p.token_id}`]))
    const judges = row.judges ? JSON.parse(row.judges) as Array<{ petId: number; score: number; reasoning: string }> : []
    const opponentOfWinner = row.winner === row.pet_a ? row.pet_b : row.pet_a
    const judgeVotes = judges.map(j => ({
      judge: petNames.get(j.petId) ?? `pet-${j.petId}`,
      votedFor: j.score === 1
        ? (petNames.get(row.winner ?? 0) ?? `pet-${row.winner}`)
        : (petNames.get(opponentOfWinner) ?? `pet-${opponentOfWinner}`),
      reasoning: j.reasoning,
    }))
    const events = eventRows.map(e => {
      let metadata: Record<string, unknown> = {}
      try { metadata = JSON.parse(e.metadata ?? '{}') as Record<string, unknown> } catch {}
      return {
        at: e.created_at - row.created_at,
        phase: e.phase,
        detail: e.detail,
        petId: e.pet_id,
        petName: e.pet_id ? (petNames.get(e.pet_id) ?? `pet-${e.pet_id}`) : null,
        metadata,
        petWon: row.winner != null ? row.winner === row.pet_a : undefined,
      }
    })
    const current = events[events.length - 1] ?? {
      at: 0,
      phase: 'matched',
      detail: 'Battle matched. Waiting for first AXL event.',
      petId: null,
      petName: null,
      metadata: {},
      petWon: undefined,
    }
    const payouts = row.payouts ? JSON.parse(row.payouts) : []
    const revEvents = [...events].reverse()
    const metaHit = revEvents.find(
      e => typeof e.metadata.settlementTxHash === 'string' || typeof e.metadata.txHash === 'string',
    )
    const payoutTxHash =
      typeof metaHit?.metadata.settlementTxHash === 'string'
        ? metaHit.metadata.settlementTxHash
        : typeof metaHit?.metadata.txHash === 'string'
          ? metaHit.metadata.txHash
          : null

    const verdictRow = [...eventRows].reverse().find(e => e.phase === 'verdict' || e.phase === 'error')
    let verdictMeta: Record<string, unknown> = {}
    try {
      verdictMeta = JSON.parse(verdictRow?.metadata ?? '{}') as Record<string, unknown>
    } catch {}
    const settlementError =
      typeof verdictMeta.settlementError === 'string' ? verdictMeta.settlementError : null
    const workerOnChainStatus =
      typeof verdictMeta.onChainStatus === 'string' ? verdictMeta.onChainStatus : null

    let escrowOnChain: { pet1Staked: boolean; pet2Staked: boolean; settled: boolean } | null = null
    const sepoliaRpc = process.env.SEPOLIA_RPC_URL
    if (sepoliaRpc) {
      try {
        const { createPublicClient, http } = await import('viem')
        const { sepolia } = await import('viem/chains')
        const { battleIdToEscrowKey, ADDRESSES_SEPOLIA, BattleEscrowABI, parseBattleEscrowBattlesRead } = await import('contracts-sdk')
        const client = createPublicClient({ chain: sepolia, transport: http(sepoliaRpc) })
        const key = battleIdToEscrowKey(battleId)
        const raw = await client.readContract({
          address:      ADDRESSES_SEPOLIA.BattleEscrow,
          abi:          BattleEscrowABI,
          functionName: 'battles',
          args:         [key],
        })
        const br = parseBattleEscrowBattlesRead(raw)
        if (br && br.pet1 !== '0x0000000000000000000000000000000000000000') {
          escrowOnChain = {
            pet1Staked: br.pet1Staked,
            pet2Staked: br.pet2Staked,
            settled:    br.settled,
          }
        }
      } catch {
        /* RPC flake — omit escrowOnChain */
      }
    }

    return {
      battleId:  row.id,
      petA:      row.pet_a,
      petB:      row.pet_b,
      stake:     row.stake,
      format:    row.format,
      status:    row.status,
      winner:    row.winner ?? null,
      judges,
      judgeVotes,
      payouts,
      createdAt: row.created_at,
      settledAt: row.settled_at ?? null,
      elapsedMs: (row.settled_at ?? Date.now()) - row.created_at,
      events,
      current,
      finished: row.status !== 'active',
      escrowSettledOnChain: row.status === 'settled',
      escrowOnChain,
      payoutTxHash,
      settlementTxHash: payoutTxHash,
      settlementError,
      workerOnChainStatus,
      source: 'hub',
    }
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
  worldIO = io
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

  // Set later when runBrokerPass is wired up. Called from socket move
  // handler to fire chats immediately on player movement (push-based)
  // instead of waiting up to 100ms for the next scheduled broker tick.
  let pushBroker: (() => void) | null = null

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
      // Push-based broker fire — react to player approach immediately rather
      // than waiting for the next 100ms scheduled tick. Cuts perceived
      // chat-fire latency by 0-100ms on player↔NPC encounters.
      pushBroker?.()
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
  // plus a current target picked from a CELL GRID with recent-cell exclusion
  // so the pet is forced to explore the whole map instead of returning to
  // the same dense hotspot regions. Combined with the chat caps in endChat
  // and the duration sweep, this keeps the world looking alive everywhere.
  interface WanderState {
    target:      { x: number; y: number; linger?: boolean }
    loiterUntil: number  // ms timestamp; stand still until then
    baseSpeed:   number  // pixels per tick (~10Hz tick)
    // Personality dials, rolled once on first spawn:
    minLoiter:   number  // min ms to loiter at a target
    maxLoiter:   number  // max ms to loiter at a target
    // Last few grid cells this pet visited — fallback exclusion only used
    // when popping the zoneDeck doesn't yield a meaningful destination.
    recentCells: number[]
    // Shuffled queue of NAMED_ZONES indices. Pet pops from the head to
    // pick its next destination; when empty, a fresh shuffle is drawn.
    zoneDeck:    number[]
    lastZone:    number  // index of the most recently visited zone, -1 = none
    // Index of the zone this pet is CURRENTLY heading to. Used to release
    // its slot in zoneTargetCount when it picks a new zone or gets GC'd.
    currentZoneIdx: number
  }
  const wanderStates = new Map<number, WanderState>()

  // ── Target reservation ───────────────────────────────────────────────
  // Counts how many pets are CURRENTLY targeting each zone. pickFreshTarget
  // refuses to pick a zone whose count is at MAX_PETS_PER_ZONE, guaranteeing
  // pets spread across the map regardless of statistical luck. With 32
  // pets and 14 zones * 2 = 28 slots, ~most pets are always reserved to
  // distinct zones; the few extras pick whatever still has room.
  const zoneTargetCount = new Map<number, number>()
  const MAX_PETS_PER_ZONE = 2

  function reserveZone(idx: number) {
    zoneTargetCount.set(idx, (zoneTargetCount.get(idx) ?? 0) + 1)
  }
  function releaseZone(idx: number) {
    if (idx < 0) return
    const c = zoneTargetCount.get(idx) ?? 0
    if (c <= 1) zoneTargetCount.delete(idx)
    else zoneTargetCount.set(idx, c - 1)
  }

  /// Last ms timestamp at which the wander tick actually MOVED a pet (i.e.
  /// updated its position by walking). Used to detect long-stuck pets that
  /// somehow ended up neither chatting nor moving — e.g., a chat ended with
  /// a malformed state, or the pet's target is unreachable. After 12s of
  /// no movement we force a fresh far target so the world stays alive even
  /// if some other safety net fails.
  const wanderLastMovedAt = new Map<number, number>()
  const STATIONARY_RESCUE_MS = 12_000

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

  // ── Exploration grid ──────────────────────────────────────────────────
  // Divide the wander area into a 5×3 grid (15 cells of ~238×190 px each).
  // Each pet remembers its last RECENT_CELL_MEMORY cells and avoids them
  // when picking a new target. This GUARANTEES coverage spread instead of
  // relying on hotspot density (which always favoured the SOCIETY region
  // and central park, producing the piles you saw).
  const GRID_COLS            = 5
  const GRID_ROWS            = 3
  const TOTAL_CELLS          = GRID_COLS * GRID_ROWS    // 15
  const CELL_W               = (WANDER_X_MAX - WANDER_X_MIN) / GRID_COLS
  const CELL_H               = (WANDER_Y_MAX - WANDER_Y_MIN) / GRID_ROWS
  const RECENT_CELL_MEMORY   = 6   // 40% of the grid — strong avoidance

  function cellOf(x: number, y: number): number {
    const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((x - WANDER_X_MIN) / CELL_W)))
    const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((y - WANDER_Y_MIN) / CELL_H)))
    return row * GRID_COLS + col
  }

  function randomPointInCell(cell: number): { x: number; y: number } {
    const col = cell % GRID_COLS
    const row = Math.floor(cell / GRID_COLS)
    // 12% padding from cell edges so successive picks in adjacent cells
    // still feel like distinct destinations rather than border-hugging.
    const padX = CELL_W * 0.12
    const padY = CELL_H * 0.12
    return {
      x: WANDER_X_MIN + col * CELL_W + padX + Math.random() * (CELL_W - 2 * padX),
      y: WANDER_Y_MIN + row * CELL_H + padY + Math.random() * (CELL_H - 2 * padY),
    }
  }

  // ── Named zones — every pet rotates through these as a shuffled tour ──
  // Spread across the entire map so different pets are visibly heading to
  // different landmarks (society, breeding, battlefield, mailbox, pond...)
  // at any given moment. Replaces hotspot-density picking which was biased
  // toward central park / society area.
  interface NamedZone { name: string; x: number; y: number; jitter: number }
  // 16 zones laid out around the PERIMETER + a handful of mid-points.
  // Old layout had 6+ zones clustered in the central band, so transit
  // paths between any pair funnelled through the middle of the map and
  // visually piled up there. This perimeter layout means most A→B legs
  // now skirt the edges instead of crossing the center.
  // Map bounds: x 100-1290, y 180-750. Perimeter stations placed at the
  // edges with one mid-station per side.
  const NAMED_ZONES: NamedZone[] = [
    // Top edge, left → right
    { name: 'nw-corner',     x:  170, y: 220, jitter: 130 },
    { name: 'society',       x:  330, y: 230, jitter: 140 },
    { name: 'partner-row',   x:  560, y: 215, jitter: 140 },
    { name: 'north-path',    x:  830, y: 220, jitter: 140 },
    { name: 'ne-corner',     x: 1180, y: 230, jitter: 140 },

    // Right edge, top → bottom
    { name: 'breeding',      x: 1230, y: 410, jitter: 140 },
    { name: 'battlefield',   x: 1230, y: 640, jitter: 150 },

    // Bottom edge, right → left
    { name: 'se-corner',     x: 1000, y: 700, jitter: 140 },
    { name: 'south-path',    x:  830, y: 720, jitter: 140 },
    { name: 'marketplace',   x:  500, y: 700, jitter: 140 },
    { name: 'sw-corner',     x:  280, y: 720, jitter: 130 },
    { name: 'pond',          x:  170, y: 700, jitter: 120 },

    // Left edge, bottom → top
    { name: 'west-houses',   x:  170, y: 460, jitter: 140 },

    // Three mid-points kept for visual interest (signage labels still hit)
    // — but 1-pet cap effectively because there are 13 perimeter slots
    // already covering 26 pets at the 2-cap.
    { name: 'mailbox',       x:  640, y: 460, jitter: 140 },
    { name: 'central-park',  x:  830, y: 580, jitter: 150 },
    { name: 'east-arena',    x: 1050, y: 500, jitter: 130 },
  ]

  /// Fisher-Yates shuffle, optionally excluding one index from the front
  /// position so two consecutive picks (across deck refills) can't be the
  /// same zone.
  function shuffledZoneDeck(excludeFirst: number): number[] {
    const deck = NAMED_ZONES.map((_, i) => i)
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    if (excludeFirst >= 0 && deck[0] === excludeFirst && deck.length > 1) {
      // Swap with a later position so we never start a fresh deck on the
      // same zone the previous deck ended on.
      const swapIdx = 1 + Math.floor(Math.random() * (deck.length - 1))
      ;[deck[0], deck[swapIdx]] = [deck[swapIdx], deck[0]]
    }
    return deck
  }

  function popNextZone(state: WanderState): NamedZone {
    // Release the previous reservation first.
    releaseZone(state.currentZoneIdx)

    // Try up to NAMED_ZONES.length picks: skip any zone that's already at
    // MAX_PETS_PER_ZONE. Refills the deck as needed.
    for (let attempt = 0; attempt < NAMED_ZONES.length * 2; attempt++) {
      if (state.zoneDeck.length === 0) {
        state.zoneDeck = shuffledZoneDeck(state.lastZone)
      }
      const idx = state.zoneDeck.shift()!
      const count = zoneTargetCount.get(idx) ?? 0
      if (count < MAX_PETS_PER_ZONE) {
        reserveZone(idx)
        state.lastZone       = idx
        state.currentZoneIdx = idx
        return NAMED_ZONES[idx]
      }
      // Zone full — try the next one in the deck. Skipped zones are gone
      // from this deck but will reappear in the next shuffle.
    }
    // Pathological case: every zone is at cap (would need 28+ pets all
    // reserved). Pick anything to avoid an infinite loop.
    const fallbackIdx = Math.floor(Math.random() * NAMED_ZONES.length)
    reserveZone(fallbackIdx)
    state.lastZone       = fallbackIdx
    state.currentZoneIdx = fallbackIdx
    return NAMED_ZONES[fallbackIdx]
  }

  /// Pick the next exploration target. Pulls from this pet's shuffled
  /// zone deck so each pet rotates through every named landmark over a
  /// full cycle, then re-shuffles. The cell grid + recentCells fallback
  /// only kicks in for the rare case where the chosen zone happens to
  /// match the current cell (avoids "next target is right where I am").
  function pickFreshTarget(currentX: number, currentY: number, state: WanderState): { x: number; y: number; linger?: boolean } {
    let zone = popNextZone(state)
    // If the pet is already standing inside this zone's jitter radius,
    // pop the next zone in the deck instead so the leg has meaningful
    // distance — keeps the world's motion visible.
    let safety = 0
    while (Math.hypot(zone.x - currentX, zone.y - currentY) < zone.jitter && safety < 3) {
      zone = popNextZone(state)
      safety++
    }
    // Track the cell so the rescue/anti-clump heuristics still work.
    const point = {
      x: zone.x + (Math.random() - 0.5) * zone.jitter * 2,
      y: zone.y + (Math.random() - 0.5) * zone.jitter * 2,
    }
    state.recentCells.push(cellOf(point.x, point.y))
    if (state.recentCells.length > RECENT_CELL_MEMORY) state.recentCells.shift()
    return point
  }

  /// Pick the cell roughly opposite the pet's current position — used
  /// after a chat ends so the pet actively scatters away from the chat
  /// spot instead of picking another nearby cluster. Adds a random fresh
  /// cell as fallback if the opposite is in recent memory.
  function pickOppositeTarget(currentX: number, currentY: number, state: WanderState): { x: number; y: number } {
    const here       = cellOf(currentX, currentY)
    const hereCol    = here % GRID_COLS
    const hereRow    = Math.floor(here / GRID_COLS)
    const oppCol     = GRID_COLS - 1 - hereCol
    const oppRow     = GRID_ROWS - 1 - hereRow
    const oppCell    = oppRow * GRID_COLS + oppCol
    state.recentCells.push(oppCell)
    if (state.recentCells.length > RECENT_CELL_MEMORY) state.recentCells.shift()
    return randomPointInCell(oppCell)
  }

  /// Legacy hotspot picker — retained for the very first spawn target so
  /// pets START at recognisable landmarks. After the first move, all
  /// targets come from pickFreshTarget / pickOppositeTarget.
  function pickWanderTarget(): { x: number; y: number; linger?: boolean } {
    const h = HOTSPOTS[Math.floor(Math.random() * HOTSPOTS.length)]
    return {
      x:      h.x + (Math.random() - 0.5) * 120,
      y:      h.y + (Math.random() - 0.5) * 120,
      linger: h.linger,
    }
  }

  function ensureWanderState(petId: number): WanderState {
    let s = wanderStates.get(petId)
    if (!s) {
      // Personality roll — fast + responsive defaults so the world feels
      // alive even after long uptime. Loiter is brief; the only thing
      // that stops a pet for any meaningful time is an active chat.
      // Each pet gets its OWN shuffled zone deck so different pets are
      // headed to different zones at any given moment — visible spread
      // across society / mailbox / breeding / battlefield / pond / etc.
      // Initial zone — also reserve a slot so it counts toward the cap.
      // Pop from a fresh shuffled deck respecting the reservation limit.
      const tmpDeck = shuffledZoneDeck(-1)
      let firstIdx = -1
      for (const idx of tmpDeck) {
        if ((zoneTargetCount.get(idx) ?? 0) < MAX_PETS_PER_ZONE) {
          firstIdx = idx
          break
        }
      }
      if (firstIdx < 0) firstIdx = tmpDeck[0] ?? 0
      reserveZone(firstIdx)
      const firstZone = NAMED_ZONES[firstIdx]
      // Remove the chosen zone from the deck before storing
      const zoneDeck = tmpDeck.filter((i) => i !== firstIdx)

      s = {
        target: {
          x: firstZone.x + (Math.random() - 0.5) * firstZone.jitter * 2,
          y: firstZone.y + (Math.random() - 0.5) * firstZone.jitter * 2,
        },
        // Stagger the first move 0-1500ms so they don't all set off at once.
        loiterUntil: Date.now() + Math.random() * 1500,
        baseSpeed:   3.0 + Math.random() * 5.5,
        minLoiter:   120,
        maxLoiter:   450,
        recentCells: [],
        zoneDeck,
        lastZone:       firstIdx,
        currentZoneIdx: firstIdx,
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
        // Release the pet's zone reservation before tearing down its state.
        const ws = wanderStates.get(petId)
        if (ws) releaseZone(ws.currentZoneIdx)
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
        const ws = wanderStates.get(petId)
        if (ws) releaseZone(ws.currentZoneIdx)
        wanderStates.delete(petId)
        continue
      }

      // Pause while in conversation — pets stand still during chat.
      const convoUntil = inConversation.get(petId) ?? 0
      if (convoUntil > now) continue
      if (convoUntil > 0) inConversation.delete(petId)

      const state = ensureWanderState(petId)

      // ── Always-on soft separation ─────────────────────────────────────
      // Push the pet a fraction of a pixel away from very-close neighbours
      // even while loitering or in chat-cooldown. Stops pets from visually
      // stacking on top of each other at popular zone arrival points.
      // Only fires when the closest neighbour is < 36 px (sprites are 42px
      // wide, so this kicks in just before they overlap).
      let softX = 0, softY = 0, closest = Infinity
      for (const [otherId, otherPos] of positions) {
        if (otherId === petId) continue
        const ddx = pos.x - otherPos.x
        const ddy = pos.y - otherPos.y
        const dd  = Math.hypot(ddx, ddy)
        if (dd >= 36 || dd < 0.5) continue
        if (dd < closest) closest = dd
        // Quadratic falloff — much stronger when very close
        const force = ((36 - dd) / 36) ** 2 * 1.6
        softX += (ddx / dd) * force
        softY += (ddy / dd) * force
      }
      if (closest < 36) {
        const nx = clamp(pos.x + softX, WANDER_X_MIN, WANDER_X_MAX)
        const ny = clamp(pos.y + softY, WANDER_Y_MIN, WANDER_Y_MAX)
        positions.set(petId, { x: nx, y: ny, zone: pos.zone })
        wanderLastMovedAt.set(petId, now)
        // Don't `continue` — fall through to normal walking/loiter logic
        // so this pet still progresses toward its target between pushes.
      }

      // Loitering at last target → stand still until the timer expires.
      if (state.loiterUntil > now) continue

      const dx = state.target.x - pos.x
      const dy = state.target.y - pos.y
      const dist = Math.hypot(dx, dy)
      if (dist < state.baseSpeed * 1.5) {
        // Arrived. Snap, pick a new target, brief hesitation, then move on.
        positions.set(petId, { x: state.target.x, y: state.target.y, zone: pos.zone })

        // If crowded at the arrival point, pick the OPPOSITE cell (no
        // hesitation) so the pet leaves immediately. Otherwise pick a
        // fresh cell that this pet hasn't visited recently.
        let crowded = false
        for (const [otherId, otherPos] of positions) {
          if (otherId === petId) continue
          if (Math.hypot(otherPos.x - state.target.x, otherPos.y - state.target.y) < 70) {
            crowded = true
            break
          }
        }
        if (crowded) {
          state.target      = pickOppositeTarget(state.target.x, state.target.y, state)
          state.loiterUntil = now + 50
        } else {
          state.target = pickFreshTarget(state.target.x, state.target.y, state)
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
      wanderLastMovedAt.set(petId, now)
    }

    // ── Stationary-pet rescue ─────────────────────────────────────────────
    // Catch any pet that's neither chatting, browser-driven, nor walking.
    // Belt-and-suspenders for race conditions where inConversation/activeChats
    // get out of sync with state.target — without this a single bug anywhere
    // in the chat path can re-create the pile-up problem.
    for (const [petId, pos] of positions) {
      if (browserDriven.has(petId) && (now - (lastMoveAt.get(petId) ?? 0) < IDLE_THRESHOLD_MS)) continue
      if ((inConversation.get(petId) ?? 0) > now) continue
      if (activeChats.has(petId)) continue
      const lastMoved = wanderLastMovedAt.get(petId) ?? now
      if (now - lastMoved < STATIONARY_RESCUE_MS) continue
      // Pet has been stationary too long — force a fresh zone (respects
      // reservation count via popNextZone, unlike pickOppositeTarget).
      const state = ensureWanderState(petId)
      const zone  = popNextZone(state)
      state.target = {
        x: zone.x + (Math.random() - 0.5) * zone.jitter * 2,
        y: zone.y + (Math.random() - 0.5) * zone.jitter * 2,
      }
      state.loiterUntil = now + 50
      wanderLastMovedAt.set(petId, now) // arm timer so we don't spam-rescue
      console.log(`[Wander] Rescued stuck pet ${petId} at (${pos.x.toFixed(0)},${pos.y.toFixed(0)}) -> (${state.target.x.toFixed(0)},${state.target.y.toFixed(0)})`)
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
  //  - PROXIMITY_INIT_PX 170  (bumped from 120 — wider zone jitter +
  //      always-on soft separation means pets land 50-150 px apart at
  //      arrival, so the 120 threshold was too tight to ever fire)
  //  - PROXIMITY_BREAK_PX 260 (matches spatial radius; loose enough to
  //      keep a chat alive while pets get nudged by separation)
  //  - PROXIMITY_COOLDOWN_MS 20s (same pair can't re-chat for 20s)
  //  - BROKER_THROTTLE_MS 100ms
  //  - MAX_CHAT_DURATION_MS 6s
  //  - SPATIAL_CHAT_RADIUS 200 (was 260 — too restrictive when only one
  //      chat per ~half the screen could fire; 200 still prevents piles
  //      while letting multiple conversations happen across the map)
  //  - MAX_FIRES_PER_TICK 2 (was 1 — pair with smaller spatial radius
  //      so two distant chats can start in the same tick)
  const PROXIMITY_INIT_PX      = 170
  const PROXIMITY_BREAK_PX     = 260
  const PROXIMITY_COOLDOWN_MS  = 20_000
  const BROKER_THROTTLE_MS     = 100
  const MAX_CHAT_DURATION_MS   = 12_000
  const SPATIAL_CHAT_RADIUS    = 200

  // chatStartedAt[petId] = ms timestamp when this pet entered its current
  // chat. Used by the sweep to enforce MAX_CHAT_DURATION_MS so a fluent
  // two-way chat can't keep refreshing inConversation forever.
  const chatStartedAt = new Map<number, number>()

  const lastProximityChat = new Map<string, number>()
  let lastBrokerFire = 0

  // Pets currently engaged in a Hub-brokered conversation. Both directions of
  // the pair share the same entry; cleared when bubble lands or proximity breaks.
  const activeChats = new Map<number, number>()  // petId -> partnerPetId
  const chatTurnCount = new Map<string, number>() // pairKey -> turns sent
  const MAX_TURNS = 4

  function pairKey(a: number, b: number) { return `${Math.min(a,b)}-${Math.max(a,b)}` }

  // Per-pet "just ended a chat" cooldown — blocks the broker from re-pairing
  // a pet for 1.5s after their last chat ended. Without this, in-flight
  // chat-outs from the previous pairing arrive at the gate AFTER activeChats
  // has been overwritten by a new pairing → "no-longer-paired" drops.
  const recentlyPaired = new Map<number, number>()  // petId -> unblockAtMs
  // 7s — long enough to let the pet walk 400+ px away from the chat spot
  // (≈50 px/sec * 7s) so they don't immediately re-pair with someone who
  // just arrived, but short enough that pets in a busy zone aren't all
  // sitting in cooldown for half a minute.
  const RE_PAIR_COOLDOWN_MS = 7_000

  function distanceBetween(a: number, b: number): number | null {
    const pa = positions.get(a)
    const pb = positions.get(b)
    if (!pa || !pb) return null
    return Math.hypot(pa.x - pb.x, pa.y - pb.y)
  }

  function endChat(a: number, b: number) {
    if (activeChats.get(a) === b) activeChats.delete(a)
    if (activeChats.get(b) === a) activeChats.delete(b)
    // CRITICAL: also clear `inConversation`. Without this the pet stays
    // frozen for the remaining CONVO_PAUSE_MS window after the chat ends,
    // and ANY new pet that wanders nearby pairs with the still-frozen pet,
    // triggering a fresh chat that refreshes inConversation again — the
    // self-reinforcing cycle that builds permanent piles at hotspots.
    inConversation.delete(a)
    inConversation.delete(b)
    // Forget when this chat started — used by the max-duration sweep.
    chatStartedAt.delete(a)
    chatStartedAt.delete(b)
    // Force both pets to immediately walk AWAY from the chat spot. Picks
    // the hotspot farthest from each pet's current position so they don't
    // just pick the same nearby cluster again.
    forceFarTarget(a)
    forceFarTarget(b)
    // Mark both as recently paired — cooldown prevents an immediate re-pair
    // race that drops in-flight chat-outs from this just-ended chat.
    const unblockAt = Date.now() + RE_PAIR_COOLDOWN_MS
    recentlyPaired.set(a, unblockAt)
    recentlyPaired.set(b, unblockAt)
    chatTurnCount.delete(pairKey(a, b))
    // Tell both workers to abort any in-flight reply they were about to send
    supervisor.broadcast(a, { type: 'chat-end', withPetId: b })
    supervisor.broadcast(b, { type: 'chat-end', withPetId: a })
  }

  /// Force the pet to walk to a fresh zone with no loiter — used after a
  /// chat ends so pets actively leave the chat location. Goes through
  /// popNextZone so the zone reservation count stays accurate (otherwise
  /// the pet would still be "reserved" at the zone it was previously
  /// targeting, even though it's now headed somewhere else → false caps).
  function forceFarTarget(petId: number) {
    const pos = positions.get(petId)
    if (!pos) return
    const state = ensureWanderState(petId)
    const zone  = popNextZone(state)
    state.target = {
      x: zone.x + (Math.random() - 0.5) * zone.jitter * 2,
      y: zone.y + (Math.random() - 0.5) * zone.jitter * 2,
    }
    state.loiterUntil = Date.now() + 50
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
    const key = pairKey(fromId, toId)
    const turns = (chatTurnCount.get(key) ?? 0) + 1
    chatTurnCount.set(key, turns)
    if (turns >= MAX_TURNS) {
      endChat(fromId, toId)
      console.log(`[Broker] Chat capped pet ${fromId}<->${toId} after ${turns} turns`)
      return true  // allow this last message through, end fires after
    }
    return true
  })

  /// Run the proximity sweep + chat-fire pass once. Called from a 100ms
  /// scheduled tick AND opportunistically from the socket `move` handler
  /// (push-based fire) so player-driven approaches start chats within
  /// ~30ms instead of waiting up to 100ms for the next scheduled tick.
  /// `pushed=true` skips the BROKER_THROTTLE_MS guard since push events
  /// are inherently rate-limited by browser move emit cadence (~10Hz).
  function runBrokerPass(pushed: boolean) {
    const now = Date.now()

    // Sweep: end any chat that's drifted past the break threshold OR that's
    // exceeded MAX_CHAT_DURATION_MS. Without the duration cap, a fluent
    // back-and-forth would refresh inConversation forever and freeze the
    // pets indefinitely → permanent pile at the chat location.
    for (const [petId, partner] of activeChats) {
      if (petId > partner) continue   // process each pair once
      const d = distanceBetween(petId, partner)
      if (d == null || d > PROXIMITY_BREAK_PX) {
        endChat(petId, partner)
        console.log(`[Broker] Chat swept pet ${petId}<->${partner} (drift)`)
        continue
      }
      const startedAt = chatStartedAt.get(petId) ?? chatStartedAt.get(partner) ?? 0
      if (startedAt > 0 && now - startedAt > MAX_CHAT_DURATION_MS) {
        endChat(petId, partner)
        console.log(`[Broker] Chat swept pet ${petId}<->${partner} (duration cap)`)
      }
    }

    if (!pushed && now - lastBrokerFire < BROKER_THROTTLE_MS) return

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

    const MAX_FIRES_PER_TICK = 2
    lastBrokerFire = now

    // Track pets already paired in this tick. Without this, two candidate
    // pairs that share a pet (e.g., 31<->44 and 36<->44) both fire and the
    // second overwrites activeChats[44], making the first chat's IPC fail
    // the gate ("not paired anymore").
    const pairedThisTick = new Set<number>()

    // Pre-compute midpoints of all currently active chats so we can enforce
    // SPATIAL_CHAT_RADIUS — no two simultaneous chats within that distance.
    // This is what stops 6+ pets from all freezing at central park: only
    // ONE pair can chat per ~260 px region, the rest pass through.
    const activeChatMidpoints: Array<{ x: number; y: number }> = []
    for (const [petId, partnerId] of activeChats) {
      if (petId > partnerId) continue   // each pair once
      const pa = positions.get(petId)
      const pb = positions.get(partnerId)
      if (pa && pb) activeChatMidpoints.push({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 })
    }

    let firedCount = 0
    for (const [a, b, petA, petB] of candidates) {
      if (firedCount >= MAX_FIRES_PER_TICK) break
      if (pairedThisTick.has(a) || pairedThisTick.has(b)) continue
      // Spatial chat limit: skip this pair if there's already an active
      // chat within SPATIAL_CHAT_RADIUS of where this one would happen.
      const posA = positions.get(a)
      const posB = positions.get(b)
      if (posA && posB) {
        const midX = (posA.x + posB.x) / 2
        const midY = (posA.y + posB.y) / 2
        let blocked = false
        for (const m of activeChatMidpoints) {
          if (Math.hypot(m.x - midX, m.y - midY) < SPATIAL_CHAT_RADIUS) {
            blocked = true
            break
          }
        }
        if (blocked) continue
      }

      const pairKey = `${Math.min(a, b)}-${Math.max(a, b)}`
      lastProximityChat.set(pairKey, now)
      // Pause both pets so they stand still while talking
      inConversation.set(a, now + CONVO_PAUSE_MS)
      inConversation.set(b, now + CONVO_PAUSE_MS)
      activeChats.set(a, b)
      activeChats.set(b, a)
      // Record the chat start time so the sweep can enforce the duration cap.
      chatStartedAt.set(a, now)
      chatStartedAt.set(b, now)
      pairedThisTick.add(a)
      pairedThisTick.add(b)
      supervisor.broadcast(a, { type: 'chat-request', withPetId: b, withPeerId: petB.peer_id, withName: petB.name })
      supervisor.broadcast(b, { type: 'chat-request', withPetId: a, withPeerId: petA.peer_id, withName: petA.name })
      console.log(`[Broker] Fired chat-request: pet ${a} <-> pet ${b}${pushed ? ' (push)' : ''}`)
      firedCount++
    }
  }

  // Scheduled tick — catches NPC↔NPC pairings (their positions update via the
  // wander tick which doesn't fire socket events).
  setInterval(() => runBrokerPass(false), 100)
  // Expose to socket move handler for push-based player↔NPC fire.
  pushBroker = () => runBrokerPass(true)

  await supervisor.start()
  bootstrapAdoptionChain().catch(err => console.error('[Hub] adoption-chain bootstrap failed:', err.message))
  bootstrapSubscriptionRegistry().catch(err => console.error('[Hub] sub-registry bootstrap failed:', err.message))

  // A3: ENS heartbeat — bumps lastSeenBlock for every alive pet regularly.
  // This makes the KeeperHub mailbox HERO conditional fire organically:
  // a queued gift transfers automatically once recipient's tama.lastSeenBlock
  // is fresh. No more Trigger-Now button required.
  supervisor.startEnsHeartbeat()
  startMailboxAutoDelivery()

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
