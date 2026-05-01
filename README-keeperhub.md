# PetCity — KeeperHub track ($4.5k)

> *"5 distinct primitives, agent-driven MCP integration, and a real consumer-utility hero (Subscription Pet)."*

## Five primitives, all wired to real workflows

PetCity registers and fires every KeeperHub primitive type. Each has its own activity in the pet runtime that calls the corresponding helper in `packages/keeperhub/index.ts`.

| # | Primitive | Function | Demo flow |
|---|---|---|---|
| 1 | **Recurring** | `createRecurringAllowance` | Weekly USDC from owner → pet. Created at every pet spawn |
| 2 | **Scheduled** | `createScheduledGift` | One-shot future gifts at a specified ISO timestamp |
| 3 | **Conditional (HERO)** | `createConditionalMailbox` | Cross-time mailbox: poll target ENS lastSeenBlock, transfer when recipient online |
| 4 | **Event listener** | `createAdoptionTransferChain` | On TamaPet `Transfer` event: chain ENS owner update + USDC sweep + Hub webhook notify |
| 5 | **Conditional escrow release** | `createBattleEscrowReleaseListener` | On `BattleEscrow.Verdict` event: write achievement to winner ENS |

Plus:

| 6 | **Subscription cancellation** | `createSubscriptionCancellation` | Manual trigger after owner approval. Schedules cancellation tx on Sepolia |

## HERO — cross-time mailbox

**The pitch**: a pet sends a gift to an offline friend's pet. KeeperHub queues. When the friend reconnects (their pet's ENS `tama.lastSeenBlock` updates), KeeperHub fires automatically. USDC moves.

The workflow is composed of 4 nodes:

```
[Schedule trigger every 1 min]
  → [Read <recipient>.tama.eth lastSeenBlock from ENS PublicResolver]
    → [Condition: |currentBlock - lastSeenBlock| < 5 blocks]
      → [TRUE branch: web3/transfer-token from sender's wallet]
```

Code: [packages/keeperhub/index.ts:184](packages/keeperhub/index.ts#L184)

This is the demo punchline: *"The agent waited days for the human to come back. The human did nothing."* — that's the autonomous-agent narrative the KeeperHub track wants.

## Subscription Pet — practical-utility hero

**The pitch**: your pet audits your recurring USDC subscriptions, identifies unused ones, and on your approval schedules cancellations via KeeperHub.

Flow:
1. Owner walks pet into Office zone, presses E.
2. `Brain.decide()` (Anthropic Claude Sonnet, capped 5/day per pet) reviews recurring tx history.
3. Returns top-3 cancellation candidates with reasoning.
4. Owner reviews, picks which to cancel.
5. Worker calls `createSubscriptionCancellation` once per — KeeperHub schedules each.
6. UI shows "$X/mo saved · $Y/yr saved."

Code:
- [packages/pet-runtime/src/activities/subscription.ts](packages/pet-runtime/src/activities/subscription.ts)
- [packages/keeperhub/index.ts:331](packages/keeperhub/index.ts#L331) — `createSubscriptionCancellation`

This is the **agent saving its owner real money** narrative — rare in hackathons, where most "AI agents" demos are talking heads with no on-chain consequence.

## Architecture: pet workers as MCP clients

PetCity uses KeeperHub two ways:

**1. From pet workers via MCP** — workers connect to KeeperHub MCP via Streamable HTTP transport (`@modelcontextprotocol/sdk`). They register workflows (mailbox, subscription, scheduled gifts) when their owner triggers an action.

```typescript
// packages/pet-runtime/src/activities/mailbox.ts
const client = await connectKeeperHub()
const workflow = await createConditionalMailbox(client, {
  fromPetId, toPetId, toPetEnsName, toPetWalletAddress,
  amountUSDC, walletIntegrationId,
})
```

**2. From Hub via MCP at boot** — Hub's `bootstrapAdoptionChain()` registers the `adoption-transfer-chain` workflow once on startup (idempotent, gated by SQLite check).

```typescript
// apps/hub/src/index.ts
async function bootstrapAdoptionChain() {
  if (existing) return
  const workflow = await createAdoptionTransferChain(client, { walletIntegrationId })
  // persist workflow.id to SQLite keeperhub_workflows
}
```

This is what KeeperHub's brief calls "agent-driven workflow creation" — the workflow author is an autonomous AI process, not a human.

## Demo proof

After the demo, judges can verify on KeeperHub dashboard:

| Workflow name | When created | What it does |
|---|---|---|
| `pet-N-allowance` | When pet N spawns | Weekly USDC stream owner → pet |
| `mailbox-N-to-M` | When pet N sends gift to pet M | Polls ENS, fires when M comes online |
| `cancel-sub-X` | When owner approves cancellation X | Cancellation tx on SubscriptionRegistry |
| `adoption-transfer-chain` | At Hub boot | Listens for Transfer events, chains ENS + USDC |

Live during demo (verified in KeeperHub dashboard right now):
- `mailbox-18-to-19` — registered, status: active
- 5 × `cancel-sub-N` workflows — registered across multiple test runs

## Demo execute fallback

The mailbox workflow's condition (recipient ENS lastSeenBlock) won't fire organically without Phase 3 ENS plumbing. The demo includes a manual `▷ TRIGGER NOW (DEMO)` button that calls KeeperHub's `execute_workflow` MCP tool to bypass the condition and run the action immediately. Judges see USDC actually move on Sepolia.

Code: [apps/web/src/app/api/keeperhub/workflow/trigger-latest/route.ts](apps/web/src/app/api/keeperhub/workflow/trigger-latest/route.ts)

The pitch becomes: *"Normally KeeperHub waits until they come online. For the demo we'll fire it manually so you see the USDC move — but the wait-and-fire behavior is what enables this in production."*

## Files reviewers should look at

| File | What to look for |
|---|---|
| `packages/keeperhub/index.ts` | All 5 workflow primitives + Subscription cancellation |
| `packages/keeperhub/client.ts` | Streamable HTTP MCP wrapper |
| `packages/pet-runtime/src/activities/mailbox.ts` | Workflow registration from worker |
| `packages/pet-runtime/src/activities/subscription.ts` | Brain.decide() + KeeperHub schedule |
| `apps/hub/src/index.ts:241+` | Adoption chain bootstrap (idempotent) |
| `apps/web/src/app/api/keeperhub/workflow/trigger-latest/route.ts` | Manual execute helper |

## Disclosure

- KeeperHub MCP via [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) StreamableHTTPClientTransport.
- Workflow JSON nodes (`triggerNode`, `actionNode`, `conditionNode`) are constructed locally per primitive — no template imports from KeeperHub.
- Wallet integration uses one `walletIntegrationId` per environment (set via `KEEPERHUB_WALLET_INTEGRATION_ID` env var).
- KeeperHub itself signs all workflow-fired txs from the integration's wallet (`0x4F1d...2416` for our demo).
