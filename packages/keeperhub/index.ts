// keeperhub — workflow SDK exposing the 5 KeeperHub primitives PetCity needs.
// Owner: Ritik. Phase 8.
//
// All workflows are created via KeeperHub MCP server (REST is read-only).
// Karmanay's Hub imports these helpers and calls them when minting pets,
// settling battles, etc.
//
// The 5 primitives (each maps to a distinct KeeperHub workflow pattern):
//   1. Recurring  — Schedule trigger (cron) → web3/transfer-token
//   2. Scheduled  — Schedule trigger (one-shot) → transfer
//   3. Conditional (HERO) — Schedule poll + Condition on ENS lastSeenBlock + transfer
//   4. Event-listener — web3 Event trigger on BattleEscrow.Verdict → release
//   5. Chained — Event trigger on Transfer → ENS update + USDC sweep
//
// Plus Subscription Pet workflow generator.

import { connectKeeperHub, type KeeperHubClient } from './client.js'
import { namehash } from 'viem/ens'

const SEPOLIA_CHAIN_ID = '11155111'

// ── Sepolia constants (mirrors contracts-sdk ADDRESSES_SEPOLIA) ──────────────
const ADDRESSES = {
  TamaPet: '0x7908833343ccD377A4AdA8665527BCC6a2906974',
  PetWalletFactory: '0x5FaFf2Ec55D75d68DADB7a2Fd44B2f1415e22ecC',
  BattleEscrow: '0x0A119AD7Fa83ED88051e65Ba8fE941fa3cC29841',
  SubscriptionRegistry: '0x6cB862b383954eA0a65da1752aF8CDEf14bb137C',
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  ENSPublicResolver: '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
} as const

function publicHubBaseUrl(): string | undefined {
  const raw = process.env.HUB_BASE_URL?.trim().replace(/\/$/, '')
  if (!raw) return undefined

  try {
    const { hostname } = new URL(raw)
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)) return undefined
    return raw
  } catch {
    return undefined
  }
}

// ── Result type for created workflows ───────────────────────────────────────
export interface CreatedWorkflow {
  id: string
  slug?: string
  name: string
}

// ── Internal: small helpers to build node JSON ──────────────────────────────

function triggerNode(triggerType: 'Manual' | 'Schedule' | 'Webhook' | 'Event', config: Record<string, unknown>) {
  return {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: {
      type: 'trigger',
      label: triggerType,
      config: { triggerType, ...config },
      status: 'idle',
    },
  }
}

function actionNode(id: string, x: number, actionType: string, config: Record<string, unknown>, label?: string) {
  return {
    id,
    type: 'action',
    position: { x, y: 0 },
    data: {
      type: 'action',
      label: label ?? actionType,
      config: { actionType, ...config },
      status: 'idle',
    },
  }
}

function conditionNode(id: string, x: number, expression: string, label?: string) {
  // KeeperHub treats Condition as a special action node, not a separate node
  // type. Top-level type is `action`, the condition lives under
  // `config.actionType = "Condition"` with the expression in `config.condition`.
  return {
    id,
    type: 'action',
    position: { x, y: 0 },
    data: {
      type: 'action',
      label: label ?? 'Condition',
      config: { actionType: 'Condition', condition: expression },
      status: 'idle',
    },
  }
}

function edge(source: string, target: string, sourceHandle?: string) {
  const e: Record<string, unknown> = { id: `${source}->${target}`, source, target }
  if (sourceHandle) e.sourceHandle = sourceHandle
  return e
}

// ── Primitive 1: Recurring allowance ────────────────────────────────────────
//
// Owner sends X USDC to pet weekly via cron-scheduled web3/transfer-token.
//
// The owner must have approved KeeperHub (or its wallet integration) to spend USDC.
// For the demo we use the deployer's pre-approved wallet integration.

export interface RecurringAllowanceArgs {
  petId: number
  petWalletAddress: `0x${string}`
  amountUSDC: string         // e.g. "5" for 5 USDC
  cron?: string              // default: weekly Sunday 00:00 UTC
  walletIntegrationId: string
}

export async function createRecurringAllowance(
  client: KeeperHubClient,
  args: RecurringAllowanceArgs,
): Promise<CreatedWorkflow> {
  const cron = args.cron ?? '0 0 * * 0'
  const trigger = triggerNode('Schedule', { cron, timezone: 'UTC' })
  const transfer = actionNode('transfer-1', 200, 'web3/transfer-token', {
    network: SEPOLIA_CHAIN_ID,
    walletId: args.walletIntegrationId,
    tokenAddress: ADDRESSES.USDC,
    toAddress: args.petWalletAddress,
    amount: args.amountUSDC,
    decimals: 6,
  }, `Allowance to pet ${args.petId}`)

  const result = await client.callTool('create_workflow', {
    name: `pet-${args.petId}-allowance`,
    description: `Weekly USDC allowance for pet ${args.petId}`,
    nodes: [trigger, transfer],
    edges: [edge('trigger-1', 'transfer-1')],
  })
  return result as CreatedWorkflow
}

// ── Primitive 2: One-shot scheduled gift ────────────────────────────────────

export interface ScheduledGiftArgs {
  fromPetId: number
  toPetWalletAddress: `0x${string}`
  amountUSDC: string
  fireAtIso: string          // ISO timestamp
  walletIntegrationId: string
}

export async function createScheduledGift(
  client: KeeperHubClient,
  args: ScheduledGiftArgs,
): Promise<CreatedWorkflow> {
  // Schedule trigger fires once at fireAtIso (use cron with explicit date+time)
  const date = new Date(args.fireAtIso)
  if (isNaN(date.getTime())) throw new Error(`Invalid fireAtIso: ${args.fireAtIso}`)
  const cron = `${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`

  const trigger = triggerNode('Schedule', { cron, timezone: 'UTC', oneShot: true })
  const transfer = actionNode('transfer-1', 200, 'web3/transfer-token', {
    network: SEPOLIA_CHAIN_ID,
    walletId: args.walletIntegrationId,
    tokenAddress: ADDRESSES.USDC,
    toAddress: args.toPetWalletAddress,
    amount: args.amountUSDC,
    decimals: 6,
  }, `Gift transfer`)

  const result = await client.callTool('create_workflow', {
    name: `gift-${args.fromPetId}-${date.getTime()}`,
    description: `Scheduled gift from pet ${args.fromPetId}`,
    nodes: [trigger, transfer],
    edges: [edge('trigger-1', 'transfer-1')],
  })
  return result as CreatedWorkflow
}

// ── Primitive 3: Conditional mailbox (HERO) ─────────────────────────────────
//
// The killer demo: pet A wants to send a gift to pet B who is offline.
// We poll pet B's ENS text record `tama.lastSeenBlock` every minute. When it's
// recent (within the freshness window), fire the transfer.
//
// Pet B's worker writes lastSeenBlock on every event-loop tick (see ens.heartbeatLastSeen).

export interface ConditionalMailboxArgs {
  fromPetId: number
  toPetId: number
  toPetEnsName: string         // e.g. "mira.tama.eth"
  toPetWalletAddress: `0x${string}`
  amountUSDC: string
  walletIntegrationId: string
  pollCron?: string            // default: every minute
  freshBlockWindow?: number    // default: 30 blocks = several minutes on Sepolia
}

export async function createConditionalMailbox(
  client: KeeperHubClient,
  args: ConditionalMailboxArgs,
): Promise<CreatedWorkflow> {
  const window = args.freshBlockWindow ?? 30

  const hubBaseUrl = publicHubBaseUrl()
  const trigger = triggerNode('Manual', {})

  // Read pet B's tama.lastSeenBlock text record from ENS PublicResolver.
  // KeeperHub schema notes:
  //   - field is `abiFunction` (not `functionName`)
  //   - field is `functionArgs` and takes a JSON-array STRING (not a real array)
  //   - we pre-compute the namehash because KeeperHub does NOT resolve
  //     `{{namehash:...}}` template directives.
  const recipientNode = namehash(args.toPetEnsName)
  // Label deliberately has NO periods — KeeperHub's template parser splits on
  // the first `.` in the label, so `Read begger.tama.eth …` would corrupt the
  // field reference and the condition would fail.
  const readLabel = `Read recipient lastSeenBlock`
  const readBlock = actionNode('read-1', 150, 'web3/read-contract', {
    network: SEPOLIA_CHAIN_ID,
    contractAddress: ADDRESSES.ENSPublicResolver,
    abi: '[{"type":"function","name":"text","stateMutability":"view","inputs":[{"name":"node","type":"bytes32"},{"name":"key","type":"string"}],"outputs":[{"name":"","type":"string"}]}]',
    abiFunction: 'text',
    functionArgs: JSON.stringify([recipientNode, 'tama.lastSeenBlock']),
  }, readLabel)

  // Condition references the read node's output. KeeperHub template syntax
  // is `{{@nodeId:Label.fieldName}}` — parser splits at the LAST `.` to get
  // the field. Read action's stringified-uint result is on `.result`.
  // Guard: result is a valid block number (> 0). The freshness-window guard
  // lives in the Hub auto-delivery code (we already write the heartbeat
  // immediately before firing execute_workflow), so block > 0 is enough here.
  const cond = conditionNode('cond-1', 350,
    `Number({{@read-1:${readLabel}.result}}) > 0`,
    `Recipient online?`,
  )

  // Transfer USDC. KeeperHub schema:
  //   - field is `recipientAddress` (not `toAddress`)
  //   - field is `tokenConfig` and takes the token address as a string
  //   - decimals are auto-detected, no manual field needed
  //   - walletId is NOT a top-level field; KeeperHub uses the org's
  //     default web3 wallet integration. If multiple wallets exist, the
  //     workflow gets pinned to the integration's id at create time via
  //     a separate field name we don't yet need to set explicitly.
  const transfer = actionNode('transfer-1', 550, 'web3/transfer-token', {
    network: SEPOLIA_CHAIN_ID,
    tokenConfig: ADDRESSES.USDC,
    recipientAddress: args.toPetWalletAddress,
    amount: args.amountUSDC,
    walletIntegrationId: args.walletIntegrationId,
  }, 'Deliver gift')

  const notifyHub = hubBaseUrl
    ? actionNode('webhook-1', 750, 'webhook', {
        url: `${hubBaseUrl}/api/keeperhub/mailbox/delivered`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowName: `mailbox-${args.fromPetId}-to-${args.toPetId}`,
          fromPetId: args.fromPetId,
          toPetId: args.toPetId,
          amountUSDC: args.amountUSDC,
        }),
      }, 'Mark gift delivered')
    : null

  const nodes = notifyHub
    ? [trigger, readBlock, cond, transfer, notifyHub]
    : [trigger, readBlock, cond, transfer]
  const edges = [
    edge('trigger-1', 'read-1'),
    edge('read-1', 'cond-1'),
    edge('cond-1', 'transfer-1', 'true'),
    ...(notifyHub ? [edge('transfer-1', 'webhook-1')] : []),
  ]

  const result = await client.callTool('create_workflow', {
    name: `mailbox-${args.fromPetId}-to-${args.toPetId}`,
    description: `HERO: Hub auto-executes this gift when ${args.toPetEnsName} comes online`,
    nodes,
    edges,
  })
  return result as CreatedWorkflow
}

// ── Primitive 4: Battle escrow release (event-listener) ─────────────────────
//
// Watches BattleEscrow.Verdict event. On emit, releases stakes to winner.
// (BattleEscrow contract already does the release on-chain via settle();
// this workflow primarily exists to write an ENS achievement record afterward.)

export interface BattleEscrowReleaseArgs {
  walletIntegrationId: string
}

export async function createBattleEscrowReleaseListener(
  client: KeeperHubClient,
  args: BattleEscrowReleaseArgs,
): Promise<CreatedWorkflow> {
  const trigger = triggerNode('Event', {
    network: SEPOLIA_CHAIN_ID,
    contractAddress: ADDRESSES.BattleEscrow,
    eventSignature: 'Verdict(bytes32,address,uint256)',
  })

  // Write ENS achievement record on the winner's pet ENS profile
  // (winner is event arg index 1)
  const writeAchievement = actionNode('ens-write-1', 200, 'web3/write-contract', {
    network: SEPOLIA_CHAIN_ID,
    contractAddress: ADDRESSES.ENSPublicResolver,
    walletId: args.walletIntegrationId,
    abi: '[{"type":"function","name":"setText","stateMutability":"nonpayable","inputs":[{"name":"node","type":"bytes32"},{"name":"key","type":"string"},{"name":"value","type":"string"}],"outputs":[]}]',
    functionName: 'setText',
    args: ['{{trigger.winner_pet_ens_node}}', 'tama.achievements', 'battle-winner-{{trigger.battleId}}'],
  }, 'Write achievement to winner ENS')

  const result = await client.callTool('create_workflow', {
    name: 'battle-verdict-listener',
    description: 'On BattleEscrow.Verdict, write achievement to winner ENS',
    nodes: [trigger, writeAchievement],
    edges: [edge('trigger-1', 'ens-write-1')],
  })
  return result as CreatedWorkflow
}

// ── Primitive 5: Adoption transfer chain (chained) ──────────────────────────
//
// On TamaPet Transfer event, fire chained workflow:
//  1. Update ENS addr() to new owner's wallet
//  2. Sweep USDC from old owner's allowance schedule (off-chain)
//
// For hackathon scope we just demonstrate the chained trigger pattern.

export interface AdoptionTransferChainArgs {
  walletIntegrationId: string
}

export async function createAdoptionTransferChain(
  client: KeeperHubClient,
  args: AdoptionTransferChainArgs,
): Promise<CreatedWorkflow> {
  const trigger = triggerNode('Event', {
    network: SEPOLIA_CHAIN_ID,
    contractAddress: ADDRESSES.TamaPet,
    eventSignature: 'Transfer(address,address,uint256)',
  })

  // Step 1: Update ENS addr() of <petName>.tama.eth to point at the new owner's pet wallet
  const updateENS = actionNode('ens-update-1', 200, 'web3/write-contract', {
    network: SEPOLIA_CHAIN_ID,
    contractAddress: ADDRESSES.ENSPublicResolver,
    walletId: args.walletIntegrationId,
    abi: '[{"type":"function","name":"setAddr","stateMutability":"nonpayable","inputs":[{"name":"node","type":"bytes32"},{"name":"addr","type":"address"}],"outputs":[]}]',
    functionName: 'setAddr',
    args: ['{{trigger.pet_ens_node}}', '{{trigger.to}}'],
  }, 'Update ENS owner')

  // Step 2: Webhook back to Hub to log the adoption + reset pet's local memory ownership
  const notifyHub = actionNode('webhook-1', 400, 'webhook', {
    url: '{{env.HUB_BASE_URL}}/api/adoption-transfer',
    method: 'POST',
    body: '{"tokenId": "{{trigger.tokenId}}", "from": "{{trigger.from}}", "to": "{{trigger.to}}"}',
  }, 'Notify Hub')

  const result = await client.callTool('create_workflow', {
    name: 'adoption-transfer-chain',
    description: 'On Transfer, chain ENS update + Hub notify',
    nodes: [trigger, updateENS, notifyHub],
    edges: [edge('trigger-1', 'ens-update-1'), edge('ens-update-1', 'webhook-1')],
  })
  return result as CreatedWorkflow
}

// ── Subscription Pet workflow generator ─────────────────────────────────────
//
// Subscription Pet analyzes owner's recurring tx history (from SubscriptionRegistry),
// proposes cancellations, and creates the cancel workflow on owner approval.

export interface CreateSubscriptionCancellationArgs {
  ownerAddress: `0x${string}`
  subscriptionId: number
  walletIntegrationId: string
}

export async function createSubscriptionCancellation(
  client: KeeperHubClient,
  args: CreateSubscriptionCancellationArgs,
): Promise<CreatedWorkflow> {
  // Manual trigger (called by Hub once owner approves)
  const trigger = triggerNode('Manual', {})

  const cancel = actionNode('cancel-1', 200, 'web3/write-contract', {
    network: SEPOLIA_CHAIN_ID,
    contractAddress: ADDRESSES.SubscriptionRegistry,
    walletId: args.walletIntegrationId,
    abi: '[{"type":"function","name":"cancelSub","stateMutability":"nonpayable","inputs":[{"name":"id","type":"uint256"}],"outputs":[]}]',
    functionName: 'cancelSub',
    args: [String(args.subscriptionId)],
  }, `Cancel subscription #${args.subscriptionId}`)

  const result = await client.callTool('create_workflow', {
    name: `cancel-sub-${args.subscriptionId}`,
    description: `Cancel subscription ${args.subscriptionId} for ${args.ownerAddress.slice(0, 10)}`,
    nodes: [trigger, cancel],
    edges: [edge('trigger-1', 'cancel-1')],
  })
  return result as CreatedWorkflow
}

// ── Re-export the client ────────────────────────────────────────────────────
export { connectKeeperHub } from './client.js'
export type { KeeperHubClient } from './client.js'
