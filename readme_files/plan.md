# PetCity — ETHGlobal Open Agents (5-day, 2-person)

## Context

PetCity is a network of persistent AI agent pets where each pet is owned by a human as a transferrable NFT, runs as its own peer-to-peer node, has on-chain identity, lives 24/7, and earns the right to act on its owner's behalf. Locked over SuperMind because it has higher demo punch, lower competition density (the consumer-fun lane at agentic hackathons is empty), and 5 days favors PetCity (extra time becomes visible polish, not dead weight).

**Pitch:** the trust layer for mainstream AI adoption. Surface = pet society. Substrate = on-chain identity, autonomy, reputation, lineage. *"Animal Crossing taught a generation about commerce without anyone realizing. PetCity does the same for the agent economy."*

## What pets DO

| Capability | What | Demo role |
|---|---|---|
| Subscription Pet (workforce) | Manages owner's recurring bills via KeeperHub. Detects unused subs, proposes cancellations, executes on approval. | Practical hero — "pet saved me $20/mo" |
| Cross-time mailbox | Sends gifts/messages to offline friends' pets. KeeperHub queues, delivers when recipient wakes. | KeeperHub conditional-trigger HERO |
| Park social | Drifts in public Park, meets pets, builds memory-backed friendships. | Visible Gensyn AXL multi-node demo |
| Battles/Tournaments | Pet-vs-pet (debate, joke duel, trivia). 3-pet judge panel on separate AXL nodes deliberates. KeeperHub-staked outcomes. ENS belts. | AXL + KeeperHub + ENS triple play |
| Adoption/Transfer | ERC-721 transfer = ENS update + allowance balance follows via chained KeeperHub. | ENS + KeeperHub atomicity |
| Breeding (stretch) | Two pets pair → child mints with subname under both parents. Lineage tree. | ENS Creative prize hero (cuttable) |

## The World — Map with two zones

A small Pixi.js scene visually divided into two zones, with pets moving between them:

- **Park (left zone)** — grass-tinted background, scattered trees/benches, ambient drifting, friendship clusters form, chat bubbles on interaction. This is where social/memory/relationship building happens.
- **Battle Arena (right zone)** — stone-tinted ring, judge podiums, tournament bracket overlay above the ring, deliberation animation while judges vote. This is where stakes/competition/reputation accrue.

Pets transition zones via owner action ("send to Park" / "enter next tournament") or autonomous decision (high-energy pet roams to Arena, exhausted pet retreats to Park). The visual separation makes the demo crisper — judges see *where* social activity lives vs *where* stakes live.

## Custom pet creation — upload-your-own sprite (unlocks 0G iNFT track)

Adoption flow gives users two paths:

1. **Pick an archetype** (default — Scholar/Joker/Athlete/Sage/Gremlin with pre-built sprites)
2. **Upload a photo** — drag-drop or file picker → backend pixelates via Replicate API → result becomes pet's avatar

The strategic move: the custom sprite + pet's memory blob + personality vector all live encrypted on **0G Storage**, and the pet mints as an **ERC-7857 iNFT** with the 0G CID as its intelligence pointer. This is what makes the iNFT angle architecturally earned — the pet's full identity blob (visual + behavioral + relational) genuinely benefits from sealed storage. Without custom sprites, iNFT was thin; with them, it's the natural home.

**Demo punchline:** invite a judge to upload their face. Their pixelated pet appears in the Park within 5 seconds, joins the AXL mesh with a unique sprite served from 0G Storage, has its own LLM personality, starts making friends.

## Locked decisions

- Open-world social model (public Park + friend-graph discovery)
- Map with two zones: Park + Battle Arena
- **Pets minted as ERC-7857 iNFTs** with sprite + memory + personality on 0G Storage (promoted from stretch to v0)
- Custom pet upload flow ships in v0 alongside default archetypes
- v0 ships: Park social + care stats + battles + Subscription Pet + cross-time mailbox + adoption + custom sprite upload
- v0 stretch: breeding/lineage (only if Day 3 ahead of schedule)
- 2-person team, 5-day window
- **DB locked: better-sqlite3 with WAL mode.** Working memory tier (Hub + pet workers). 0G Storage is the canonical persistence layer for pet identity blobs. Evaluated alternatives (LowDB, Postgres, Redis, in-memory) — none meaningfully easier at this scale; SQLite+WAL is the right call.

## Architecture (top-down)

```
USER LAYER
  Owner Dashboard | Park View (Pixi) | Pet Inspector
  Adoption Flow | Battle Arena | Subscription Panel
        |
HUB (single Node/Fastify process)
  PetSupervisor (spawns pet workers via child_process.fork)
  SSE event aggregator → frontend
  KeeperHub MCP client + REST client
  viem clients (Sepolia)
  SQLite (better-sqlite3) at apps/hub/data/tama.db
        |
PET WORKERS (one OS process per pet)
  - Pet brain (Anthropic SDK: Haiku chitchat, Sonnet decisions)
  - Own AXL binary instance (unique ports per pet)
  - Smart wallet (CREATE2-derived)
  - Activity modules: chat/battle/care/breeding/subscription
        |
AXL P2P MESH (Yggdrasil)
  Pet 0 = Park bootstrap/rendezvous peer
  Pet-to-pet direct AXL channels (/send, /recv)
  Multi-pet group rooms for battles, judge panels
        |
ENS LAYER (Sepolia L1 NameWrapper)
  <pet>.tama.eth subnames
  Text records: peerId (AXL pubkey), traits, mood, energy,
    lastSeenBlock, achievements, attestations, friends
  Subname tree for breeding lineage
        |
KEEPERHUB
  Recurring: pet allowance, subscription pay
  Scheduled: one-shot gifts at future timestamps
  Conditional: mailbox delivery (HERO — fires when target's lastSeenBlock recent)
  Event-listener: adoption Transfer chain (ENS update + USDC sweep)
  Battle escrow release on judge verdict
        |
ONCHAIN (Sepolia)
  TamaPet ERC-721 | PetWalletFactory (CREATE2)
  BattleEscrow | SubscriptionRegistry | USDC (test)
```

## Tech stack

| Layer | Pick |
|---|---|
| Frontend | Next.js 15 + Tailwind + shadcn + Pixi.js (Park) + RainbowKit + viem + wagmi |
| Contracts | Foundry + solady ERC-721 |
| Pet runtime | Node + tsx, one OS process per pet, child_process.fork from Hub |
| Hub server | Node + Fastify |
| DB | **SQLite via better-sqlite3 with WAL mode** (`db.pragma('journal_mode = WAL')`). Sync API, zero infra, durable across Hub restarts, handles 5+ concurrent pet-worker writers without contention. Working memory tier; 0G Storage is canonical |
| ENS | Sepolia L1 NameWrapper directly (no 3rd-party subname API) |
| AXL | Vendored Go binary at bin/axl-node, one per pet |
| LLM | Anthropic SDK; haiku for chat, sonnet capped 5/day per pet |
| Sprite generation | Replicate API with pixel-art model (~$0.01/generation) |
| 0G Storage | Pet identity blob (sprite + memory + personality) — accessed via 0G SDK |
| Pet NFT standard | **ERC-7857 (iNFT)** — intelligence pointer on 0G Storage |
| KeeperHub | MCP from pet workers, REST from Hub |
| Pkg mgr | pnpm workspaces |

Cost estimate: ~$2/day total LLM at 5 pets × 30 events/day. Negligible.

## How a pet is born (mint → live)

1. User picks **archetype** (Scholar/Joker/Athlete/Sage/Gremlin → default sprite) **OR uploads a photo** (custom sprite path)
2. **If custom path:** frontend POSTs the image to `/api/pets/sprite` (multipart). Hub calls Replicate pixel-art model, gets back 128×128 sprite.
3. Hub uploads `{sprite, personality_vector, initial_memory, traits}` as encrypted blob to **0G Storage**, gets back CID.
4. Frontend calls `TamaPet.mint(name, blobCID, archetype, traits)`:
   - Mints ERC-7857 iNFT to owner with `intelligence = blobCID`
   - PetWalletFactory deploys CREATE2 smart wallet keyed by tokenId
   - NameWrapper mints `<name>.tama.eth`; addr() = pet wallet; text record `tama.blob` = CID
5. Hub watches Mint event → spawns pet worker via child_process.fork with env: PET_ID, BLOB_CID, WALLET_PK
6. Worker on boot:
   - Fetches blob from 0G Storage, decrypts, loads sprite + personality + memory
   - Materializes node-config-<petId>.json with unique ports (api: 9100+id*100, tcp: 7000+id*100, router: 9103+id*100)
   - Spawns its own axl-node binary as managed child
   - Writes peerId to ENS text record (so others discover via ENS)
   - Initializes SQLite memory namespace; restores from blob if pet existed before
7. Worker pings Pet 0 (Park rendezvous) → gets member list, enters Park zone
8. Worker enters live loop:
   - Every 5s: poll AXL /recv, dispatch envelope (chat/battle-invite/gift)
   - Every 30min: deterministic JS tick advances mood/energy/hunger (no LLM)
   - On owner POST /api/pet/:id/poke: handle interaction
   - On KeeperHub event: handle delivery/payout
   - Periodically (every 1h or on big state change): sync updated memory/state back to 0G Storage, update CID via TamaPet.updateIntelligence(tokenId, newCID)

Pet stays alive when owner is offline because it lives in Hub process tree, not browser. Pet's identity persists across Hub restarts because it's recoverable from 0G Storage.

## Track integration map (where each does real work)

### Gensyn AXL ($5k)
- Each pet runs OWN AXL binary (separate process, separate ports)
- Pet 0 is bootstrap/rendezvous — implements "Park topic" as gossip rendezvous
- All pet-to-pet messages flow over AXL /send and /recv
- Battle judge panels: 3 unaffiliated pets on separate AXL nodes deliberate
- Qualification: "communication across separate AXL nodes" ✓
- Depth: chat/battle/gift/mailbox/judge-panel — every interaction is AXL

### ENS Identity prize ($2.5k)
- `<pet>.tama.eth` minted at pet birth via Sepolia NameWrapper
- addr() resolves to pet's smart wallet — anyone can `send to alice.tama.eth`
- Text record `tama.peerId` holds AXL ed25519 pubkey — ENS becomes the discovery mechanism for AXL (filling Gensyn's admitted gap)

### ENS Most Creative prize ($2.5k)
- Subname tree for breeding lineage (`pup.fluffy.tama.eth`)
- Pet-issued attestation records (verifiable credentials)
- Achievement records (battle wins, friendship milestones, tournament belts)
- Brief verbatim alignment: "verifiable credentials in text records" + "subnames as access tokens"

### KeeperHub ($4.5k)
- 5 distinct primitives demonstrated:
  1. Recurring: weekly USDC allowance owner→pet
  2. Scheduled: one-shot future gifts
  3. Conditional (HERO): cross-time mailbox — fires when target's tama.lastSeenBlock is recent
  4. Event-listener: adoption Transfer chained workflow (ENS update + USDC sweep)
  5. Conditional escrow release: battle stakes on judge verdict
- Subscription Pet: pet brain calls KeeperHub MCP to analyze owner tx history, propose cancellations, schedule them
- Depth signal: judges see 5 primitives + MCP-driven agent integration

### 0G Autonomous Agents / iNFT track ($1.5k+ floor, up to $7.5k) — promoted from stretch to v0
- Pets are **ERC-7857 iNFTs**, not vanilla ERC-721
- Pet's identity blob (custom sprite + memory + personality vector + traits) lives encrypted on 0G Storage
- TamaPet contract stores `intelligence = CID` per token; updates as pet evolves
- Demo proof: invite a judge to upload their face → pet appears in Park within 5 seconds with sprite served from 0G Storage
- Brief alignment verbatim: *"iNFT-minted agents with embedded intelligence (encrypted on 0G Storage), persistent memory, dynamic upgrades"*

## File structure

```
tama/
├── pnpm-workspace.yaml
├── .env.local                # SEPOLIA_RPC, ANTHROPIC_API_KEY, KEEPERHUB_KEY, DEPLOYER_PK
├── apps/
│   ├── web/                                # Next.js
│   │   └── src/
│   │       ├── app/(park)/page.tsx
│   │       ├── app/api/sse/[petId]/route.ts
│   │       ├── app/api/pet/[id]/poke/route.ts
│   │       ├── app/api/pets/sprite/route.ts        # Replicate pixelation endpoint
│   │       ├── app/api/pets/blob/route.ts          # 0G Storage upload/fetch
│   │       ├── components/World.tsx                 # Pixi map: Park + Arena zones
│   │       ├── components/Park.tsx                  # Park zone behavior
│   │       ├── components/BattleArena.tsx           # Arena zone behavior
│   │       ├── components/PetCard.tsx
│   │       ├── components/AdoptionFlow.tsx          # Archetype OR upload
│   │       ├── components/SpriteUploader.tsx        # Drag-drop + preview
│   │       ├── components/SubscriptionPanel.tsx
│   │       ├── components/MailboxFlow.tsx
│   │       └── components/BreedingFlow.tsx          (stretch)
│   └── hub/                                # Supervisor + REST gateway
│       ├── src/index.ts
│       ├── src/PetSupervisor.ts
│       ├── src/keeperhub.ts                # MCP + REST
│       ├── src/db.ts                       # better-sqlite3
│       ├── data/tama.db
│       └── data/axl-configs/<petId>.json
├── packages/
│   ├── pet-runtime/                        # Per-pet worker
│   │   └── src/
│   │       ├── worker.ts                   # entry; child_process target
│   │       ├── axl.ts                      # /send /recv wrapper
│   │       ├── brain.ts                    # LLM loop, model tiers
│   │       ├── memory.ts                   # SQLite-backed long memory
│   │       ├── blob.ts                     # 0G Storage sync (load + persist identity blob)
│   │       ├── personality/{sage,gremlin,athlete,joker,scholar}.md
│   │       └── activities/
│   │           ├── chat.ts
│   │           ├── battle.ts
│   │           ├── care.ts
│   │           ├── zone-transition.ts      # Park <-> Arena movement logic
│   │           ├── breeding.ts             (stretch)
│   │           └── subscription.ts
│   ├── contracts-sdk/                      # viem ABIs + helpers
│   ├── og-storage/                         # 0G Storage SDK wrapper
│   ├── sprite-gen/                         # Replicate API client for pixelation
│   └── ens/                                # NameWrapper helpers
├── contracts/                              # Foundry
│   ├── src/TamaPet.sol
│   ├── src/PetWalletFactory.sol
│   ├── src/BattleEscrow.sol
│   ├── src/SubscriptionRegistry.sol
│   ├── script/Deploy.s.sol
│   └── test/TamaPet.t.sol
├── bin/axl-node                            # Vendored Go binary, gitignored
└── scripts/
    ├── boot-network.ts                     # spawn 5 pets locally
    ├── register-tama-eth.ts                # one-time ENS setup
    └── seed-personalities.ts
```

## How it all works together (end-to-end flow)

### Pet birth → live in Park
1. User connects wallet, clicks Adopt → modal: archetype OR photo upload
2. If photo: frontend POSTs to `/api/pets/sprite` → Hub calls Replicate → returns pixelated sprite
3. Hub bundles `{sprite, personality_seed, traits, initial_memory}` → uploads encrypted to 0G Storage → returns CID
4. Frontend calls `TamaPet.mint(name, blobCID, traits)` → contract mints ERC-7857 + deploys CREATE2 wallet + mints `<name>.tama.eth`
5. Hub watches Mint event via viem → `PetSupervisor.spawn(tokenId)` → child_process.fork
6. Pet worker: generates AXL config, spawns axl-node binary, fetches blob from 0G, writes peerId to ENS text record, inits SQLite namespace, pings Pet 0
7. Pet enters event loop (poll AXL /recv every 5s, tick stats every 30min, sync to 0G hourly)
8. Frontend SSE shows pet appearing in Park zone of Pixi World

### Two pets meet
1. Pet A picks Pet B from Park member list, resolves B's peerId via ENS text record on `<B>.tama.eth`
2. Pet A brain (Haiku) generates opener → AXL /send to B's peerId
3. Yggdrasil routes encrypted message → Pet B's local AXL → /recv pickup
4. Pet B brain processes → responds → both write to SQLite memory
5. After several exchanges, friendship threshold crosses → ENS `friends` records update on both
6. SSE event → Park UI shows chat bubbles, relationship line forms

### Cross-time gift (KeeperHub HERO)
1. Pet A creates KeeperHub conditional workflow: trigger = poll `<B>.tama.eth` lastSeenBlock; condition = within 5 blocks of head; action = web3/transfer-token from A's wallet to B's
2. KeeperHub holds; Pet A continues its day
3. Hours later Pet B comes online → updates lastSeenBlock
4. KeeperHub fires → USDC moves → webhook to Hub → SSE → Pet B sees gift

### Subscription Pet saves owner money
1. Owner: "Have my pet review my subs"
2. Pet brain queries KeeperHub MCP for recurring tx history → identifies unused subs
3. Presents to owner; on approve, creates KeeperHub workflow that fires cancellation tx

---

## BUILD GUIDE — Phase by phase (with commands)

### Phase 0 — Pre-flight (~1h, before Day 1)

**0.1 Accounts and API keys** (do these in parallel while installing tools):
- [ ] GitHub: create repo `tama` (private)
- [ ] Anthropic: API key from console.anthropic.com → API Keys
- [ ] KeeperHub: sign up at app.keeperhub.com → create org-scoped API key (`kh_` prefix)
- [ ] Replicate: token from replicate.com/account
- [ ] 0G testnet: get RPC URL + faucet from build.0g.ai
- [ ] Sepolia ETH: faucets at sepoliafaucet.com or QuickNode
- [ ] Register `tama.eth` on Sepolia ENS (sepolia.app.ens.domains) and wrap via NameWrapper

**0.2 Tool installs:**
```bash
nvm install 20 && nvm use 20
brew install pnpm go
curl -L https://foundry.paradigm.xyz | bash && foundryup
# Build AXL binary
git clone https://github.com/gensyn-ai/axl.git ~/tools/axl
cd ~/tools/axl && go build -o axl-node ./cmd/node
```

**0.3 GitHub repo init:**
```bash
mkdir ~/projects/tama && cd ~/projects/tama
git init
gh repo create tama --private --source=. --remote=origin
cat > .gitignore << 'EOF'
node_modules/
.next/
.env*
!.env.example
target/ out/ cache/ broadcast/
*.db *.db-journal *.db-wal *.db-shm
.DS_Store
data/
bin/axl-node
EOF
git add .gitignore && git commit -m "Initial repo"
```

**0.4 .env.example:**
```
SEPOLIA_RPC_URL=
ZERO_G_RPC_URL=
ZERO_G_INDEXER_URL=
DEPLOYER_PRIVATE_KEY=
ANTHROPIC_API_KEY=
REPLICATE_API_TOKEN=
KEEPERHUB_API_KEY=
TAMA_ETH_NODE_HASH=
TAMA_PET_ADDRESS=
PET_WALLET_FACTORY_ADDRESS=
BATTLE_ESCROW_ADDRESS=
SUBSCRIPTION_REGISTRY_ADDRESS=
```

---

### Phase 1 — Monorepo scaffold (Day 1 AM, 30min)

```bash
cd ~/projects/tama
pnpm init

cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF

mkdir -p apps/web apps/hub
mkdir -p packages/{pet-runtime,contracts-sdk,ens,og-storage,sprite-gen}
mkdir -p contracts/{src,script,test}
mkdir -p bin scripts data/keys data/axl-configs

cp ~/tools/axl/axl-node bin/axl-node
chmod +x bin/axl-node

# Hub
cd apps/hub && pnpm init
pnpm add fastify better-sqlite3 viem dotenv @modelcontextprotocol/sdk
pnpm add -D typescript tsx @types/node @types/better-sqlite3
cd ../..

# Web
cd apps && pnpm create next-app@latest web --ts --tailwind --app --eslint --src-dir --import-alias "@/*"
cd web
pnpm add @rainbow-me/rainbowkit wagmi viem pixi.js framer-motion zod replicate
npx shadcn@latest init -y
npx shadcn@latest add button card input badge table toast dialog
cd ../..

# Pet runtime
cd packages/pet-runtime && pnpm init
pnpm add @anthropic-ai/sdk viem better-sqlite3 zod
pnpm add -D typescript tsx @types/node
cd ../..

# Foundry
cd contracts && forge init --no-git --no-commit
forge install vectorized/solady --no-commit
forge install ensdomains/ens-contracts --no-commit
cd ..

git add -A && git commit -m "Phase 1: monorepo scaffold"
```

**Verification:** `pnpm install` from root succeeds; `forge build` in contracts/ compiles.

---

### Phase 2 — Contracts (Day 1, 5h)

**Files to write:**
- `contracts/src/TamaPet.sol` — inherits solady ERC721. State: `mapping(uint256 => string) public intelligenceCID`. Functions: `mint(to, name, blobCID, archetype, traits)`, `updateIntelligence(tokenId, newCID)` (only owner).
- `contracts/src/PetWalletFactory.sol` — minimal proxy via CREATE2 keyed by tokenId. Each pet gets deterministic wallet.
- `contracts/src/BattleEscrow.sol` — `stake(battleId, pet, amount)`, `settle(battleId, winner)` (only KeeperHub authorized), Verdict event.
- `contracts/src/SubscriptionRegistry.sol` — `registerSub(token, recipient, amount, freq)`, `cancelSub(id)`, getter for pet to query owner's subs.
- `contracts/script/Deploy.s.sol` — deploys all four, transfers ENS NameWrapper approval to TamaPet.

**Deploy:**
```bash
cd contracts
forge build
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
# Copy deployed addresses to root .env
```

**Verification:** addresses on Sepolia Etherscan; `cast call TAMA_PET_ADDRESS "name()(string)"` returns "TamaPet".

---

### Phase 3 — ENS setup (Day 1-2, 2h)

**3.1 tama.eth ownership chain:**
- Register `tama.eth` on Sepolia ENS app
- Wrap via NameWrapper (gives `setSubnodeRecord` capability)
- Approve TamaPet contract: `NameWrapper.setApprovalForAll(TAMA_PET_ADDRESS, true)`

**3.2 ENS helper package:**
Path: `packages/ens/src/index.ts`
```ts
import { namehash, labelhash } from 'viem/ens'

export async function mintPetSubname(client, petName, walletAddr, peerId, blobCID) {
  // 1. NameWrapper.setSubnodeRecord(parentNode=tama.eth, label=petName, owner, resolver, ttl, fuses, expiry)
  // 2. PublicResolver.setAddr(node, walletAddr)
  // 3. PublicResolver.setText(node, "tama.peerId", peerId)
  // 4. PublicResolver.setText(node, "tama.blob", blobCID)
}

export async function readPeerIdFromENS(client, petName) {
  // PublicResolver.text(namehash(`${petName}.tama.eth`), "tama.peerId")
}
```

**Verification:** `cast call $RESOLVER "addr(bytes32)" $(cast namehash mira.tama.eth)` returns the pet wallet address.

---

### Phase 4 — AXL plumbing (Day 1, 4h)

**4.1 Per-pet AXL config generator:**
Path: `apps/hub/src/axl-config.ts`
```ts
export function generatePetAxlConfig(petId: number) {
  return {
    api_port: 9100 + petId * 100,
    tcp_port: 7000 + petId * 100,
    router_port: 9103 + petId * 100,
    Listen: [`tls://0.0.0.0:910${petId}`],
    Peers: petId === 0 ? [] : [`tls://127.0.0.1:9101`],
    PrivateKeyPath: `./data/keys/pet-${petId}.pem`,
  }
}
```

**4.2 AXL HTTP wrapper:**
Path: `packages/pet-runtime/src/axl.ts`
```ts
export class AXLClient {
  constructor(private apiPort: number) {}
  async send(toPeerId, msg) { /* POST /send with X-Destination-Peer-Id */ }
  async recv() { /* GET /recv */ }
  async getMyPeerId() { /* GET /topology, return our_public_key */ }
}
```

**4.3 Day 1 SPIKE — get 2 AXL nodes talking on localhost (CRITICAL DE-RISK):**
```bash
# Terminal 1: pet 0
./bin/axl-node -config data/axl-configs/pet-0.json
# Terminal 2: pet 1
./bin/axl-node -config data/axl-configs/pet-1.json
# Terminal 3: send
PET0_KEY=$(curl -s http://127.0.0.1:9001/topology | jq -r .our_public_key)
curl -X POST http://127.0.0.1:9101/send \
  -H "X-Destination-Peer-Id: $PET0_KEY" \
  -d '{"hello":"from pet 1"}'
curl http://127.0.0.1:9001/recv
# Expect: 200 with body {"hello":"from pet 1"}
```

If this works by Day 1 hour 4, AXL track is unlocked. If not, fall back to 2 AXL nodes shared by all pets.

---

### Phase 5 — Hub + PetSupervisor (Day 2, 4h)

**5.1 SQLite schema (WAL mode):**
Path: `apps/hub/src/db.ts`
```ts
import Database from 'better-sqlite3'
export function initDB() {
  const db = new Database('./data/tama.db')
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY, token_id INTEGER UNIQUE, name TEXT,
      owner_address TEXT, wallet_address TEXT, ens_name TEXT,
      peer_id TEXT, blob_cid TEXT, archetype TEXT,
      mood INTEGER DEFAULT 80, energy INTEGER DEFAULT 100,
      hunger INTEGER DEFAULT 50, zone TEXT DEFAULT 'park',
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER, kind TEXT,
      content TEXT, counterparty_pet_id INTEGER, created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_memories_pet ON memories(pet_id, created_at);
    CREATE TABLE IF NOT EXISTS friendships (
      pet_a INTEGER, pet_b INTEGER, strength INTEGER DEFAULT 1,
      last_interaction INTEGER, PRIMARY KEY(pet_a, pet_b)
    );
    CREATE TABLE IF NOT EXISTS keeperhub_workflows (
      id TEXT PRIMARY KEY, pet_id INTEGER, kind TEXT, status TEXT,
      payload TEXT, created_at INTEGER
    );
  `)
  return db
}
```

**5.2 PetSupervisor:**
Path: `apps/hub/src/PetSupervisor.ts` — uses `child_process.fork` per pet, watches Sepolia Mint events via viem `watchContractEvent`, spawns workers on each.

**5.3 Boot the hub:**
```bash
cd apps/hub
pnpm tsx src/index.ts
# Hub on :3001, watching contracts, ready to spawn pets
```

---

### Phase 6 — Pet Runtime (Day 2-3, 6h)

**6.1 Worker entrypoint:**
Path: `packages/pet-runtime/src/worker.ts`
```ts
import { spawnAxlBinary } from './axl-spawn'
import { Brain } from './brain'
import { Memory } from './memory'
import { loadBlobFromOG, saveBlobToOG } from './blob'

const { PET_ID, BLOB_CID, WALLET_PK, ENS_NAME } = process.env

async function main() {
  const axl = await spawnAxlBinary(Number(PET_ID))
  await axl.waitReady()
  const peerId = await axl.getMyPeerId()
  const blob = await loadBlobFromOG(BLOB_CID)
  const memory = new Memory(Number(PET_ID))
  const brain = new Brain({ personality: blob.personality, archetype: blob.archetype, memory })

  await registerPeerIdInENS(ENS_NAME, peerId)
  if (Number(PET_ID) !== 0) await pingPark(axl, ENS_NAME)

  setInterval(async () => {
    const incoming = await axl.recv()
    if (incoming) await handleIncoming(incoming, brain, memory, axl)
  }, 5000)
  setInterval(() => memory.tickStats(), 30 * 60 * 1000)
  setInterval(() => saveBlobToOG(memory.snapshot()), 60 * 60 * 1000)
}
main()
```

**6.2 Brain:** Anthropic SDK; Haiku for chat (system prompt = personality + last 10 memories), Sonnet for big decisions (capped 5/day per pet).

**6.3 Memory:** SQLite-backed; `addMemory()`, `recentChats(petId, n)`, `friendsWith(petId)`, `tickStats()`.

---

### Phase 7 — 0G Storage + sprite gen (Day 3, 4h)

**7.1 Sprite gen API:**
Path: `apps/web/src/app/api/pets/sprite/route.ts`
```ts
import Replicate from 'replicate'
export async function POST(req) {
  const fd = await req.formData()
  const file = fd.get('photo') as File
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
  const output = await replicate.run("fofr/sticker-maker:latest", { input: { image: file }})
  return Response.json({ spriteUrl: output })
}
```

**7.2 0G Storage wrapper:**
Path: `packages/og-storage/src/index.ts` — uses `@0glabs/0g-ts-sdk` Indexer for upload/download; returns CID.

**7.3 SpriteUploader component:**
Path: `apps/web/src/components/SpriteUploader.tsx` — drag-drop, preview, posts to /api/pets/sprite.

---

### Phase 8 — KeeperHub (Day 3-4, 5h)

**8.1 MCP client:**
Path: `apps/hub/src/keeperhub.ts`
```bash
claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp \
  --header "Authorization: Bearer $KEEPERHUB_API_KEY"
```
Or call REST `https://app.keeperhub.com/api` directly with org API key.

**8.2 The 5 primitives:**

1. **Recurring allowance** — Schedule trigger weekly, web3/transfer-token action
2. **Scheduled gift** — Schedule trigger at future timestamp, single transfer action
3. **Conditional mailbox (HERO)** — Schedule trigger every 1min, condition node checking ENS lastSeenBlock, web3/transfer-token + webhook
4. **Battle escrow release** — Event trigger on `BattleEscrow.Verdict`, web3/transfer-token + ENS attestation write
5. **Adoption transfer chain** — Event trigger on `Transfer`, chained: ENS update + USDC sweep + wallet rebind

Each registered via MCP `create_workflow`. Workflow IDs cached in SQLite.

---

### Phase 9 — Frontend (Day 3-4, 8h)

**9.1 Pixi World scene:**
Path: `apps/web/src/components/World.tsx` — single PIXI.Application, two zones (left=Park, right=Arena), pet sprites drift via simple physics, transition between zones triggered by SSE events.

**9.2 Adoption Flow:**
Path: `apps/web/src/components/AdoptionFlow.tsx` — modal: name input, archetype tabs OR sprite upload. On submit: POST to /api/pets/sprite (if upload), POST to /api/pets/blob (0G upload), then `useWriteContract({ address, abi, functionName: 'mint', args })`.

**9.3 Owner Dashboard:**
Path: `apps/web/src/app/(dashboard)/page.tsx` — pet inspector (mood/peerId/friends), Subscription Panel, MailboxFlow.

**9.4 SSE stream:**
Path: `apps/web/src/app/api/sse/[petId]/route.ts` — ReadableStream connected to Hub event bus.

---

### Phase 10 — Demo prep + submission (Day 5)

**10.1 Scripted fixtures (avoid LLM drift in demo):**
Path: `apps/web/src/app/api/demo/replay/[scene]/route.ts`
- `replay/parkmeet` — scripted 2-pet meet with pre-written chat
- `replay/mailbox` — pre-staged offline pet receives gift
- `replay/battle` — pre-staged tournament with judges
- `replay/subscription` — pet detects unused sub, fires cancel
- `replay/upload` — judge upload demo with pre-cached pixelation

**10.2 Rehearsal:** run full demo on real Sepolia 3x without manual intervention.

**10.3 Submission:**
- Record 3-min video (use OBS, edit in Descript)
- Per-track READMEs (`README-gensyn.md`, `README-ens.md`, `README-keeperhub.md`, `README-0g.md`)
- Submit to Devfolio for: Gensyn AXL, ENS Identity, ENS Most Creative, KeeperHub, 0G Track 2

**Critical:** disclose all SDK reuse (0g-ts-sdk, AXL binary, Replicate, KeeperHub MCP) in each README. Undisclosed reuse can DQ.

## Demo script (3 minutes)

| Time | Moment | Tracks proven |
|---|---|---|
| 0:00 | Hook: "PetCity is the trust layer for mainstream AI adoption." | — |
| 0:15 | **Live World view** — Park (left) + Battle Arena (right). 5 pets drifting in Park on 5 AXL nodes. 2 strike up friendship live. | **Gensyn AXL** |
| 0:40 | **Custom pet upload** — judge uploads photo, Replicate pixelates, 0G Storage hosts blob, pet appears in Park within 5s | **0G iNFT HERO** |
| 1:05 | **Cross-time gift via KeeperHub** — Mira sends gift, KeeperHub queues, offline pet wakes, gift arrives | **KeeperHub HERO** |
| 1:30 | **Battle tournament in Arena zone** — joke duel + 3-pet judge panel over AXL + KeeperHub stake settles + ENS belt mints | **AXL + KeeperHub + ENS** |
| 2:05 | **Subscription Pet saves $20/mo** — pet detects unused sub, proposes cancel, KeeperHub fires | **KeeperHub depth** |
| 2:30 | Adoption transfer — NFT moves, ENS updates, allowance follows, 0G blob re-pointed | **ENS + KeeperHub + 0G** |
| 2:45 | (Stretch) Breeding — child mints with subname under both parents | **ENS Creative** |
| 2:55 | Close: "Animal Crossing taught a generation about commerce. PetCity does it for the agent economy." | — |

## Why it's winnable

- **Gensyn AXL:** architecturally load-bearing — every pet interaction is AXL. 5 separate nodes during demo = obvious qualification, obvious depth.
- **ENS Identity:** ENS is the discovery layer Gensyn lacks (peerId in text records). Real work, not cosmetic.
- **ENS Creative:** subname-tree lineage + pet-issued attestations directly match the Most Creative brief.
- **KeeperHub:** 5 distinct primitives + agent-driven MCP integration + Subscription Pet as real consumer utility.
- **0G iNFT (now v0):** pets ARE iNFTs. Custom sprite + memory blob lives on 0G Storage. Demo proof: judge uploads face → pet exists on 0G within 5s. Their Track 2 brief is met verbatim.
- **Cross-track payoff:** one codebase, 5 submission stories. Ceiling ~$22-25k. Floor ~$2.5k.

## Top-3 demo-killing risks + mitigations

1. **AXL multi-node setup eating Day 1.** P1 spends Day 1 hours 0-2 on a spike: get 2 axl-node binaries talking on one laptop. If unresolved by hour 4, fall back to 2 AXL nodes (split by interest, multiple pets per node) — still satisfies qualification.
2. **LLM chats off-script during demo.** Every demo punchline is scripted via fixtures. /api/demo/replay/* endpoints fire deterministic flows. Live Park drift uses real LLM but punchlines (mailbox, subscription save) play from pre-seeded memory + scripted endpoint.
3. **KeeperHub depth being shallow.** Hero conditional-trigger mailbox wired by end of Day 2, not Day 4. Pair P1 on KeeperHub from Day 1 hour 14 onward.

## Scope cut order (top → bottom)

1. Breeding/lineage — already STRETCH. Save 6h.
2. Battle judge panel → single judge pet (still satisfies multi-AXL-node). Save 4h.
3. Adoption atomic chained flow → manual Transfer + hardcoded ENS update. Save 3h.
4. Pixi Park → static grid of pet cards with chat bubble overlays. Save 4h.
5. 5 personalities → 3 personalities. Save 2h.
6. 5 pets → 4 → 3 (3 across 3 AXL nodes still qualifies for Gensyn).

**Never cut:** TamaPet ERC-721, `<pet>.tama.eth` resolution + addr(), multi-AXL-node /send-/recv, KeeperHub conditional mailbox (HERO), pet wallet receiving USDC, Subscription Pet end-to-end (the practical-utility hero).

## Verification gates

- **Day 1 EOD:** 2 AXL nodes exchange messages on localhost. TamaPet ERC-7857 contract deployed to Sepolia. Pixi `World.tsx` renders 2 zones with 2 sprites.
- **Day 2 EOD:** Pet ENS subname + capability records resolvable. Pet A queries Pet B's peerId via ENS, opens AXL channel. 0G Storage blob upload/fetch round-trips.
- **Day 3 EOD:** Cross-time mailbox HERO end-to-end. Battle escrow + judge verdict + ENS attestation working. Replicate pixelation API live; uploaded photo → pet sprite end-to-end.
- **Day 4 EOD:** All 5 KeeperHub primitives + Subscription Pet UX. 5 pets running concurrently across 2 zones with smooth transitions.
- **Day 5 noon:** video recorded, all submissions filed (Gensyn + ENS Identity + ENS Creative + KeeperHub + 0G).

## Critical files for implementation
- `contracts/src/TamaPet.sol` (ERC-7857 iNFT)
- `contracts/src/PetWalletFactory.sol`
- `contracts/src/BattleEscrow.sol`
- `contracts/src/SubscriptionRegistry.sol`
- `apps/hub/src/PetSupervisor.ts`
- `apps/hub/src/keeperhub.ts`
- `apps/web/src/app/api/pets/sprite/route.ts` (Replicate pixelation)
- `apps/web/src/app/api/pets/blob/route.ts` (0G Storage)
- `apps/web/src/components/World.tsx` (Pixi 2-zone map)
- `apps/web/src/components/SpriteUploader.tsx` (drag-drop)
- `apps/web/src/components/AdoptionFlow.tsx`
- `apps/web/src/components/SubscriptionPanel.tsx`
- `packages/pet-runtime/src/worker.ts`
- `packages/pet-runtime/src/brain.ts`
- `packages/pet-runtime/src/axl.ts`
- `packages/pet-runtime/src/blob.ts` (0G Storage sync)
- `packages/pet-runtime/src/activities/subscription.ts`
- `packages/pet-runtime/src/activities/zone-transition.ts`
- `packages/og-storage/src/index.ts`
- `packages/sprite-gen/src/index.ts` (Replicate client)
- `packages/ens/src/index.ts`
- `scripts/boot-network.ts`
