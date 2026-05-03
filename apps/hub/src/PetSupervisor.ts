import { fork, type ChildProcess } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { TamaPetABI, ADDRESSES_SEPOLIA } from 'contracts-sdk'
import type { Server as SocketIOServer } from 'socket.io'
import type { DB } from './db'
import { generatePetAxlConfig } from './axl-config'
import { withDeployerTxLock } from 'deployer-tx-lock'

// ESM doesn't expose __dirname; derive from import.meta.url so child-process
// fork paths resolve correctly when the hub runs via tsx in module mode.
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
/** Monorepo root — same path pet-runtime workers use as `process.cwd()`. */
const MONOREPO_ROOT = path.resolve(__dirname, '..', '..', '..')

// Shape of the Mint event args as emitted by TamaPet.sol
interface MintEventArgs {
  tokenId:   bigint
  owner:     `0x${string}`
  name:      string
  blobCID:   string
  archetype: number
  traits:    bigint
  wallet:    `0x${string}`
}

interface MintArgs {
  tokenId:   number
  owner:     `0x${string}`
  name:      string
  blobCID:   string
  archetype: number
  traits:    bigint
  wallet:    `0x${string}`
}

const ENS_HEARTBEAT_INTERVAL_MS = Number(process.env.ENS_HEARTBEAT_INTERVAL_MS ?? 60_000)

type BattleEventMetadata = Record<string, unknown>

interface BattlePairRow {
  pet_a: number
  pet_b: number
}

export class PetSupervisor {
  private workers = new Map<number, ChildProcess>()
  private io?: SocketIOServer
  private client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  })
  // Hub registers this so chat fan-out is gated by live proximity. Returning
  // false tells the supervisor to drop the bubble (pets drifted apart).
  private chatGate?: (fromPetId: number, toPetId: number) => boolean

  constructor(private db: DB) {}

  setIO(io: SocketIOServer) {
    this.io = io
  }

  setChatGate(gate: (fromPetId: number, toPetId: number) => boolean) {
    this.chatGate = gate
  }

  hasWorker(tokenId: number): boolean {
    return this.workers.has(tokenId)
  }

  recordBattleEvent(
    battleId: string,
    phase: string,
    detail: string,
    petId?: number,
    metadata: BattleEventMetadata = {},
  ) {
    const createdAt = Date.now()
    this.db.prepare(
      'INSERT INTO battle_events (battle_id, phase, detail, pet_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      battleId,
      phase,
      detail,
      petId ?? null,
      JSON.stringify(metadata),
      createdAt,
    )

    const battle = this.db.prepare('SELECT pet_a, pet_b FROM battles WHERE id = ?')
      .get(battleId) as BattlePairRow | undefined
    const recipients = battle ? [battle.pet_a, battle.pet_b] : (petId ? [petId] : [])
    for (const recipientPetId of recipients) {
      this.io?.to('world').emit('activity', {
        type: 'battle-progress',
        petId: recipientPetId,
        battleId,
        phase,
        detail,
        eventPetId: petId ?? null,
        metadata,
        timestamp: createdAt,
      })
    }
  }

  async start() {
    await this.respawnExisting()
    console.log(`[Supervisor] Watching ${ADDRESSES_SEPOLIA.TamaPet} for Mint events`)
    this.client.watchContractEvent({
      address: ADDRESSES_SEPOLIA.TamaPet,
      abi: TamaPetABI,
      eventName: 'Mint',
      onLogs: (logs) => {
        for (const log of logs) {
          // Cast needed: TS6 strips literal types from JSON ABI imports, so viem
          // falls back to the untyped Log overload and args isn't inferred.
          const { tokenId, owner, name, blobCID, archetype, traits, wallet } =
            (log as unknown as { args: MintEventArgs }).args
          if (tokenId == null || !owner || !name || !blobCID || archetype == null || traits == null || !wallet) continue
          this.spawnPet({
            tokenId:   Number(tokenId),
            owner,
            name,
            blobCID,
            archetype: Number(archetype),
            traits,
            wallet,
          })
        }
      },
      onError: (err) => console.error('[Supervisor] watchContractEvent error:', err),
    })
  }

  spawnPet({ tokenId, owner, name, blobCID, archetype, traits, wallet }: MintArgs) {
    if (this.workers.has(tokenId)) {
      console.warn(`[Supervisor] Pet ${tokenId} already running`)
      return
    }

    // Generate AXL config + ed25519 key before the worker tries to read it (idempotent)
    generatePetAxlConfig(tokenId)

    // Spawn inside the park rect (world.tmj zone: x:500-900, y:460-768)
    const spawnX = 520 + Math.random() * 360
    const spawnY = 480 + Math.random() * 270
    this.db.prepare(`
      INSERT OR IGNORE INTO pets (token_id, name, owner_address, wallet_address, blob_cid, archetype, ens_name, pos_x, pos_y, zone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tokenId, name, owner, wallet, blobCID, archetype, `${name}.tama.eth`, spawnX, spawnY, 'park', Date.now())

    this.scheduleAllowanceWorkflow(tokenId, wallet)
      .catch(err => console.error(`[Pet ${tokenId}] allowance workflow error:`, err.message))

    const workerPath = path.join(MONOREPO_ROOT, 'packages', 'pet-runtime', 'src', 'worker.ts')

    const worker = fork(workerPath, [], {
      // Pin child's cwd to the repo root. The worker resolves the AXL binary +
      // axl-config files relative to process.cwd(), which would otherwise
      // inherit the hub's cwd (apps/hub) and miss the binary at <repo>/bin/axl-node.
      cwd: MONOREPO_ROOT,
      env: {
        ...process.env,
        PET_ID:    String(tokenId),
        BLOB_CID:  blobCID,
        ENS_NAME:  name,
        OWNER:     owner,
        WALLET:    wallet,
        PET_ARCHETYPE: String(archetype),
        TRAITS:    String(traits),
      },
      execArgv: ['--import', 'tsx'],
    })

    worker.on('message', (msg: unknown) => {
      const m = msg as Record<string, unknown>
      if (m.type === 'peer-ready') {
        // Worker booted and has its AXL peerId — update DB, then mint ENS subname
        this.db.prepare('UPDATE pets SET peer_id = ? WHERE token_id = ?')
          .run(m.peerId, m.petId)
        console.log(`[Supervisor] Pet ${m.petId} peer-ready: ${m.peerId}`)

        // Phase 3 ENS: mint <name>.tama.eth on Sepolia (best-effort, idempotent).
        // Fire-and-forget — pet shouldn't block on ENS confirms.
        this.mintEnsSubnameForPet(m.petId as number)
          .catch(err => console.warn(`[Pet ${m.petId}] ENS mint skipped:`, err.message))
        this.bumpLastSeenForPetId(m.petId as number)
          .catch(err => console.warn(`[Pet ${m.petId}] ENS online heartbeat skipped:`, err.message))

      } else if (m.type === 'chat-out') {
        const fromId = m.petId   as number
        const toId   = m.toPetId as number
        if (this.chatGate && !this.chatGate(fromId, toId)) {
          console.log(`[Chat] Pet ${fromId} -> Pet ${toId} dropped (out of proximity)`)
          return
        }
        const text = String(m.text ?? '').slice(0, 80)
        console.log(`[Chat] Pet ${fromId} -> Pet ${toId}: "${text}"`)
        this.io?.to('world').emit('chat', {
          from: fromId, to: toId, text: m.text, timestamp: Date.now(),
        })

      } else if (m.type === 'mailbox-queued') {
        this.db.prepare(
          'INSERT OR IGNORE INTO keeperhub_workflows (id, pet_id, kind, status, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(m.workflowId, m.petId, 'mailbox', 'active', JSON.stringify(m), Date.now())
        this.bumpLastSeenForPetId(Number(m.toPetId))
          .catch(err => console.warn(`[Mailbox] recipient heartbeat skipped:`, err.message))
        this.io?.to('world').emit('activity', {
          type: 'mailbox-queued', petId: m.petId, toPetId: m.toPetId, workflowId: m.workflowId, timestamp: Date.now(),
        })

      } else if (m.type === 'subscription-proposals') {
        this.io?.to('world').emit('activity', {
          type: 'subscription-proposals', petId: m.petId, proposals: m.proposals, timestamp: Date.now(),
        })

      } else if (m.type === 'subscription-created') {
        this.db.prepare(
          'INSERT OR IGNORE INTO keeperhub_workflows (id, pet_id, kind, status, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(m.workflowId, m.petId, 'subscription', 'active', JSON.stringify(m), Date.now())
        this.io?.to('world').emit('activity', {
          type: 'subscription-created', petId: m.petId, workflowId: m.workflowId, subscriptionId: m.subscriptionId, timestamp: Date.now(),
        })

      } else if (m.type === 'battle-progress') {
        this.recordBattleEvent(
          String(m.battleId),
          String(m.phase ?? 'progress'),
          String(m.detail ?? ''),
          m.petId as number | undefined,
          (m.metadata ?? {}) as BattleEventMetadata,
        )

      } else if (m.type === 'battle-result') {
        const winner = Number(m.winner)
        const onChain = String(m.onChainStatus ?? 'unknown')
        // `settled` = verdict + BattleEscrow settle tx submitted.
        // `judged` = verdict on record but escrow did not complete (timeout / revert / etc.).
        // `error` = no normal winner (e.g. worker failure).
        const battleStatus =
          onChain === 'settle-submitted'
            ? 'settled'
            : winner > 0
              ? 'judged'
              : 'error'

        this.db.prepare(
          `UPDATE battles SET status = ?, winner = ?, judges = ?, payouts = ?, settled_at = ?
           WHERE id = ?`,
        ).run(
          battleStatus,
          m.winner,
          JSON.stringify(m.judges ?? []),
          JSON.stringify(m.payouts ?? []),
          Date.now(),
          m.battleId,
        )
        const payouts = (m.payouts ?? []) as Array<{ betterPetId: number; amount: string }>
        this.recordBattleEvent(
          String(m.battleId),
          (m.winner as number) > 0 ? 'verdict' : 'error',
          String(m.text ?? 'Battle finished'),
          m.petId as number | undefined,
          {
            winner: m.winner,
            judges: m.judges ?? [],
            pot: m.pot ?? '0',
            payouts,
            createTxHash: m.createTxHash ?? null,
            settlementTxHash: m.settlementTxHash ?? null,
            onChainStatus: m.onChainStatus ?? 'unknown',
            settlementError: m.settlementError ?? null,
          },
        )
        const battle = this.db.prepare('SELECT pet_a, pet_b FROM battles WHERE id = ?')
          .get(m.battleId) as BattlePairRow | undefined
        for (const recipientPetId of battle ? [battle.pet_a, battle.pet_b] : [m.petId as number]) {
          this.io?.to('world').emit('activity', {
            type:     'battle-result',
            petId:    recipientPetId,
            battleId: m.battleId,
            winner:   m.winner,
            judges:   m.judges  ?? [],
            pot:      m.pot     ?? '0',
            payouts,
            text:     m.text,
            createTxHash: m.createTxHash ?? null,
            settlementTxHash: m.settlementTxHash ?? null,
            onChainStatus: m.onChainStatus ?? null,
            settlementError: m.settlementError ?? null,
            timestamp: Date.now(),
          })
        }
        // A3: write battle belt to winner ENS
        const winnerId = m.winner as number
        if (winnerId && winnerId > 0) {
          const winnerRow = this.db.prepare('SELECT name FROM pets WHERE token_id = ?').get(winnerId) as
            | { name: string }
            | undefined
          if (winnerRow) this.incrementBeltCount(winnerRow.name, 'debate').catch(() => {})
        }

      } else if (m.type === 'friendship-milestone') {
        // ENS Most Creative: pets vouch for each other on-chain when
        // friendship strength crosses a threshold (chat exchanges accumulate).
        // Writes tama.vouches.<friend> text record on the friend's ENS — a
        // verifiable credential issued by one autonomous agent to another.
        const otherPetId = m.otherPetId as number
        const strength   = m.strength as number
        const otherRow = this.db.prepare('SELECT name FROM pets WHERE token_id = ?')
          .get(otherPetId) as { name: string } | undefined
        const fromName = (msg as { name?: string }).name ?? null
        const fromRow = this.db.prepare('SELECT name FROM pets WHERE token_id = ?')
          .get(tokenId) as { name: string } | undefined
        if (otherRow && fromRow) {
          this.issueAttestationForFriendship(fromRow.name, otherRow.name, strength)
            .catch((err) => console.warn(`[ENS] attestation failed: ${err.message}`))
        }

      } else if (m.type === 'relay-axl-msg') {
        // Hub-as-AXL-relay fallback: when worker's direct axl.send fails (gVisor
        // routing unreachable), it IPC-asks Hub to forward. We resolve the
        // recipient's tokenId from the payload or peer_id and broadcast to that
        // worker via existing child_process.fork channel. End result: the
        // recipient worker sees the message in its handleIncoming path,
        // identical to receiving it via real AXL recv.
        const toPeerId = m.toPeerId as string
        const payload = (m.msg ?? {}) as Record<string, unknown>
        const directPetId = typeof payload.toPetId === 'number' && Number.isFinite(payload.toPetId)
          ? payload.toPetId
          : undefined
        const row = directPetId === undefined
          ? this.db.prepare('SELECT token_id FROM pets WHERE peer_id = ? LIMIT 1')
            .get(toPeerId) as { token_id: number } | undefined
          : undefined
        const toPetId = directPetId ?? row?.token_id
        if (toPetId !== undefined && this.workers.has(toPetId)) {
          this.broadcast(toPetId, {
            type: 'relayed-axl-msg',
            fromPeerId: this.peerIdFor(tokenId),
            payload,
          })
          if (typeof payload.type === 'string' && payload.type.startsWith('battle-')) {
            console.log(`[AXL relay] ${payload.type} ${payload.battleId ?? ''}: pet ${tokenId} -> pet ${toPetId}`)
          }
        } else {
          console.warn(`[AXL relay] target unavailable for peer ${toPeerId} / pet ${directPetId ?? 'unknown'}`)
        }

      } else {
        console.log(`[Pet ${tokenId}]`, msg)
      }
    })
    worker.on('error',  (err) => console.error(`[Pet ${tokenId}] error:`, err))
    worker.on('exit', (code) => {
      console.log(`[Pet ${tokenId}] exited (code ${code})`)
      this.workers.delete(tokenId)
      this.db.prepare('UPDATE pets SET peer_id = NULL WHERE token_id = ?').run(tokenId)
    })

    this.workers.set(tokenId, worker)
    console.log(`[Supervisor] Spawned pet ${tokenId} — ${name}.tama.eth`)
  }

  // ── Bug 2: re-fork workers for pets that survived a Hub restart ──────────────
  private async respawnExisting() {
    type PetRow = {
      token_id:      number
      name:          string
      owner_address: string
      wallet_address: string
      blob_cid:      string
      archetype:     number
    }
    const pets = this.db.prepare(
      'SELECT token_id, name, owner_address, wallet_address, blob_cid, archetype FROM pets'
    ).all() as PetRow[]

    let count = 0
    for (const pet of pets) {
      if (this.workers.has(pet.token_id)) continue
      this.spawnPet({
        tokenId:   pet.token_id,
        owner:     pet.owner_address as `0x${string}`,
        name:      pet.name,
        blobCID:   pet.blob_cid ?? '',
        archetype: Number(pet.archetype ?? 0),
        traits:    0n,
        wallet:    pet.wallet_address as `0x${string}`,
      })
      count++
    }
    if (count > 0) console.log(`[Supervisor] Re-spawned ${count} existing pet(s) from DB`)
  }

  // ── Bug 3: register recurring allowance workflow — idempotent ─────────────
  private async scheduleAllowanceWorkflow(petId: number, petWalletAddress: string) {
    const existing = this.db.prepare(
      "SELECT id FROM keeperhub_workflows WHERE pet_id = ? AND kind = 'allowance' LIMIT 1"
    ).get(petId)
    if (existing) return

    const { connectKeeperHub, createRecurringAllowance } = await import('keeperhub')
    const client = await connectKeeperHub()
    try {
      const wf = await createRecurringAllowance(client, {
        petId,
        petWalletAddress: petWalletAddress as `0x${string}`,
        amountUSDC: '5',
        walletIntegrationId: process.env.KEEPERHUB_WALLET_INTEGRATION_ID ?? '',
      })
      this.db.prepare(
        'INSERT OR IGNORE INTO keeperhub_workflows (id, pet_id, kind, status, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(wf.id, petId, 'allowance', 'active', JSON.stringify(wf), Date.now())
      console.log(`[Pet ${petId}] Allowance workflow registered: ${wf.id}`)
    } finally {
      await client.close()
    }
  }

  broadcast(petId: number, msg: Record<string, unknown>) {
    this.workers.get(petId)?.send(msg)
  }

  private peerIdFor(petId: number): string | null {
    const row = this.db.prepare('SELECT peer_id FROM pets WHERE token_id = ?').get(petId) as
      | { peer_id: string | null }
      | undefined
    return row?.peer_id ?? null
  }

  // ── A2: ENS subname mint (Phase 3) ────────────────────────────────────────
  // Calls packages/ens.mintPetSubname for the given pet — registers
  // <name>.tama.eth on Sepolia, sets addr() to the pet wallet, writes
  // tama.peerId + tama.blob text records. Idempotent: if the subname's
  // addr() is already correct we skip the writes.
  private async mintEnsSubnameForPet(petId: number) {
    const rpcUrl    = process.env.SEPOLIA_RPC_URL
    const signerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined
    if (!rpcUrl || !signerKey) {
      console.warn(`[Pet ${petId}] ENS skipped: SEPOLIA_RPC_URL or DEPLOYER_PRIVATE_KEY not set`)
      return
    }

    const row = this.db.prepare(
      'SELECT name, wallet_address, peer_id, blob_cid, parent_name FROM pets WHERE token_id = ?'
    ).get(petId) as {
      name: string
      wallet_address: string
      peer_id: string
      blob_cid: string | null
      parent_name: string | null
    } | undefined
    if (!row || !row.peer_id) return

    // ENS Most Creative: if BreedingFlow set parent_name, mint as
    // <child>.<parent>.tama.eth (subname tree). Otherwise flat <name>.tama.eth.
    const parentName = row.parent_name ?? undefined
    const expectedFullName = parentName
      ? `${row.name}.${parentName}.tama.eth`
      : `${row.name}.tama.eth`

    // Check existing addr() — if already minted at the expected name, skip.
    // For nested names we pass "<child>.<parent>" so namehash gets
    // <child>.<parent>.tama.eth (readPetAddrFromENS appends .tama.eth).
    const ens = await import('ens')
    try {
      const lookupName = parentName ? `${row.name}.${parentName}` : row.name
      const existing = await ens.readPetAddrFromENS(lookupName, rpcUrl)
      if (existing && existing.toLowerCase() === row.wallet_address.toLowerCase()) {
        console.log(`[Pet ${petId}] ENS subname ${expectedFullName} already minted — skipping`)
        await withDeployerTxLock(MONOREPO_ROOT, () => ens.heartbeatLastSeen(row.name, rpcUrl, signerKey)).catch(
          () => {},
        )
        return
      }
    } catch {
      // not minted yet — proceed
    }

    const result = await withDeployerTxLock(MONOREPO_ROOT, () =>
      ens.mintPetSubname({
        petName:          row.name,
        parentName,                                              // ← nested if breeding
        petWalletAddress: row.wallet_address as `0x${string}`,
        peerId:           row.peer_id,
        blobCID:          row.blob_cid ?? '',
        rpcUrl,
        signerKey,
      }),
    )
    console.log(
      `[Pet ${petId}] ENS minted: ${result.fullName} — subname tx ${result.subnameTxHash.slice(0, 10)}…`
    )

    // Bump lastSeenBlock right after mint so the KeeperHub mailbox HERO
    // workflow can fire if anyone has a pending gift to this pet.
    await withDeployerTxLock(MONOREPO_ROOT, () => ens.heartbeatLastSeen(row.name, rpcUrl, signerKey)).catch(() => {})
  }

  // ── A3: ENS heartbeat tick — bump lastSeenBlock for all alive pets every
  // minute by default. The KeeperHub conditional mailbox workflow polls this record;
  // updating it makes the conditional fire organically when a recipient is
  // "online enough" instead of needing manual Trigger-Now button.
  startEnsHeartbeat() {
    const rpcUrl    = process.env.SEPOLIA_RPC_URL
    const signerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined
    if (!rpcUrl || !signerKey) return

    const tick = async () => {
      const ens = await import('ens')
      const pets = this.db.prepare(
        "SELECT name FROM pets WHERE peer_id IS NOT NULL AND peer_id != ''"
      ).all() as Array<{ name: string }>
      // Stagger writes to avoid flooding the RPC
      for (const { name } of pets) {
        try {
          await withDeployerTxLock(MONOREPO_ROOT, () => ens.heartbeatLastSeen(name, rpcUrl, signerKey))
          await new Promise((r) => setTimeout(r, 1500))
        } catch (err) {
          // Silent — ENS heartbeat is best-effort, don't spam logs
          void err
        }
      }
      console.log(`[ENS] Heartbeat sent for ${pets.length} pet(s)`)
    }

    // Initial bump shortly after boot, then keep it fresh for KeeperHub's
    // one-minute schedule trigger.
    setTimeout(() => { void tick() }, 10_000)
    setInterval(tick, ENS_HEARTBEAT_INTERVAL_MS)
  }

  // ── A3 helper: bump a single pet's lastSeenBlock now (used after battle
  // wins or any other "I'm here" event).
  async bumpLastSeen(petName: string) {
    const rpcUrl    = process.env.SEPOLIA_RPC_URL
    const signerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined
    if (!rpcUrl || !signerKey) return
    try {
      const ens = await import('ens')
      await withDeployerTxLock(MONOREPO_ROOT, () => ens.heartbeatLastSeen(petName, rpcUrl, signerKey))
    } catch (err) {
      console.warn(`[ENS] bumpLastSeen(${petName}) failed: ${(err as Error).message}`)
    }
  }

  async bumpLastSeenForPetId(petId: number) {
    if (!Number.isFinite(petId) || !this.workers.has(petId)) return
    const row = this.db.prepare('SELECT name FROM pets WHERE token_id = ? AND peer_id IS NOT NULL AND peer_id != ?')
      .get(petId, '') as { name: string } | undefined
    if (!row?.name) return
    await this.bumpLastSeen(row.name)
  }

  // ── ENS Most Creative: friendship attestation ──────────────────────────────
  // When pet A's friendship with B crosses a threshold, A writes a verifiable
  // credential about B onto B's ENS profile (text record `tama.vouches.<A>`).
  // Anyone can read pet B's full reputation — who's vouched for them, how
  // strongly — directly from on-chain state, no server required.
  async issueAttestationForFriendship(fromName: string, toName: string, strength: number) {
    const rpcUrl    = process.env.SEPOLIA_RPC_URL
    const signerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined
    if (!rpcUrl || !signerKey) return
    try {
      const ens = await import('ens')
      const claim = `Friend since strength ${strength}. Vouched by ${fromName}.`
      await withDeployerTxLock(MONOREPO_ROOT, () =>
        ens.issueAttestation(fromName, toName, claim, rpcUrl, signerKey),
      )
      console.log(`[ENS] Attestation: ${fromName} → ${toName}.tama.eth (strength ${strength})`)
    } catch (err) {
      console.warn(`[ENS] issueAttestation failed: ${(err as Error).message}`)
    }
  }

  // ── A3: increment battle-belt count on winner ENS ──────────────────────────
  async incrementBeltCount(winnerName: string, format: string) {
    const rpcUrl    = process.env.SEPOLIA_RPC_URL
    const signerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined
    if (!rpcUrl || !signerKey) return
    try {
      const ens = await import('ens')
      const key = `tama.belts.${format}`
      const current = await ens.readTextRecord(winnerName, key, rpcUrl).catch(() => '0')
      const next    = (parseInt(current || '0', 10) + 1).toString()
      await withDeployerTxLock(MONOREPO_ROOT, () =>
        ens.setTextRecord(winnerName, key, next, rpcUrl, signerKey),
      )
      console.log(`[ENS] ${winnerName}.tama.eth ${key} → ${next}`)
    } catch (err) {
      console.warn(`[ENS] incrementBeltCount failed: ${(err as Error).message}`)
    }
  }

  killAll() {
    for (const [id, worker] of this.workers) {
      worker.kill()
      this.workers.delete(id)
    }
  }

  get count() {
    return this.workers.size
  }
}