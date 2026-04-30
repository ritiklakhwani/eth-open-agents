import { EventEmitter } from 'events'
import { createWalletClient, http, keccak256, toBytes } from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { BattleEscrowABI, ADDRESSES_SEPOLIA } from 'contracts-sdk'
import type { AXLClient } from '../axl.js'
import type { Brain } from '../brain.js'
import type { Memory } from '../memory.js'

// ── Shared bus ────────────────────────────────────────────────────────────────
// worker.ts routes incoming battle-* AXL messages here so runBattle() can await them.
export const battleBus = new EventEmitter()
battleBus.setMaxListeners(50)

// Tracks battles where THIS pet is the active driver (sent the invite).
// Used in worker.ts to decide whether to route or handle a battle message.
export const activeBattleIds = new Set<string>()

// ── Helpers ───────────────────────────────────────────────────────────────────

function waitFor<T>(battleId: string, event: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      battleBus.removeAllListeners(`${battleId}:${event}`)
      reject(new Error(`[Battle] Timeout on ${event} for ${battleId}`))
    }, timeoutMs)
    battleBus.once(`${battleId}:${event}`, (msg: T) => {
      clearTimeout(timer)
      resolve(msg)
    })
  })
}

function collectVotes(battleId: string, count: number, timeoutMs: number): Promise<number[]> {
  return new Promise((resolve) => {
    const votes: number[] = []
    const timer = setTimeout(() => {
      battleBus.off(`${battleId}:battle-vote`, handler)
      resolve(votes)
    }, timeoutMs)
    const handler = (msg: { vote: number }) => {
      votes.push(msg.vote)
      if (votes.length >= count) {
        clearTimeout(timer)
        battleBus.off(`${battleId}:battle-vote`, handler)
        resolve(votes)
      }
    }
    battleBus.on(`${battleId}:battle-vote`, handler)
  })
}

// ── Active participant ─────────────────────────────────────────────────────────

export interface BattleStartArgs {
  battleId:    string
  myPetId:     number
  myWallet:    `0x${string}`
  withPetId:   number
  withPeerId:  string
  withName:    string
  withWallet:  `0x${string}`
  stakeAmount: string   // human-readable USDC, e.g. "5"
  judges:      Array<{ petId: number; peerId: string }>
}

export async function runBattle(
  axl:    AXLClient,
  brain:  Brain,
  memory: Memory,
  args:   BattleStartArgs,
): Promise<{ winner: number; text: string }> {
  const { battleId, myPetId, myWallet, withPeerId, withPetId, withName, withWallet, stakeAmount, judges } = args
  activeBattleIds.add(battleId)

  const rpc        = process.env.SEPOLIA_RPC_URL
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined
  const battleIdBytes = keccak256(toBytes(battleId))

  try {
    // ── 1. Invite + wait for acceptance ────────────────────────────────────────
    await axl.send(withPeerId, { type: 'battle-invite', battleId, fromPetId: myPetId, stakeAmount })
    await waitFor(battleId, 'battle-accept', 15_000)

    // ── 2. Register battle on-chain (best-effort) ────────────────────────────
    if (rpc && privateKey) {
      const account = privateKeyToAccount(privateKey)
      const wc = createWalletClient({ chain: sepolia, transport: http(rpc), account })
      await wc.writeContract({
        address:      ADDRESSES_SEPOLIA.BattleEscrow,
        abi:          BattleEscrowABI,
        functionName: 'createBattle',
        args:         [battleIdBytes, myWallet, withWallet, BigInt(Math.round(parseFloat(stakeAmount) * 1_000_000))],
      }).catch((e: Error) => console.error('[Battle] createBattle:', e.message))
    }

    // ── 3. Debate round 1 ─────────────────────────────────────────────────────
    const opening = await brain.chat({
      text:      `You are in a battle debate with ${withName}. Make your opening argument!`,
      fromPetId: withPetId,
    })
    await axl.send(withPeerId, { type: 'battle-debate', battleId, round: 1, text: opening, fromPetId: myPetId })
    memory.add({ kind: 'event', content: { event: 'battle-debate', round: 1, text: opening } })

    const oppR1 = await waitFor<{ text: string }>(battleId, 'battle-debate-1', 30_000)

    // ── 4. Debate round 2 ─────────────────────────────────────────────────────
    const closing = await brain.chat({
      text:      `${withName} said: "${oppR1.text}". Give your closing rebuttal!`,
      fromPetId: withPetId,
    })
    await axl.send(withPeerId, { type: 'battle-debate', battleId, round: 2, text: closing, fromPetId: myPetId })

    const oppR2 = await waitFor<{ text: string }>(battleId, 'battle-debate-2', 30_000)

    // ── 5. Send transcript to judge pets ──────────────────────────────────────
    const transcript = [
      { petId: myPetId, round: 1, text: opening },
      { petId: withPetId, round: 1, text: oppR1.text },
      { petId: myPetId, round: 2, text: closing },
      { petId: withPetId, round: 2, text: oppR2.text },
    ]
    for (const j of judges) {
      await axl.send(j.peerId, { type: 'battle-judge', battleId, transcript, pet1Id: myPetId, pet2Id: withPetId })
        .catch(() => {})
    }

    // ── 6. Collect votes (30 s) ───────────────────────────────────────────────
    const votes = await collectVotes(battleId, judges.length, 30_000)
    const tally = votes.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<number, number>())
    const winnerPetId:  number           = (tally.get(myPetId) ?? 0) >= (tally.get(withPetId) ?? 0) ? myPetId : withPetId
    const winnerWallet: `0x${string}`    = winnerPetId === myPetId ? myWallet : withWallet

    // ── 7. Settle on-chain ───────────────────────────────────────────────────
    if (rpc && privateKey) {
      const account = privateKeyToAccount(privateKey)
      const wc = createWalletClient({ chain: sepolia, transport: http(rpc), account })
      await wc.writeContract({
        address:      ADDRESSES_SEPOLIA.BattleEscrow,
        abi:          BattleEscrowABI,
        functionName: 'settle',
        args:         [battleIdBytes, winnerWallet],
      }).catch((e: Error) => console.error('[Battle] settle:', e.message))
    }

    const text = `Battle over! Pet ${winnerPetId} wins (${votes.length}/${judges.length} votes)`
    memory.add({ kind: 'event', content: { event: 'battle-result', battleId, winner: winnerPetId, transcript } })
    return { winner: winnerPetId, text }

  } finally {
    activeBattleIds.delete(battleId)
  }
}

// ── Passive participant handlers (called from worker.ts recv loop) ─────────────

export async function handleBattleInvite(
  axl:       AXLClient,
  fromPeer:  string,
  msg:       { battleId: string; fromPetId: number },
  myPetId:   number,
) {
  await axl.send(fromPeer, { type: 'battle-accept', battleId: msg.battleId, fromPetId: myPetId })
}

export async function handleBattleDebate(
  axl:       AXLClient,
  brain:     Brain,
  memory:    Memory,
  fromPeer:  string,
  msg:       { battleId: string; round: number; text: string; fromPetId: number },
  myPetId:   number,
) {
  const response = await brain.chat({
    text:      `Battle debate: opponent says "${msg.text}". Respond!`,
    fromPetId: msg.fromPetId,
  })
  await axl.send(fromPeer, { type: 'battle-debate', battleId: msg.battleId, round: msg.round, text: response, fromPetId: myPetId })
  memory.add({ kind: 'event', content: { event: 'battle-debate-passive', round: msg.round, text: response } })
}

export async function handleBattleJudge(
  axl:      AXLClient,
  brain:    Brain,
  fromPeer: string,
  msg:      { battleId: string; transcript: unknown[]; pet1Id: number; pet2Id: number },
) {
  const decision = await brain.decide(
    'Vote for the winner of this debate battle. Respond with only the pet ID number.',
    { transcript: msg.transcript, pet1Id: msg.pet1Id, pet2Id: msg.pet2Id },
  )
  // If the decision text contains pet1's id (and not pet2's exclusively), vote pet1
  const vote = decision.includes(String(msg.pet1Id)) && !decision.includes(String(msg.pet2Id))
    ? msg.pet1Id
    : msg.pet2Id
  await axl.send(fromPeer, { type: 'battle-vote', battleId: msg.battleId, vote, fromPetId: -1 })
}