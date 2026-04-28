import { fork, type ChildProcess } from 'child_process'
import path from 'path'
import { createPublicClient, http, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'
import type { DB } from './db'
import { generatePetAxlConfig } from './axl-config'

// Inline ABI until contracts-sdk is filled by Ritik (Phase 2)
const TAMA_PET_ABI = parseAbi([
  'event Mint(uint256 indexed tokenId, address indexed owner, string blobCID, string name)',
])

interface MintArgs {
  tokenId: number
  owner: `0x${string}`
  blobCID: string
  name: string
}

export class PetSupervisor {
  private workers = new Map<number, ChildProcess>()
  private client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  })

  constructor(private db: DB) {}

  async start() {
    const contractAddress = process.env.TAMA_PET_ADDRESS as `0x${string}` | undefined
    if (!contractAddress) {
      console.warn('[Supervisor] TAMA_PET_ADDRESS not set — skipping Mint event watcher')
      return
    }

    console.log(`[Supervisor] Watching ${contractAddress} for Mint events`)
    this.client.watchContractEvent({
      address: contractAddress,
      abi: TAMA_PET_ABI,
      eventName: 'Mint',
      onLogs: (logs) => {
        for (const log of logs) {
          const { tokenId, owner, blobCID, name } = log.args
          if (tokenId == null || !owner || !blobCID || !name) continue
          this.spawnPet({ tokenId: Number(tokenId), owner, blobCID, name })
        }
      },
      onError: (err) => console.error('[Supervisor] watchContractEvent error:', err),
    })
  }

  spawnPet({ tokenId, owner, blobCID, name }: MintArgs) {
    if (this.workers.has(tokenId)) {
      console.warn(`[Supervisor] Pet ${tokenId} already running`)
      return
    }

    // Generate AXL config + ed25519 key before the worker tries to read it (idempotent)
    generatePetAxlConfig(tokenId)

    this.db.prepare(`
      INSERT OR IGNORE INTO pets (token_id, name, owner_address, blob_cid, ens_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tokenId, name, owner, blobCID, `${name}.tama.eth`, Date.now())

    const workerPath = path.resolve(
      __dirname, '..', '..', '..', 'packages', 'pet-runtime', 'src', 'worker.ts'
    )

    const worker = fork(workerPath, [], {
      env: {
        ...process.env,
        PET_ID:   String(tokenId),
        BLOB_CID: blobCID,
        ENS_NAME: name,
        OWNER:    owner,
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
      } else {
        console.log(`[Pet ${tokenId}]`, msg)
      }
    })
    worker.on('error',   (err) => console.error(`[Pet ${tokenId}] error:`, err))
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