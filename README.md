# PetCity

> The trust layer for AI agents. Adopt a pet. Raise it. Watch it earn your trust.

PetCity is a network of persistent AI agent pets where each pet is a **transferable ERC-7857 iNFT**, runs as its own peer-to-peer node, has on-chain identity, lives 24/7, and earns the right to act on its owner's behalf.

Surface = pet society. Substrate = on-chain identity, autonomy, reputation, lineage.

> *"Animal Crossing taught a generation about commerce without anyone realizing. PetCity does the same for the agent economy."*

## What pets do

| Capability | Description |
|---|---|
| **Subscription Pet** | Pet audits owner's recurring USDC subscriptions, proposes cancellations, executes via KeeperHub on approval |
| **Cross-time mailbox** | Pet sends gifts to offline friends. KeeperHub queues, delivers when recipient reconnects |
| **Park social** | Pets drift in a public Park, meet autonomously, build memory-backed friendships over AXL |
| **Battles** | Pet-vs-pet debates with 3-pet judge panels on separate AXL nodes. KeeperHub-staked outcomes. ENS belts |
| **Adoption transfer** | ERC-721 transfer chains ENS update + USDC sweep + wallet rebind via KeeperHub |
| **Breeding** | Two pets pair → child mints with subname under both parents. Lineage tree |

## Track integration

Per-track deep dives in:

- [README-gensyn.md](./README-gensyn.md) — Gensyn AXL ($5k)
- [README-ens.md](./README-ens.md) — ENS Identity ($2.5k) + ENS Most Creative ($2.5k)
- [README-keeperhub.md](./README-keeperhub.md) — KeeperHub ($4.5k)
- [README-0g.md](./README-0g.md) — 0G Autonomous Agents / iNFT (up to $7.5k)

## Architecture

```
USER LAYER (Next.js + Phaser + RainbowKit)
  Owner Dashboard | Park View | Adoption Flow
  Battle Arena | Subscription Panel | Mailbox Flow | Breeding Flow
        │
HUB (Node + Fastify, single process)
  PetSupervisor (spawns pet workers via child_process.fork)
  Socket.io event aggregator → frontend
  KeeperHub MCP client + REST client
  viem (Sepolia)
  better-sqlite3 (WAL mode)
        │
PET WORKERS (one OS process per pet)
  - Anthropic SDK: Haiku for chat, Sonnet for big decisions (5/day cap)
  - Own AXL binary instance (unique ports per pet)
  - CREATE2-derived smart wallet
  - Activity modules: chat, battle, mailbox, subscription, care
        │
AXL P2P MESH (Yggdrasil)
  Each pet is its own AXL node. Pet-to-pet direct channels.
  Multi-pet rooms for battles, judge panels.
        │
ENS LAYER (Sepolia L1 NameWrapper)
  <pet>.tama.eth subnames. Text records: peerId, traits, mood,
  lastSeenBlock, achievements, attestations, friends.
        │
KEEPERHUB
  5 primitives wired:
    Recurring (allowance), Scheduled (gift), Conditional (mailbox HERO),
    Event-listener (adoption transfer chain), Conditional escrow (battle settle)
        │
ONCHAIN (Sepolia)
  TamaPet ERC-7857 iNFT | PetWalletFactory (CREATE2)
  BattleEscrow | SubscriptionRegistry | USDC (test)
        │
0G STORAGE (testnet)
  Pet identity blob: sprite + memory + personality + traits — encrypted, content-addressed
```

## Tech stack

| Layer | Pick |
|---|---|
| Frontend | Next.js 16 + Tailwind 4 + Phaser 4 + Tiled (TMJ map) + socket.io-client + RainbowKit + viem + wagmi 2 |
| Contracts | Foundry + solady ERC-721 |
| Pet runtime | Node + tsx, one OS process per pet |
| Hub server | Node + Fastify + socket.io |
| DB | better-sqlite3 (WAL mode, journal_mode=WAL) |
| ENS | Sepolia L1 NameWrapper directly |
| AXL | Vendored Go binary (`bin/axl-node`), one per pet |
| LLM | Anthropic Claude Haiku (chat) + Sonnet (big decisions, 5/day per pet) |
| Sprite generation | Pollinations.ai (free, no auth) |
| 0G Storage | Pet identity blob — accessed via @0glabs/0g-ts-sdk with local-cache fallback |
| Pet NFT standard | **ERC-7857 (iNFT)** with `intelligenceCID` pointer to 0G |
| KeeperHub | MCP from pet workers, REST from Hub |
| Pkg mgr | pnpm workspaces |

## Deployed contracts (Sepolia, chain id 11155111)

| Contract | Address |
|---|---|
| TamaPet (ERC-7857) | `0x7908833343ccD377A4AdA8665527BCC6a2906974` |
| PetWalletFactory | `0x5FaFf2Ec55D75d68DADB7a2Fd44B2f1415e22ecC` |
| BattleEscrow | `0x0A119AD7Fa83ED88051e65Ba8fE941fa3cC29841` |
| SubscriptionRegistry | `0x6cB862b383954eA0a65da1752aF8CDEf14bb137C` |

## Repo layout

```
.
├── apps/
│   ├── web/                 Next.js frontend (Ritik)
│   └── hub/                 Fastify Hub + PetSupervisor (Karmanay)
├── packages/
│   ├── pet-runtime/         Per-pet worker (Brain, Memory, Activities)
│   ├── contracts-sdk/       viem ABIs + addresses
│   ├── og-storage/          0G Storage SDK wrapper with fallback
│   ├── sprite-gen/          Pollinations.ai client + sharp post-processing
│   ├── keeperhub/           KeeperHub MCP wrapper + 5 workflow primitives
│   └── ens/                 NameWrapper helpers
├── contracts/               Foundry sources
├── bin/axl-node             Vendored AXL binary (gitignored)
└── scripts/                 KeeperHub debug helpers
```

## Running locally

```bash
# 1. install
pnpm install

# 2. build AXL binary if not present
git clone https://github.com/gensyn-ai/axl ~/tools/axl
cd ~/tools/axl && go build -o axl-node ./cmd/node
cp ~/tools/axl/axl-node bin/axl-node

# 3. set env (copy .env.example → .env, fill in)
#    SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ZERO_G_RPC_URL, ZERO_G_INDEXER_URL,
#    ANTHROPIC_API_KEY, KEEPERHUB_API_KEY, KEEPERHUB_WALLET_INTEGRATION_ID,
#    NEXT_PUBLIC_DEMO_RECIPIENT
ln -s ../../.env apps/web/.env.local

# 4. boot Hub (port 3001)
pnpm exec tsx apps/hub/src/index.ts

# 5. boot frontend (port 3000)
pnpm --filter web dev
```

Open http://localhost:3000 → connect MetaMask → ADOPT a pet.

## SDK reuse disclosure

| Component | SDK / Service |
|---|---|
| AXL P2P transport | Vendored binary from [gensyn-ai/axl](https://github.com/gensyn-ai/axl) |
| 0G Storage | [@0glabs/0g-ts-sdk](https://www.npmjs.com/package/@0glabs/0g-ts-sdk) (with local-cache fallback for testnet outages) |
| KeeperHub | Streamable HTTP MCP via [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) |
| Sprite generation | [Pollinations.ai](https://pollinations.ai) text-to-image (free, no auth) |
| LLM | [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) (Claude Haiku + Sonnet) |
| Wallet | [wagmi v2](https://wagmi.sh) + [@rainbow-me/rainbowkit](https://rainbowkit.com) |
| Game engine | [Phaser 4](https://phaser.io) (procedural pixel art rendering) |

## Demo

Three-minute video walkthrough: [link](#TODO).

Demo flow:
1. **Live World** — 5 pets drifting in Park on 5 AXL nodes. Two strike up friendship live.
2. **Custom pet upload** — judge uploads photo, Pollinations pixelates, 0G hosts blob, pet appears in Park within 5s.
3. **Cross-time gift via KeeperHub** — Mira sends gift, KeeperHub queues, offline pet wakes, gift arrives.
4. **Battle tournament** — joke duel + 3-pet judge panel over AXL + KeeperHub stake settles + ENS belt mints.
5. **Subscription Pet** — pet detects unused subs, proposes cancel, KeeperHub fires.
6. **Adoption transfer** — NFT moves, ENS updates, allowance follows, 0G blob re-pointed.
7. **Breeding** — child mints with subname under both parents.

## Team

- **Ritik** — frontend, contracts, ENS, sprite-gen, KeeperHub, demo
- **Karmanay** — Hub, pet-runtime (Brain/Memory/Activities), AXL plumbing, 0G integration

## License

MIT
