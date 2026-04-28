# Karmanay — Onboarding

Welcome. You are building the pet backend lifecycle for **PetCity** (codebase: `eth-open-agents`).

## Your role

Pet backend infrastructure. Phases 4-7a in `BUILD.md`. ~24h total over 5 days. You own the pet's invisible "life support system": AXL networking → Hub spawning → worker running → 0G storing.

## Folders YOU own (full ownership)

- `apps/hub/**` — Fastify supervisor, multiplayer socket.io server, SQLite DB
- `packages/pet-runtime/**` — per-pet worker, Brain (LLM), Memory, AXL wrapper
- `packages/og-storage/**` — 0G Storage SDK wrapper
- `apps/web/src/app/api/sse/**` — SSE pet event stream from Hub

## Folders you MUST NOT touch

- `contracts/`, `packages/ens/`, `packages/sprite-gen/`, `packages/keeperhub/`, `packages/contracts-sdk/`
- `apps/web/src/components/`, `apps/web/public/`, anything else under `apps/web/`
- `scripts/`, root config files (`.env`, `pnpm-workspace.yaml`, `tsconfig.base.json`)
- `packages/shared-types/` — read-only (import from it; Ritik writes)

If something forces you to touch a Ritik-owned file, open a GitHub issue or ping in Discord — don't push edits across the boundary.

## Day 1 setup (first 90 min)

### 1. Install tools

```bash
nvm install 20 && nvm use 20            # or Node 22+
brew install pnpm
brew install go@1.25                     # critical: AXL needs 1.25, NOT 1.26
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

### 2. Build the AXL binary

```bash
git clone https://github.com/gensyn-ai/axl.git ~/tools/axl
cd ~/tools/axl
/opt/homebrew/opt/go@1.25/bin/go build -o axl-node ./cmd/node
ls -la axl-node    # verify ~16 MB binary exists
```

### 3. Get your Anthropic API key

- console.anthropic.com → API Keys → Create
- That's the only key you need to start. Other keys (Sepolia, KeeperHub, 0G) come later when you start touching those integrations.

### 4. Clone repo

```bash
git clone https://github.com/ritiklakhwani/eth-open-agents.git
cd eth-open-agents
pnpm install                             # from root, installs all workspaces

# Place AXL binary
cp ~/tools/axl/axl-node bin/axl-node
chmod +x bin/axl-node

# Copy env template, fill in just ANTHROPIC_API_KEY for now
cp .env.example .env
# Edit .env, set ANTHROPIC_API_KEY=...
```

### 5. Verify everything builds

```bash
pnpm install                             # from root
cd contracts && forge build && cd ..     # should compile (Ritik's contracts)
```

## Your first task — Phase 4: AXL plumbing (4h, CRITICAL)

This is the de-risking moment for the entire project. By end of Day 1, two AXL nodes must be exchanging messages on localhost.

```bash
git checkout -b karman/axl
```

Build:

1. **`apps/hub/src/axl-config.ts`** — generates a per-pet AXL config (unique ports per pet ID). Spec in `readme_files/BUILD.md` Phase 4.1.

2. **`packages/pet-runtime/src/axl.ts`** — HTTP wrapper class with `send()`, `recv()`, `getMyPeerId()`. Spec in `readme_files/BUILD.md` Phase 4.2.

3. **The CRITICAL spike — verify 2 nodes talk:**

```bash
# Generate two configs and keys
mkdir -p data/keys data/axl-configs
pnpm tsx -e "
import { generatePetAxlConfig } from './apps/hub/src/axl-config'
generatePetAxlConfig(0)
generatePetAxlConfig(1)
"
./bin/axl-node -genkey > data/keys/pet-0.pem
./bin/axl-node -genkey > data/keys/pet-1.pem

# Terminal 1: pet 0 (bootstrap)
./bin/axl-node -config data/axl-configs/pet-0.json

# Terminal 2: pet 1
./bin/axl-node -config data/axl-configs/pet-1.json

# Terminal 3: get pet 0 peer-id, send message from pet 1
PET0_KEY=$(curl -s http://127.0.0.1:9001/topology | jq -r .our_public_key)
curl -X POST http://127.0.0.1:9101/send \
  -H "X-Destination-Peer-Id: $PET0_KEY" \
  -H "Content-Type: application/json" \
  -d '{"hello":"from pet 1"}'
curl http://127.0.0.1:9001/recv
# Expected: 200 with body {"hello":"from pet 1"}
```

If this works by end of Day 1: project is unlocked. Open PR `karman/axl` → main.

If it fails by Day 1 hour 4: ping Ritik immediately. Fall back to 2 shared AXL nodes (multiple pets per node — still satisfies "communication across separate AXL nodes" rule).

## After Phase 4 — what's next

- Phase 5: Hub + PetSupervisor (8h)
- Phase 6: Pet Runtime worker (8h)
- Phase 7a: 0G Storage SDK wrapper (4h)
- Phase 10 partial: bug fixes + demo support (4h)

Full details in `readme_files/BUILD.md`.

## Branch convention

```
karman/axl              # Phase 4
karman/hub              # Phase 5
karman/runtime          # Phase 6
karman/og-storage       # Phase 7a
```

Open PR to `main` per phase. Ritik reviews (10 min review).

## Daily sync

- **15-min morning standup** with Ritik (Discord) — yesterday/today/blockers
- **15-min EOD sync** — demo what works, push branches, merge to main
- **Anything blocking the other → ping immediately**

## How you and Ritik integrate

You expose:
- Socket.io on `localhost:3001` with events `positions`, `chat`, `zoneEnter`, `zoneExit`, `petJoined`, `petLeft`
- REST: `GET /api/pets`, `GET /api/pets/:id`, `GET /api/sse/:petId`

You import from Ritik's packages:
- `@/packages/keeperhub` — `createMailboxWorkflow()`, `createBattleEscrowRelease()`, `createRecurringAllowance()`, etc.
- `@/packages/contracts-sdk` — viem ABIs for watching Mint events
- `@/packages/ens` — `readPeerIdFromENS()`, `mintPetSubname()`
- `@/packages/shared-types` — TypeScript interfaces (Pet, SocketEvents, MemoryEntry, etc.)

These packages may not exist yet on Day 1 — Ritik builds them during his Phases 2/3/8. Use TypeScript interfaces from `shared-types/` to write your code against the eventual API; Ritik's implementation will land on `main` as he ships phases.

## Reference docs (all in `readme_files/`)

- `readme_files/BUILD.md` — phase-by-phase build guide (the bible — read your phases)
- `readme_files/plan.md` — overall plan with architecture, risk analysis
- `readme_files/plan-explained.md` — judging-impact analysis per track
- `readme_files/work_division.md` — your folder ownership + Ritik's
- `readme_files/petCity_integrastions.md` — sponsor track integration map
- `readme_files/gensyn.md` — AXL technical reference for Phase 4
- `readme_files/keeperhub.md` — KeeperHub MCP/API reference (Hub will call this via Ritik's package)
- `readme_files/eth_open_agents_context.md` — hackathon track briefs
