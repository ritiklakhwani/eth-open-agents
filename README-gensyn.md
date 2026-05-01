# PetCity — Gensyn AXL track ($5k)

> *"Every pet interaction is AXL. 5 separate nodes during demo. AXL is architecturally load-bearing, not cosmetic."*

## Qualification

PetCity demonstrates **communication across multiple separate AXL nodes**, the explicit Gensyn AXL track requirement. Each pet runs its own AXL binary instance with unique ports — pet-to-pet messages flow exclusively over `/send` and `/recv` HTTP endpoints into the gVisor virtual stack.

## How AXL is used

### One pet = one AXL node

Each pet worker (`packages/pet-runtime/src/worker.ts`) spawns its own AXL binary as a managed child process:

```typescript
const axlProc = spawn(binaryPath, ['-config', configPath], { ... })
```

Per-pet config (`apps/hub/src/axl-config.ts`):
- `api_port: 9001 + petId * 100` — HTTP API for /send /recv /topology
- `tcp_port: 7000` — fixed inside each pet's isolated gVisor namespace
- `PrivateKeyPath: data/keys/pet-N.pem` — ed25519 keypair per pet
- Pet 0 listens on `tcp://0.0.0.0:8001` as bootstrap rendezvous

### Pet-to-pet message flow

Worker uses the AXL HTTP wrapper (`packages/pet-runtime/src/axl.ts`):

```typescript
await axl.send(otherPetPeerId, { type: 'chat', text: 'hello', fromPetId: 1 })
const incoming = await axl.recv()  // polled every 5s
```

Every pet interaction in PetCity rides this:

| Interaction | Message type |
|---|---|
| Park social chat | `chat` |
| Battle invite + accept | `battle-invite`, `battle-accept` |
| Battle debate exchange | `battle-debate` (rounds 1-2) |
| Battle judge transcript | `battle-judge` (sent to 3 separate AXL nodes) |
| Battle judge votes | `battle-vote` (collected from 3 separate AXL nodes) |
| Cross-time gift delivery | `gift` |

### Battle = 5 AXL nodes deliberating

The battle activity (`packages/pet-runtime/src/activities/battle.ts`) is the showcase: a single battle involves 5 separate AXL processes communicating in real time:

1. Pet A (sender) and Pet B (opponent) — debate exchange over AXL
2. 3 unaffiliated pets selected as judges, each on their own AXL node — receive transcript and vote independently
3. Pet A tallies votes, calls `BattleEscrow.settle()` on Sepolia

Code path:
```typescript
// activities/battle.ts:246
for (const j of judges) {
  await axl.send(j.peerId, { type: 'battle-judge', battleId, transcript, ... })
}
const votes = await collectVotes(battleId, judges.length, 30_000)  // wait for 3 separate AXL nodes
```

This explicitly demonstrates "communication across multiple AXL nodes" with non-trivial coordination.

### ENS as discovery

Gensyn's design has no built-in peer discovery beyond the bootstrap. PetCity fills that gap with ENS:

- Pet's AXL ed25519 pubkey → `<pet>.tama.eth` text record `tama.peerId`
- Discovery: `Resolver.text(<otherpet>.tama.eth, 'tama.peerId')` → use that peerId in `axl.send()`

This is a real architectural contribution back to the AXL ecosystem.

## Files reviewers should look at

| File | What to look for |
|---|---|
| `apps/hub/src/axl-config.ts` | Per-pet AXL config generator |
| `apps/hub/src/PetSupervisor.ts` | child_process.fork per pet, env-pinned cwd |
| `packages/pet-runtime/src/worker.ts` | AXL binary spawn, recv loop, peerId registration |
| `packages/pet-runtime/src/axl.ts` | Thin HTTP wrapper around /send /recv /topology |
| `packages/pet-runtime/src/activities/battle.ts` | 5-node battle coordination |
| `bin/axl-node` | Vendored Go binary (built from gensyn-ai/axl) |

## Demo proof

During the live demo:

1. **5 pets drifting in Park, each on its own AXL node** — visible via `curl http://127.0.0.1:9001/topology` for each pet (api_ports: 9001, 9101, 9201, 9301, 9401).
2. **Two strike up friendship** — Hub log shows `[Pet 1] chat with pet 2: ...` followed by `[Pet 2] chat with pet 1: ...` — round-trip over AXL.
3. **Battle tournament** — judge votes arrive from 3 distinct AXL nodes within ~30 seconds; Hub log shows three `battle-vote` events with different `judgePetId` values.

## Disclosure

- AXL binary is vendored from [gensyn-ai/axl](https://github.com/gensyn-ai/axl), built locally via `go build -o axl-node ./cmd/node`. Not modified.
- We do not redistribute AXL source. Repo includes only the compiled binary in `bin/`.
