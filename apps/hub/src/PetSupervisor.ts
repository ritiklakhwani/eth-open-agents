import { fork, type ChildProcess } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { TamaPetABI, ADDRESSES_SEPOLIA } from 'contracts-sdk'
import type { Server as SocketIOServer } from 'socket.io'
import type { DB } from './db'
import { generatePetAxlConfig } from './axl-config'

// ESM doesn't expose __dirname; derive from import.meta.url so child-process
// fork paths resolve correctly when the hub runs via tsx in module mode.
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

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

export class PetSupervisor {
  private workers = new Map<number, ChildProcess>()
  private io?: SocketIOServer
  private client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  })

  constructor(private db: DB) {}

  setIO(io: SocketIOServer) {
    this.io = io
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

    this.db.prepare(`
      INSERT OR IGNORE INTO pets (token_id, name, owner_address, wallet_address, blob_cid, archetype, ens_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tokenId, name, owner, wallet, blobCID, archetype, `${name}.tama.eth`, Date.now())

    this.scheduleAllowanceWorkflow(tokenId, wallet)
      .catch(err => console.error(`[Pet ${tokenId}] allowance workflow error:`, err.message))

    // Repo root sits 3 levels above this file: apps/hub/src/PetSupervisor.ts
    const repoRoot   = path.resolve(__dirname, '..', '..', '..')
    const workerPath = path.join(repoRoot, 'packages', 'pet-runtime', 'src', 'worker.ts')

    const worker = fork(workerPath, [], {
      // Pin child's cwd to the repo root. The worker resolves the AXL binary +
      // axl-config files relative to process.cwd(), which would otherwise
      // inherit the hub's cwd (apps/hub) and miss the binary at <repo>/bin/axl-node.
      cwd: repoRoot,
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
        // Worker booted and has its AXL peerId — update DB, then ENS (Phase 3)
        this.db.prepare('UPDATE pets SET peer_id = ? WHERE token_id = ?')
          .run(m.peerId, m.petId)
        console.log(`[Supervisor] Pet ${m.petId} peer-ready: ${m.peerId}`)
        // TODO Phase 3: call ens.mintPetSubname(m.ensName, m.peerId) once Ritik ships ens package
      } else if (m.type === 'chat-out') {
        this.io?.to('world').emit('chat', {
          from: m.petId, to: m.toPetId, text: m.text, timestamp: Date.now(),
        })

      } else if (m.type === 'mailbox-queued') {
        this.db.prepare(
          'INSERT OR IGNORE INTO keeperhub_workflows (id, pet_id, kind, status, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(m.workflowId, m.petId, 'mailbox', 'active', JSON.stringify(m), Date.now())
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

      } else if (m.type === 'battle-result') {
        this.io?.to('world').emit('activity', {
          type: 'battle-result', petId: m.petId, battleId: m.battleId, winner: m.winner, text: m.text, timestamp: Date.now(),
        })

      } else {
        console.log(`[Pet ${tokenId}]`, msg)
      }
    })
    worker.on('error',  (err) => console.error(`[Pet ${tokenId}] error:`, err))
    worker.on('exit', (code) => {
      console.log(`[Pet ${tokenId}] exited (code ${code})`)
      this.workers.delete(tokenId)
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