import { fork, type ChildProcess } from 'child_process'
import path from 'path'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { TamaPetABI, ADDRESSES_SEPOLIA } from 'contracts-sdk'
import type { Server as SocketIOServer } from 'socket.io'
import type { DB } from './db'
import { generatePetAxlConfig } from './axl-config'

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

    const workerPath = path.resolve(
      __dirname, '..', '..', '..', 'packages', 'pet-runtime', 'src', 'worker.ts'
    )

    const worker = fork(workerPath, [], {
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
        // Worker sent a chat message — forward to all socket clients as a chat bubble
        this.io?.to('world').emit('chat', {
          from:      m.petId,
          to:        m.toPetId,
          text:      m.text,
          timestamp: Date.now(),
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