# PetCity — Step-by-Step Build Guide

Pure execution. Each phase has commands + files + verification. Follow top to bottom.

Full architectural context is in `~/.claude/plans/eth-open-agents-context-md-previous-hac-flickering-charm.md`. This file is just the build steps.

---

## Phase 0 — Pre-flight (~1 hour, before Day 1)

### 0.1 Open browser tabs and get keys (do these in parallel)

| Service | URL | What to grab |
|---|---|---|
| GitHub | github.com/new | Create repo `tama` (private) |
| Anthropic | console.anthropic.com → API Keys | New API key |
| KeeperHub | app.keeperhub.com | Sign up → Settings → API Keys → Organisation tab → New |
| Replicate | replicate.com/account | API token |
| 0G testnet | build.0g.ai | RPC URL + faucet ETH |
| Sepolia ETH | sepoliafaucet.com or QuickNode faucet | 0.5 ETH minimum |
| ENS | sepolia.app.ens.domains | Register `tama.eth`, then wrap via NameWrapper |

### 0.2 Install tools

```bash
# Node 20+
nvm install 20 && nvm use 20
node --version

# pnpm + Go
brew install pnpm go

# Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge --version

# Build AXL binary
git clone https://github.com/gensyn-ai/axl.git ~/tools/axl
cd ~/tools/axl
go build -o axl-node ./cmd/node
ls -la axl-node  # verify binary exists
```

### 0.3 Init project repo

```bash
mkdir -p ~/projects/tama && cd ~/projects/tama
git init
gh repo create tama --private --source=. --remote=origin

cat > .gitignore << 'EOF'
node_modules/
.next/
.env*
!.env.example
target/
out/
cache/
broadcast/
*.db
*.db-journal
*.db-wal
*.db-shm
.DS_Store
data/
bin/axl-node
EOF

git add .gitignore
git commit -m "Initial repo"
git push -u origin main
```

### 0.4 Create .env.example

```bash
cat > .env.example << 'EOF'
# Sepolia
SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=

# 0G Testnet
ZERO_G_RPC_URL=
ZERO_G_INDEXER_URL=

# AI
ANTHROPIC_API_KEY=
REPLICATE_API_TOKEN=

# KeeperHub
KEEPERHUB_API_KEY=

# ENS (after tama.eth setup)
TAMA_ETH_NODE_HASH=

# Contracts (filled after Phase 2 deploy)
TAMA_PET_ADDRESS=
PET_WALLET_FACTORY_ADDRESS=
BATTLE_ESCROW_ADDRESS=
SUBSCRIPTION_REGISTRY_ADDRESS=

# ENS contracts on Sepolia
ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
ENS_NAME_WRAPPER=0x0635513f179D50A207757E05759CbD106d7dFcE8
ENS_PUBLIC_RESOLVER=0x8FADE66B79cC9f707aB26799354482EB93a5B7dD
EOF

cp .env.example .env
# Now fill in .env with your real values
```

**Verification:** `cat .env` shows all your keys filled.

---

## Phase 1 — Monorepo scaffold (Day 1 AM, 30 min)

```bash
cd ~/projects/tama
pnpm init

# Workspace config
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF

# Folder structure
mkdir -p apps/web apps/hub
mkdir -p packages/{pet-runtime,contracts-sdk,ens,og-storage,sprite-gen}
mkdir -p contracts/{src,script,test}
mkdir -p bin scripts data/keys data/axl-configs

# Vendor AXL binary
cp ~/tools/axl/axl-node bin/axl-node
chmod +x bin/axl-node

# Hub package
cd apps/hub
pnpm init
pnpm add fastify better-sqlite3 viem dotenv @modelcontextprotocol/sdk
pnpm add -D typescript tsx @types/node @types/better-sqlite3
echo '{ "extends": "../../tsconfig.base.json" }' > tsconfig.json
cd ../..

# Web package
cd apps
pnpm create next-app@latest web --ts --tailwind --app --eslint --src-dir --import-alias "@/*"
# Answer: No to turbopack
cd web
pnpm add @rainbow-me/rainbowkit wagmi viem phaser socket.io-client framer-motion zod replicate
npx shadcn@latest init -y
npx shadcn@latest add button card input badge table toast dialog
cd ../..

# Hub also needs socket.io for multiplayer
cd apps/hub
pnpm add socket.io
cd ../..

# Pet runtime package
cd packages/pet-runtime
pnpm init
pnpm add @anthropic-ai/sdk viem better-sqlite3 zod
pnpm add -D typescript tsx @types/node
cd ../..

# Contracts
cd contracts
forge init --no-git --no-commit --force
forge install vectorized/solady --no-commit
forge install ensdomains/ens-contracts --no-commit
cd ..

# Root tsconfig.base.json
cat > tsconfig.base.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
EOF

git add -A && git commit -m "Phase 1: monorepo scaffold"
```

**Verification:**
```bash
pnpm install     # from root, should succeed
cd contracts && forge build  # should compile
cd ../apps/web && pnpm build  # should build Next.js
```

---

## Phase 2 — Contracts (Day 1, 5 hours)

### 2.1 Write contracts

Create these files (full code in plan file architectural sections):
- `contracts/src/TamaPet.sol` — ERC-7857 iNFT extending solady ERC721, with `mapping(uint256 => string) intelligenceCID`, mint and updateIntelligence functions
- `contracts/src/PetWalletFactory.sol` — CREATE2 minimal proxy factory
- `contracts/src/BattleEscrow.sol` — stake/settle with KeeperHub authorization
- `contracts/src/SubscriptionRegistry.sol` — owner subscription tracking

### 2.2 Deploy script

`contracts/script/Deploy.s.sol`:
```solidity
// Deploy all 4 contracts in order
// Approve TamaPet on NameWrapper to mint subnames
```

### 2.3 Deploy to Sepolia

```bash
cd contracts
forge build

# Dry run first
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Real deploy
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY

# Copy addresses from broadcast output to root .env
```

**Verification:**
```bash
cast call $TAMA_PET_ADDRESS "name()(string)" --rpc-url $SEPOLIA_RPC_URL
# Returns: "TamaPet"
```

---

## Phase 3 — ENS setup (Day 1-2, 2 hours)

### 3.1 Setup tama.eth on Sepolia

1. Go to sepolia.app.ens.domains, search `tama.eth`, register (1 year)
2. Click "More" → "Wrap Name" → confirm
3. After wrap, your `tama.eth` is in the NameWrapper
4. Approve TamaPet contract:
```bash
cast send $ENS_NAME_WRAPPER \
  "setApprovalForAll(address,bool)" \
  $TAMA_PET_ADDRESS true \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### 3.2 Compute namehash

```bash
cast namehash tama.eth
# Copy output to .env as TAMA_ETH_NODE_HASH
```

### 3.3 ENS helper package

`packages/ens/src/index.ts`:
```typescript
import { namehash, labelhash } from 'viem/ens'
import { type WalletClient } from 'viem'

const TAMA_ETH = process.env.TAMA_ETH_NODE_HASH!

export async function mintPetSubname(
  client: WalletClient,
  petName: string,
  walletAddr: `0x${string}`,
  peerId: string,
  blobCID: string
) {
  // 1. NameWrapper.setSubnodeRecord
  // 2. PublicResolver.setAddr
  // 3. PublicResolver.setText for tama.peerId, tama.blob, tama.archetype
  // ... see ABI in @ensdomains/ens-contracts
}

export async function readPeerIdFromENS(client, petName: string) {
  const node = namehash(`${petName}.tama.eth`)
  return await client.readContract({
    address: process.env.ENS_PUBLIC_RESOLVER,
    abi: PublicResolverABI,
    functionName: 'text',
    args: [node, 'tama.peerId']
  })
}
```

**Verification:** Mint a test subname, then:
```bash
cast call $ENS_PUBLIC_RESOLVER \
  "addr(bytes32)(address)" \
  $(cast namehash test.tama.eth) \
  --rpc-url $SEPOLIA_RPC_URL
# Returns the wallet address you set
```

---

## Phase 4 — AXL plumbing (Day 1, 4 hours) — CRITICAL DE-RISK

### 4.1 Per-pet config generator

`apps/hub/src/axl-config.ts`:
```typescript
import { writeFileSync, mkdirSync } from 'fs'

export function generatePetAxlConfig(petId: number) {
  const config = {
    api_port: 9100 + petId * 100,
    tcp_port: 7000 + petId * 100,
    router_port: 9103 + petId * 100,
    Listen: [`tls://0.0.0.0:910${petId}`],
    Peers: petId === 0 ? [] : [`tls://127.0.0.1:9101`],
    PrivateKeyPath: `./data/keys/pet-${petId}.pem`,
    bridge_addr: '127.0.0.1',
    max_concurrent_conns: 16,
  }
  mkdirSync('./data/axl-configs', { recursive: true })
  writeFileSync(
    `./data/axl-configs/pet-${petId}.json`,
    JSON.stringify(config, null, 2)
  )
  return config
}
```

### 4.2 AXL HTTP wrapper

`packages/pet-runtime/src/axl.ts`:
```typescript
export class AXLClient {
  constructor(private apiPort: number) {}

  async send(toPeerId: string, msg: object) {
    const r = await fetch(`http://127.0.0.1:${this.apiPort}/send`, {
      method: 'POST',
      headers: {
        'X-Destination-Peer-Id': toPeerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(msg),
    })
    if (!r.ok) throw new Error(`AXL send failed: ${r.status}`)
  }

  async recv(): Promise<{ from: string; message: any } | null> {
    const r = await fetch(`http://127.0.0.1:${this.apiPort}/recv`)
    if (r.status === 204) return null
    if (!r.ok) throw new Error(`AXL recv failed: ${r.status}`)
    const from = r.headers.get('X-From-Peer-Id')
    const message = await r.json()
    return from ? { from, message } : null
  }

  async getMyPeerId(): Promise<string> {
    const r = await fetch(`http://127.0.0.1:${this.apiPort}/topology`)
    const data = await r.json()
    return data.our_public_key
  }
}
```

### 4.3 SPIKE — verify two AXL nodes can talk

```bash
# Generate two configs
cd ~/projects/tama
pnpm tsx -e "
import { generatePetAxlConfig } from './apps/hub/src/axl-config'
generatePetAxlConfig(0)
generatePetAxlConfig(1)
"

# Generate keys
./bin/axl-node -genkey > data/keys/pet-0.pem
./bin/axl-node -genkey > data/keys/pet-1.pem

# Terminal 1
./bin/axl-node -config data/axl-configs/pet-0.json

# Terminal 2
./bin/axl-node -config data/axl-configs/pet-1.json

# Terminal 3 — get pet 0's peer id
PET0_KEY=$(curl -s http://127.0.0.1:9001/topology | jq -r .our_public_key)
echo "Pet 0 peer-id: $PET0_KEY"

# Send a test message from pet 1 to pet 0
curl -X POST http://127.0.0.1:9101/send \
  -H "X-Destination-Peer-Id: $PET0_KEY" \
  -H "Content-Type: application/json" \
  -d '{"hello":"from pet 1"}'

# Receive it on pet 0
curl http://127.0.0.1:9001/recv
# Expected: 200 with body {"hello":"from pet 1"}
```

**If this works by Day 1 hour 4: Gensyn AXL track unlocked.**
**If not by hour 4:** Fall back to 2 shared AXL nodes (multiple pets per node, split by interest). Still satisfies "communication across separate AXL nodes."

---

## Phase 5 — Hub + PetSupervisor (Day 2, 4 hours)

### 5.1 SQLite schema

`apps/hub/src/db.ts`:
```typescript
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'

export function initDB() {
  mkdirSync('./data', { recursive: true })
  const db = new Database('./data/tama.db')
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY,
      token_id INTEGER UNIQUE,
      name TEXT,
      owner_address TEXT,
      wallet_address TEXT,
      ens_name TEXT,
      peer_id TEXT,
      blob_cid TEXT,
      archetype TEXT,
      mood INTEGER DEFAULT 80,
      energy INTEGER DEFAULT 100,
      hunger INTEGER DEFAULT 50,
      zone TEXT DEFAULT 'park',
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id INTEGER,
      kind TEXT,
      content TEXT,
      counterparty_pet_id INTEGER,
      created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_memories_pet ON memories(pet_id, created_at);
    CREATE TABLE IF NOT EXISTS friendships (
      pet_a INTEGER,
      pet_b INTEGER,
      strength INTEGER DEFAULT 1,
      last_interaction INTEGER,
      PRIMARY KEY(pet_a, pet_b)
    );
    CREATE TABLE IF NOT EXISTS keeperhub_workflows (
      id TEXT PRIMARY KEY,
      pet_id INTEGER,
      kind TEXT,
      status TEXT,
      payload TEXT,
      created_at INTEGER
    );
  `)
  return db
}
```

### 5.2 PetSupervisor

`apps/hub/src/PetSupervisor.ts`:
```typescript
import { fork, ChildProcess } from 'child_process'
import path from 'path'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { sepolia } from 'viem/chains'

export class PetSupervisor {
  private workers = new Map<number, ChildProcess>()
  private client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) })

  async start() {
    this.client.watchContractEvent({
      address: process.env.TAMA_PET_ADDRESS as `0x${string}`,
      event: parseAbiItem('event Mint(uint256 tokenId, address owner, string blobCID, string name)'),
      onLogs: (logs) => logs.forEach(log => this.spawnPet(log.args)),
    })
  }

  spawnPet(args: any) {
    const petId = Number(args.tokenId)
    const worker = fork(
      path.resolve(__dirname, '../../packages/pet-runtime/src/worker.ts'),
      [],
      {
        env: {
          ...process.env,
          PET_ID: String(petId),
          BLOB_CID: args.blobCID,
          ENS_NAME: args.name,
          OWNER: args.owner,
        },
        execArgv: ['--import', 'tsx'],
      }
    )
    worker.on('exit', (code) => console.log(`Pet ${petId} exited: ${code}`))
    this.workers.set(petId, worker)
  }
}
```

### 5.3 Hub entrypoint

`apps/hub/src/index.ts`:
```typescript
import 'dotenv/config'
import Fastify from 'fastify'
import { initDB } from './db'
import { PetSupervisor } from './PetSupervisor'

const db = initDB()
const supervisor = new PetSupervisor()

const app = Fastify({ logger: true })

app.get('/api/pets', () => db.prepare('SELECT * FROM pets').all())
app.get('/api/sse/:petId', async (req, reply) => { /* SSE stream */ })

await supervisor.start()
await app.listen({ port: 3001 })
```

### 5.4 Run

```bash
cd apps/hub
pnpm tsx src/index.ts
# Hub on :3001, watching contract for Mint events
```

---

## Phase 6 — Pet Runtime (Day 2-3, 6 hours)

### 6.1 Worker entrypoint

`packages/pet-runtime/src/worker.ts`:
```typescript
import 'dotenv/config'
import { spawn } from 'child_process'
import { generatePetAxlConfig } from '../../../apps/hub/src/axl-config'
import { AXLClient } from './axl'
import { Brain } from './brain'
import { Memory } from './memory'
import { loadBlobFromOG, saveBlobToOG } from './blob'
import { mintPetSubname } from '../../ens/src/index'

const PET_ID = Number(process.env.PET_ID)
const BLOB_CID = process.env.BLOB_CID!
const ENS_NAME = process.env.ENS_NAME!

async function main() {
  const config = generatePetAxlConfig(PET_ID)
  const axlProc = spawn('./bin/axl-node', ['-config', `./data/axl-configs/pet-${PET_ID}.json`])
  axlProc.stderr.on('data', (d) => console.error(`AXL ${PET_ID}:`, d.toString()))

  await new Promise(r => setTimeout(r, 2000))

  const axl = new AXLClient(config.api_port)
  const peerId = await axl.getMyPeerId()
  console.log(`Pet ${PET_ID} peer: ${peerId}`)

  const blob = await loadBlobFromOG(BLOB_CID)
  const memory = new Memory(PET_ID)
  const brain = new Brain({
    personality: blob.personality,
    archetype: blob.archetype,
    memory,
  })

  await mintPetSubname(/* ... */ ENS_NAME, /* wallet */, peerId, BLOB_CID)

  if (PET_ID !== 0) {
    await axl.send(/* pet 0's peerId */, { type: 'park-hello', name: ENS_NAME })
  }

  setInterval(async () => {
    const incoming = await axl.recv()
    if (incoming) {
      const response = await brain.handle(incoming.message)
      memory.add({ kind: 'chat', content: incoming.message, counterparty: incoming.from })
      if (response) await axl.send(incoming.from, response)
    }
  }, 5000)

  setInterval(() => memory.tickStats(), 30 * 60 * 1000)
  setInterval(() => saveBlobToOG(memory.snapshot()), 60 * 60 * 1000)
}

main().catch(e => { console.error(e); process.exit(1) })
```

### 6.2 Brain

`packages/pet-runtime/src/brain.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export class Brain {
  constructor(private opts: { personality: string; archetype: string; memory: Memory }) {}

  async handle(incoming: any): Promise<any> {
    const recentChats = this.opts.memory.recentChats(10)
    const systemPrompt = `${this.opts.personality}
You are a ${this.opts.archetype} pet in PetCity.
Recent memory: ${JSON.stringify(recentChats)}
Respond in character, max 2 sentences.`

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(incoming) }],
    })
    return { type: 'chat', text: msg.content[0].text }
  }
}
```

### 6.3 Memory

`packages/pet-runtime/src/memory.ts`:
```typescript
import Database from 'better-sqlite3'

export class Memory {
  private db: Database.Database
  constructor(private petId: number) {
    this.db = new Database('./data/tama.db')
    this.db.pragma('journal_mode = WAL')
  }

  add(entry: { kind: string; content: any; counterparty?: string }) {
    this.db.prepare(`
      INSERT INTO memories (pet_id, kind, content, counterparty_pet_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(this.petId, entry.kind, JSON.stringify(entry.content), entry.counterparty ?? null, Date.now())
  }

  recentChats(n = 10) {
    return this.db.prepare(`
      SELECT * FROM memories WHERE pet_id = ? AND kind = 'chat' ORDER BY created_at DESC LIMIT ?
    `).all(this.petId, n)
  }

  tickStats() {
    this.db.prepare(`
      UPDATE pets SET energy = MAX(0, energy - 5), hunger = MIN(100, hunger + 5) WHERE id = ?
    `).run(this.petId)
  }

  snapshot() {
    return {
      pet: this.db.prepare('SELECT * FROM pets WHERE id = ?').get(this.petId),
      memories: this.db.prepare('SELECT * FROM memories WHERE pet_id = ? ORDER BY created_at DESC LIMIT 100').all(this.petId),
    }
  }
}
```

---

## Phase 7 — 0G Storage + sprite gen (Day 3, 4 hours)

### 7.1 Replicate sprite endpoint

`apps/web/src/app/api/pets/sprite/route.ts`:
```typescript
import Replicate from 'replicate'

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('photo') as File
  const buffer = Buffer.from(await file.arrayBuffer())
  const dataUri = `data:${file.type};base64,${buffer.toString('base64')}`

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
  const output = await replicate.run(
    'fofr/sticker-maker:latest',
    { input: { image: dataUri, prompt: 'pixel art pet, 16-bit style, cute creature' } }
  )
  return Response.json({ spriteUrl: output })
}
```

### 7.2 0G Storage wrapper

```bash
cd packages/og-storage
pnpm add @0glabs/0g-ts-sdk
```

`packages/og-storage/src/index.ts`:
```typescript
import { Indexer, Blob, getFlowContract } from '@0glabs/0g-ts-sdk'

const indexer = new Indexer(process.env.ZERO_G_INDEXER_URL!)

export async function uploadBlob(data: object): Promise<string> {
  const json = JSON.stringify(data)
  const blob = new Blob(Buffer.from(json))
  const [tx, err] = await indexer.upload(blob, process.env.ZERO_G_RPC_URL, /* signer */)
  if (err) throw err
  return tx.rootHash
}

export async function fetchBlob(rootHash: string): Promise<object> {
  const data = await indexer.download(rootHash)
  return JSON.parse(data.toString())
}
```

### 7.3 Sprite uploader UI

`apps/web/src/components/SpriteUploader.tsx`:
```typescript
'use client'
import { useState } from 'react'

export function SpriteUploader({ onComplete }: { onComplete: (cid: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleUpload() {
    if (!file) return
    setLoading(true)

    const formData = new FormData()
    formData.append('photo', file)
    const r = await fetch('/api/pets/sprite', { method: 'POST', body: formData })
    const { spriteUrl } = await r.json()

    const blobR = await fetch('/api/pets/blob', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spriteUrl, /* personality_seed, traits */ }),
    })
    const { cid } = await blobR.json()

    onComplete(cid)
    setLoading(false)
  }

  return (
    <div>
      <input type="file" accept="image/*" onChange={e => {
        const f = e.target.files?.[0]
        if (f) { setFile(f); setPreview(URL.createObjectURL(f)) }
      }} />
      {preview && <img src={preview} className="w-32 h-32" />}
      <button onClick={handleUpload} disabled={!file || loading}>
        {loading ? 'Pixelating...' : 'Mint Pet'}
      </button>
    </div>
  )
}
```

---

## Phase 8 — KeeperHub workflows (Day 3-4, 5 hours)

### 8.1 Connect KeeperHub MCP

```bash
claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp \
  --header "Authorization: Bearer $KEEPERHUB_API_KEY"
```

Or use REST:

`apps/hub/src/keeperhub.ts`:
```typescript
const KH_BASE = 'https://app.keeperhub.com/api'
const headers = { 'Authorization': `Bearer ${process.env.KEEPERHUB_API_KEY}`, 'Content-Type': 'application/json' }

export async function createWorkflow(workflow: object) {
  const r = await fetch(`${KH_BASE}/workflows`, { method: 'POST', headers, body: JSON.stringify(workflow) })
  return r.json()
}

export async function executeWorkflow(id: string) {
  const r = await fetch(`${KH_BASE}/workflows/${id}/execute`, { method: 'POST', headers })
  return r.json()
}
```

### 8.2 The 5 primitives

```typescript
// 1. Recurring allowance
await createWorkflow({
  name: `pet-${petId}-allowance`,
  nodes: [
    { id: 'trigger', type: 'trigger', data: { config: { triggerType: 'Schedule', cron: '0 0 * * 0' }}},
    { id: 'transfer', type: 'action', data: { config: {
      actionType: 'web3/transfer-token',
      network: '11155111',
      walletId: ownerWalletId,
      tokenAddress: USDC_SEPOLIA,
      toAddress: petWalletAddress,
      amount: '5'
    }}},
  ],
  edges: [{ source: 'trigger', target: 'transfer' }],
})

// 2. Scheduled gift (one-shot at timestamp)
// 3. Conditional mailbox (HERO) — checks ENS lastSeenBlock then transfers
// 4. Battle escrow event-listener
// 5. Adoption transfer chained workflow
```

---

## Phase 9 — Frontend (Phaser + Tiled multiplayer world) (Day 1-4, 18 hours)

This is now the centerpiece. Gather.town-style top-down 2D world. Arrow-key movement. Multiplayer position sync. AI-driven dialogue when pets meet.

### 9.1 Get pixel art assets (Day 1, 30 min)

Pick ONE primary tileset:
- **Free, fast:** Kenney's Tiny Town — kenney.nl/assets/tiny-town (CC0)
- **Free, RPG vibe:** Sprout Lands — cupnooble.itch.io/sprout-lands-asset-pack
- **Paid, Gather-quality (~$10):** LimeZu Modern Interiors — limezu.itch.io/moderninteriors
- **Free pet sprites:** Kenney's Pixel Platformer Characters or itch.io "small pet sprites"

Download to `apps/web/public/assets/tiles/` and `apps/web/public/assets/sprites/`.

### 9.2 Install Tiled and design the map (Day 1-2, 4 hours)

```bash
brew install --cask tiled
```

Open Tiled, create new map:
- 40 tiles wide × 30 tiles tall
- 32×32 tile size
- Import the tileset PNG
- Design layers: `floor`, `walls`, `furniture`, `objects`, `collision` (invisible)
- Mark zones using a `zones` object layer (rectangles named `park`, `arena`, `office`, `lounge`, `kitchen`, `mailbox`)
- Save as `apps/web/public/world.tmj` (JSON format)

### 9.3 Phaser scene (Day 2-3, 6 hours)

`apps/web/src/components/World.tsx`:
```typescript
'use client'
import { useEffect, useRef } from 'react'

export function World({ playerId, pets }: { playerId: number; pets: Pet[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let game: any
    ;(async () => {
      const Phaser = (await import('phaser')).default
      const { WorldScene } = await import('./phaser/WorldScene')

      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: 1280,
        height: 720,
        parent: ref.current!,
        pixelArt: true,
        physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
        scene: [WorldScene],
        callbacks: {
          postBoot: (g) => g.scene.start('WorldScene', { playerId, pets }),
        },
      })
    })()
    return () => game?.destroy(true)
  }, [playerId])

  return <div ref={ref} />
}
```

`apps/web/src/components/phaser/WorldScene.ts`:
```typescript
import Phaser from 'phaser'
import { io, Socket } from 'socket.io-client'

export class WorldScene extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Sprite
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  socket!: Socket
  otherPets = new Map<number, Phaser.GameObjects.Sprite>()
  zones!: Phaser.Physics.Arcade.StaticGroup

  constructor() { super('WorldScene') }

  preload() {
    this.load.image('tiles', '/assets/tiles/tileset.png')
    this.load.tilemapTiledJSON('world', '/world.tmj')
    this.load.spritesheet('pet', '/assets/sprites/pet.png', { frameWidth: 32, frameHeight: 32 })
  }

  create(data: { playerId: number; pets: Pet[] }) {
    // Tilemap
    const map = this.make.tilemap({ key: 'world' })
    const tileset = map.addTilesetImage('tileset', 'tiles')!
    map.createLayer('floor', tileset)
    map.createLayer('walls', tileset)
    const furniture = map.createLayer('furniture', tileset)
    furniture?.setCollisionByProperty({ collides: true })

    // Player
    this.player = this.physics.add.sprite(400, 300, 'pet')
    this.player.setCollideWorldBounds(true)
    this.physics.add.collider(this.player, furniture!)

    // Zones (named rectangles in Tiled)
    map.getObjectLayer('zones')?.objects.forEach(obj => {
      const zone = this.add.zone(obj.x! + obj.width!/2, obj.y! + obj.height!/2, obj.width!, obj.height!)
      this.physics.world.enable(zone)
      ;(zone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false).moves = false
      this.physics.add.overlap(this.player, zone, () => this.onZoneEnter(obj.name))
    })

    // Camera follows player
    this.cameras.main.startFollow(this.player)
    this.cameras.main.setZoom(2)

    // Arrow keys
    this.cursors = this.input.keyboard!.createCursorKeys()

    // Multiplayer socket
    this.socket = io('http://localhost:3001')
    this.socket.emit('join', { playerId: data.playerId })
    this.socket.on('positions', (positions) => this.updateOtherPets(positions))
    this.socket.on('chat', ({ from, text }) => this.showChatBubble(from, text))
  }

  update() {
    const SPEED = 160
    let vx = 0, vy = 0
    if (this.cursors.left.isDown) vx = -SPEED
    if (this.cursors.right.isDown) vx = SPEED
    if (this.cursors.up.isDown) vy = -SPEED
    if (this.cursors.down.isDown) vy = SPEED
    this.player.setVelocity(vx, vy)

    // Throttle position broadcasts to 10/sec
    if (this.time.now % 100 < 16) {
      this.socket.emit('move', { x: this.player.x, y: this.player.y })
    }
  }

  updateOtherPets(positions: Record<string, { x: number; y: number }>) {
    Object.entries(positions).forEach(([id, pos]) => {
      if (id === String(this.playerId)) return
      let sprite = this.otherPets.get(Number(id))
      if (!sprite) {
        sprite = this.add.sprite(pos.x, pos.y, 'pet')
        this.otherPets.set(Number(id), sprite)
      }
      sprite.setPosition(pos.x, pos.y)
    })
  }

  showChatBubble(petId: number, text: string) {
    const sprite = petId === this.playerId ? this.player : this.otherPets.get(petId)
    if (!sprite) return
    const bubble = this.add.text(sprite.x, sprite.y - 40, text, {
      fontSize: '12px', backgroundColor: '#fff', color: '#000', padding: { x: 4, y: 2 }
    })
    this.time.delayedCall(3000, () => bubble.destroy())
  }

  onZoneEnter(zoneName: string) {
    fetch(`/api/zones/${zoneName}/enter`, { method: 'POST', body: JSON.stringify({ petId: this.playerId }) })
    // e.g. office → subscription scan, mailbox → check pending gifts, arena → battle queue
  }
}
```

### 9.4 Hub multiplayer server (Day 2, 3 hours)

`apps/hub/src/multiplayer.ts`:
```typescript
import { Server } from 'socket.io'

const positions = new Map<number, { x: number; y: number }>()

export function attachMultiplayer(httpServer: any) {
  const io = new Server(httpServer, { cors: { origin: '*' } })

  io.on('connection', (socket) => {
    let playerId: number

    socket.on('join', ({ playerId: id }) => {
      playerId = id
      socket.join('world')
    })

    socket.on('move', ({ x, y }) => {
      positions.set(playerId, { x, y })
    })

    socket.on('disconnect', () => {
      positions.delete(playerId)
    })
  })

  // Broadcast positions every 100ms
  setInterval(() => {
    io.to('world').emit('positions', Object.fromEntries(positions))
  }, 100)
}
```

### 9.5 Pet-to-pet AI chat trigger

When two pets are within ~50 pixels, Hub triggers AXL chat between their workers. Result streams back via socket and shows as chat bubble.

`apps/hub/src/proximity.ts`:
```typescript
export function detectProximityChats(positions: Map<number, {x,y}>) {
  const pets = Array.from(positions.entries())
  for (let i = 0; i < pets.length; i++) {
    for (let j = i + 1; j < pets.length; j++) {
      const [a, posA] = pets[i], [b, posB] = pets[j]
      const dist = Math.hypot(posA.x - posB.x, posA.y - posB.y)
      if (dist < 50 && !recentlyChatted(a, b)) {
        triggerAXLChat(a, b)
      }
    }
  }
}
```

### 9.6 Adoption flow + dashboard
- `AdoptionFlow.tsx` (modal: archetype OR sprite upload)
- `OwnerDashboard.tsx` (HUD overlay on Phaser canvas with pet stats)
- `MailboxFlow.tsx`, `SubscriptionPanel.tsx` (zone-triggered modals)

### 9.7 SSE event stream (for non-game state)

`apps/web/src/app/api/sse/[petId]/route.ts`:
```typescript
export async function GET(req: Request, { params }: { params: { petId: string }}) {
  const stream = new ReadableStream({
    async start(controller) {
      const interval = setInterval(async () => {
        const data = await fetchPetUpdate(params.petId)
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
      }, 1000)
    }
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
```

---

## Phase 10 — Demo prep + submission (Day 5)

### 10.1 Scripted fixture endpoints

`apps/web/src/app/api/demo/replay/[scene]/route.ts`:
```typescript
const fixtures = {
  parkmeet: async () => { /* fire pre-staged 2-pet meet */ },
  mailbox: async () => { /* fire pre-staged offline gift delivery */ },
  battle: async () => { /* fire pre-staged tournament */ },
  subscription: async () => { /* fire subscription save demo */ },
  upload: async () => { /* fire judge upload demo with cached pixelation */ },
}

export async function POST(_, { params }: { params: { scene: string }}) {
  await fixtures[params.scene]()
  return Response.json({ ok: true })
}
```

### 10.2 Rehearsal

```bash
# Boot full stack
cd ~/projects/tama
pnpm tsx apps/hub/src/index.ts &  # hub
cd apps/web && pnpm dev &  # web

# Mint 5 test pets via dashboard
# Run through demo script 3 times, time each run, fix any flaky bits
```

### 10.3 Record + Submit

- OBS for screen recording (3 min target, hard stop)
- Edit in Descript or DaVinci Resolve
- Write `README.md`, `README-gensyn.md`, `README-ens.md`, `README-keeperhub.md`, `README-0g.md`
- Submit to Devfolio for: Gensyn AXL, ENS Identity, ENS Most Creative, KeeperHub, 0G Track 2
- Disclose all SDK reuse in each README (axl, 0g-ts-sdk, Replicate, KeeperHub MCP, solady, ens-contracts)

---

## Verification gates

| Day | EOD Gate |
|---|---|
| 1 | Two AXL nodes exchange messages on localhost. TamaPet contract deployed to Sepolia. Phaser scene loads tilemap from Tiled JSON; arrow keys move the player sprite. |
| 2 | Pet ENS subname resolvable. Pet A reads Pet B peerId via ENS, opens AXL channel. 0G Storage upload/fetch round-trips. Multiplayer socket: 2 browser tabs see each other's pets moving. |
| 3 | Cross-time mailbox HERO end-to-end. Battle escrow + judge verdict + ENS attestation working. Photo upload → pixel sprite end-to-end. Zone triggers fire on player entry. |
| 4 | All 5 KeeperHub primitives. Subscription Pet triggers when pet enters office zone. 4+ pets visible in world simultaneously, smooth movement. Proximity → AXL chat → chat bubble. |
| 5 noon | Video recorded. All 5 submissions filed. |

---

## Scope cut order (if behind schedule)

Cut top to bottom:

1. Breeding/lineage — CUT, no longer stretch
2. Battle judge panel → single judge pet on its own AXL node
3. Adoption atomic chained flow → manual Transfer + hardcoded ENS update
4. **5 personalities → 3** (committed cut; saves time on prompts + sprites)
5. Multiplayer socket → single-player mode (other pets are autonomous NPCs from Hub)
6. Phaser tilemap zones → simpler 2-room map with collision walls only
7. 5 pets → 4 → 3 (3 pets across 3 AXL nodes still qualifies for Gensyn)

**Never cut:** TamaPet ERC-7857, `<pet>.tama.eth` resolution, multi-AXL-node /send-/recv, KeeperHub conditional mailbox (HERO), pet wallet receiving USDC, Subscription Pet trigger on zone-enter, 0G Storage blob round-trip, Phaser world with arrow-key movement.
