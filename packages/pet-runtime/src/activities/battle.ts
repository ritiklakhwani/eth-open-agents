import { EventEmitter } from 'events'
import path from 'path'
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  type Hash,
  type PublicClient,
} from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { withDeployerTxLock } from 'deployer-tx-lock'
import { BattleEscrowABI, ADDRESSES_SEPOLIA, battleIdToEscrowKey, parseBattleEscrowBattlesRead } from 'contracts-sdk'
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

interface JudgeVote { judgeId: number; vote: number }

function cannedBattleLine(myPetId: number, opponentPetId: number, round: number): string {
  const lines = [
    `Pet ${myPetId} opens strong: speed, charm, and strategy beat pet ${opponentPetId} today.`,
    `Pet ${myPetId} counters with confidence: every move is calculated, and the crowd can feel it.`,
    `Pet ${myPetId} closes the battle with style: consistency wins demos and duels.`,
  ]
  return lines[(round - 1) % lines.length]
}

async function battleChatOrFallback(
  brain: Brain,
  prompt: { text: string; fromPetId: number },
  myPetId: number,
  round: number,
): Promise<string> {
  try {
    return await brain.chat(prompt)
  } catch (err) {
    console.warn(`[Battle] brain chat fallback for pet ${myPetId}: ${(err as Error).message.slice(0, 120)}`)
    return cannedBattleLine(myPetId, prompt.fromPetId, round)
  }
}

async function judgeOrFallback(
  brain: Brain,
  msg: { transcript: unknown[]; pet1Id: number; pet2Id: number },
  judgePetId: number,
): Promise<number> {
  try {
    const decision = await brain.decide(
      'Vote for the winner of this debate battle. Respond with only the pet ID number.',
      { transcript: msg.transcript, pet1Id: msg.pet1Id, pet2Id: msg.pet2Id },
    )
    const c1 = (decision.match(new RegExp(String(msg.pet1Id), 'g')) ?? []).length
    const c2 = (decision.match(new RegExp(String(msg.pet2Id), 'g')) ?? []).length
    return c1 >= c2 ? msg.pet1Id : msg.pet2Id
  } catch (err) {
    console.warn(`[Battle] judge fallback for pet ${judgePetId}: ${(err as Error).message.slice(0, 120)}`)
    return (judgePetId + msg.pet1Id + msg.pet2Id) % 2 === 0 ? msg.pet1Id : msg.pet2Id
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

/** Surfaces viem `details` (e.g. "replacement transaction underpriced") instead of only the generic shortMessage. */
function formatContractWriteError(e: unknown): string {
  if (e instanceof BaseError) {
    const rev = e.walk((err) => err instanceof ContractFunctionRevertedError)
    if (rev instanceof ContractFunctionRevertedError) {
      return rev.reason ?? rev.shortMessage ?? e.shortMessage
    }
    const details = typeof e.details === 'string' ? e.details.trim() : ''
    if (details && details !== e.shortMessage) {
      return `${e.shortMessage} — ${details}`
    }
    return e.shortMessage
  }
  return e instanceof Error ? e.message : String(e)
}

type StakeOutcome =
  | { ready: true; pet1Staked: true; pet2Staked: true }
  | { ready: false; pet1Staked: boolean; pet2Staked: boolean; reason: string }

async function waitForEscrowBothStakes(
  publicClient: PublicClient,
  battleIdBytes: `0x${string}`,
  progress: (phase: string, detail: string, metadata?: Record<string, unknown>) => void,
  opts:      { timeoutMs: number; pollMs: number },
): Promise<StakeOutcome> {
  const deadline = Date.now() + opts.timeoutMs
  let lastP1 = false
  let lastP2 = false
  while (Date.now() < deadline) {
    const raw = await publicClient.readContract({
      address:      ADDRESSES_SEPOLIA.BattleEscrow,
      abi:          BattleEscrowABI,
      functionName: 'battles',
      args:         [battleIdBytes],
    })
    const row = parseBattleEscrowBattlesRead(raw)
    if (!row) {
      progress('escrow-stakes-wait', 'BattleEscrow read parse failed; retrying…', { track: 'BattleEscrow' })
      await sleep(opts.pollMs)
      continue
    }
    if (row.pet1 === ZERO_ADDRESS) {
      progress('escrow-stakes-wait', 'BattleEscrow row not visible yet; retrying…', { track: 'BattleEscrow' })
      await sleep(opts.pollMs)
      continue
    }
    lastP1 = row.pet1Staked
    lastP2 = row.pet2Staked
    if (row.pet1Staked && row.pet2Staked) {
      progress('escrow-stakes-ready', 'Both stakes confirmed on BattleEscrow.', {
        track:      'BattleEscrow',
        pet1Staked: true,
        pet2Staked: true,
      })
      return { ready: true, pet1Staked: true, pet2Staked: true }
    }
    progress(
      'escrow-stakes-wait',
      `Waiting for on-chain stakes (pet1=${row.pet1Staked}, pet2=${row.pet2Staked}). Owners must stake in the web arena.`,
      {
        track:      'BattleEscrow',
        pet1Staked: row.pet1Staked,
        pet2Staked: row.pet2Staked,
      },
    )
    await sleep(opts.pollMs)
  }
  return { ready: false, pet1Staked: lastP1, pet2Staked: lastP2, reason: 'stake-timeout' }
}

function collectVotes(battleId: string, count: number, timeoutMs: number): Promise<JudgeVote[]> {
  if (count <= 0) return Promise.resolve([])
  return new Promise((resolve) => {
    const votes: JudgeVote[] = []
    const timer = setTimeout(() => {
      battleBus.off(`${battleId}:battle-vote`, handler)
      resolve(votes)
    }, timeoutMs)
    const handler = (msg: { vote: number; fromPetId: number }) => {
      votes.push({ judgeId: msg.fromPetId, vote: msg.vote })
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
  format?:      string
  onProgress?:  (event: { phase: string; detail: string; metadata?: Record<string, unknown> }) => void
}

export interface BattleJudgeResult {
  petId:     number
  score:     number   // votes cast for this pet by this judge (0 or 1)
  reasoning: string
}

export interface BattleResult {
  winner:  number
  text:    string
  judges:  BattleJudgeResult[]
  pot:     string
  payouts: Array<{ betterPetId: number; amount: string }>
  createTxHash?: string | null
  settlementTxHash?: string | null
  onChainStatus?: string
  /** Present when `settle` was attempted and reverted or RPC failed. */
  settlementError?: string
}

export async function runBattle(
  axl:    AXLClient,
  brain:  Brain,
  memory: Memory,
  args:   BattleStartArgs,
): Promise<BattleResult> {
  const { battleId, myPetId, myWallet, withPeerId, withPetId, withName, withWallet, stakeAmount, judges } = args
  const format = args.format ?? 'debate'
  const progress = (phase: string, detail: string, metadata?: Record<string, unknown>) => {
    args.onProgress?.({ phase, detail, metadata })
  }
  activeBattleIds.add(battleId)

  const rpc          = process.env.SEPOLIA_RPC_URL
  const privateKey   = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined
  const battleIdBytes = battleIdToEscrowKey(battleId)
  let createTxHash: string | null = null
  let settlementTxHash: string | null = null
  let onChainStatus = 'not-configured'
  let settlementError: string | undefined

  const publicClient = rpc ? createPublicClient({ chain: sepolia, transport: http(rpc) }) : null
  let escrowCreateOk = false
  /** Same monorepo root as Hub uses for deployer-tx-lock — worker cwd is pinned there in PetSupervisor. */
  const monorepoRoot = path.resolve(process.cwd())

  try {
    // ── 1. Invite + wait for acceptance ────────────────────────────────────────
    progress('invite', `Inviting pet ${withPetId} over Gensyn AXL for a ${format} battle.`, {
      track: 'Gensyn AXL',
      toPetId: withPetId,
    })
    const accepted = waitFor(battleId, 'battle-accept', 30_000)
    await axl.send(withPeerId, { type: 'battle-invite', battleId, fromPetId: myPetId, toPetId: withPetId, stakeAmount })
    progress('accepted-wait', `Waiting for ${withName} to accept the challenge.`, { timeoutMs: 30_000 })
    await accepted
    progress('accepted', `${withName} accepted over AXL. Judge panel: ${judges.length} pet(s).`, {
      opponentPetId: withPetId,
      judgeCount: judges.length,
    })

    // ── 2. Register battle on-chain + start stake wait (parallel with debate) ─
    let wc: ReturnType<typeof createWalletClient> | null = null
    let deployerAccount: ReturnType<typeof privateKeyToAccount> | null = null
    if (publicClient && privateKey) {
      deployerAccount = privateKeyToAccount(privateKey)
      wc = createWalletClient({ chain: sepolia, transport: http(rpc!), account: deployerAccount })
      progress('escrow-create', `Registering BattleEscrow challenge on Sepolia for ${stakeAmount} USDC each.`, {
        track: 'BattleEscrow',
      })
      try {
        createTxHash = await withDeployerTxLock(monorepoRoot, async () => {
          const h = await wc!.writeContract({
            chain:   sepolia,
            account: deployerAccount!,
            address:      ADDRESSES_SEPOLIA.BattleEscrow,
            abi:          BattleEscrowABI,
            functionName: 'createBattle',
            args:         [battleIdBytes, myWallet, withWallet, BigInt(Math.round(parseFloat(stakeAmount) * 1_000_000))],
          })
          await publicClient!.waitForTransactionReceipt({ hash: h as Hash })
          return h
        })
        escrowCreateOk = true
        onChainStatus = 'battle-created'
        progress('escrow-created', `BattleEscrow createBattle confirmed: ${createTxHash.slice(0, 10)}...`, {
          track: 'BattleEscrow',
          txHash: createTxHash,
        })
      } catch (e) {
        const msg = formatContractWriteError(e)
        onChainStatus = 'create-failed'
        progress('escrow-create-failed', `BattleEscrow createBattle failed: ${msg.slice(0, 280)}`, {
          track: 'BattleEscrow',
          error: msg,
        })
        console.error('[Battle] createBattle:', msg)
      }
    } else {
      progress('escrow-skipped', 'BattleEscrow tx skipped because Sepolia RPC or signer is not configured.', {
        track: 'BattleEscrow',
      })
    }

    const stakeTimeoutMs = Math.max(10_000, Number(process.env.BATTLE_ESCROW_STAKE_TIMEOUT_MS ?? 600_000))
    /** When escrow is live, we wait for both stakes before any debate or judging so the live feed and payouts stay sequential. */
    let stakeOutcome: StakeOutcome
    if (escrowCreateOk && publicClient) {
      progress(
        'escrow-stakes-gate',
        'Waiting for both pets to stake USDC on-chain. Debate and judging start only after both stakes confirm.',
        { track: 'BattleEscrow' },
      )
      stakeOutcome = await waitForEscrowBothStakes(publicClient, battleIdBytes, progress, {
        timeoutMs: stakeTimeoutMs,
        pollMs:    2500,
      })
    } else {
      stakeOutcome = {
        ready:       false as const,
        pet1Staked:  false,
        pet2Staked:  false,
        reason:      !publicClient || !privateKey ? 'escrow-unavailable' : 'create-failed',
      }
    }

    if (escrowCreateOk && publicClient && !stakeOutcome.ready) {
      progress(
        'battle-aborted-stakes',
        `Battle aborted: stakes incomplete (${stakeOutcome.reason}). pet1Staked=${stakeOutcome.pet1Staked}, pet2Staked=${stakeOutcome.pet2Staked}.`,
        {
          track:      'BattleEscrow',
          reason:     stakeOutcome.reason,
          pet1Staked: stakeOutcome.pet1Staked,
          pet2Staked: stakeOutcome.pet2Staked,
        },
      )
      memory.add({
        kind:    'event',
        content: { event: 'battle-aborted', battleId, reason: stakeOutcome.reason },
      })
      return {
        winner:           -1,
        text:             `Battle aborted — both stakes were not confirmed (${stakeOutcome.reason}).`,
        judges:           [],
        pot:              '0',
        payouts:          [],
        createTxHash,
        settlementTxHash: null,
        onChainStatus:
          stakeOutcome.reason === 'stake-timeout' ? 'stake-timeout' : 'stakes-incomplete',
        settlementError: undefined,
      }
    }

    if (escrowCreateOk && publicClient && stakeOutcome.ready) {
      progress('debate-begin', 'Both stakes confirmed. Opening debate — round 1.', { track: 'Battle' })
    }

    // ── 3. Debate round 1 ─────────────────────────────────────────────────────
    progress('round-1-thinking', `Pet ${myPetId} is preparing an opening argument.`, { speakerPetId: myPetId })
    const opening = await battleChatOrFallback(
      brain,
      {
        text:      `You are in a ${format} battle with ${withName}. Make your opening argument!`,
        fromPetId: withPetId,
      },
      myPetId,
      1,
    )
    const round1Response = waitFor<{ text: string }>(battleId, 'battle-debate-1', 30_000)
    await axl.send(withPeerId, { type: 'battle-debate', battleId, round: 1, text: opening, fromPetId: myPetId, toPetId: withPetId })
    memory.add({ kind: 'event', content: { event: 'battle-debate', round: 1, text: opening } })
    progress('round-1', `Pet ${myPetId}: "${opening.slice(0, 180)}${opening.length > 180 ? '...' : ''}"`, {
      speakerPetId: myPetId,
      text: opening,
    })

    const oppR1 = await round1Response
    progress('round-1-response', `${withName}: "${oppR1.text.slice(0, 180)}${oppR1.text.length > 180 ? '...' : ''}"`, {
      speakerPetId: withPetId,
      text: oppR1.text,
    })

    // ── 4. Debate round 2 ─────────────────────────────────────────────────────
    progress('round-2-thinking', `Pet ${myPetId} is preparing a closing rebuttal.`, { speakerPetId: myPetId })
    const closing = await battleChatOrFallback(
      brain,
      {
        text:      `${withName} said: "${oppR1.text}". Give your closing rebuttal!`,
        fromPetId: withPetId,
      },
      myPetId,
      2,
    )
    const round2Response = waitFor<{ text: string }>(battleId, 'battle-debate-2', 30_000)
    await axl.send(withPeerId, { type: 'battle-debate', battleId, round: 2, text: closing, fromPetId: myPetId, toPetId: withPetId })
    progress('round-2', `Pet ${myPetId}: "${closing.slice(0, 180)}${closing.length > 180 ? '...' : ''}"`, {
      speakerPetId: myPetId,
      text: closing,
    })

    const oppR2 = await round2Response
    progress('round-2-response', `${withName}: "${oppR2.text.slice(0, 180)}${oppR2.text.length > 180 ? '...' : ''}"`, {
      speakerPetId: withPetId,
      text: oppR2.text,
    })

    // ── 5. Send transcript to judge pets ──────────────────────────────────────
    const transcript = [
      { petId: myPetId, round: 1, text: opening },
      { petId: withPetId, round: 1, text: oppR1.text },
      { petId: myPetId, round: 2, text: closing },
      { petId: withPetId, round: 2, text: oppR2.text },
    ]
    progress('judging', `Sending transcript to ${judges.length} judge pet(s) over AXL.`, {
      track: 'Gensyn AXL',
      judgePetIds: judges.map(j => j.petId),
      transcript,
    })
    const votesPromise = collectVotes(battleId, judges.length, 30_000)
    for (const j of judges) {
      await axl.send(j.peerId, { type: 'battle-judge', battleId, transcript, pet1Id: myPetId, pet2Id: withPetId, toPetId: j.petId })
        .catch(() => {})
    }

    // ── 6. Collect votes (30 s) ───────────────────────────────────────────────
    const votes      = await votesPromise
    progress('votes', `Collected ${votes.length}/${judges.length} judge vote(s).`, {
      track: 'Gensyn AXL',
      votes,
    })
    const tally      = votes.reduce((m, v) => m.set(v.vote, (m.get(v.vote) ?? 0) + 1), new Map<number, number>())
    const winnerPetId:  number        = (tally.get(myPetId) ?? 0) >= (tally.get(withPetId) ?? 0) ? myPetId : withPetId
    const winnerWallet: `0x${string}` = winnerPetId === myPetId ? myWallet : withWallet

    const judgeResults: BattleJudgeResult[] = votes.map(v => ({
      petId:     v.judgeId,
      score:     v.vote === winnerPetId ? 1 : 0,
      reasoning: `Voted for pet ${v.vote}`,
    }))

    // ── 7. Settle on-chain (stakes were already confirmed before debate/judge) ─
    if (!stakeOutcome.ready) {
      if (escrowCreateOk) {
        onChainStatus = stakeOutcome.reason === 'stake-timeout' ? 'stake-timeout' : 'stakes-incomplete'
        progress(
          'settlement-skipped',
          `BattleEscrow settle skipped (${stakeOutcome.reason}). pet1Staked=${stakeOutcome.pet1Staked} pet2Staked=${stakeOutcome.pet2Staked}. ` +
            `Off-chain winner pet ${winnerPetId} was not paid USDC on-chain.`,
          {
            track:       'BattleEscrow',
            reason:      stakeOutcome.reason,
            pet1Staked:  stakeOutcome.pet1Staked,
            pet2Staked:  stakeOutcome.pet2Staked,
            winnerPetId,
          },
        )
      }
    } else if (wc) {
      progress('settlement', `Submitting BattleEscrow settle for winner pet ${winnerPetId}.`, {
        track: 'BattleEscrow',
        winnerPetId,
      })
      try {
        settlementTxHash = await withDeployerTxLock(monorepoRoot, () =>
          wc!.writeContract({
            chain:   sepolia,
            account: deployerAccount!,
            address:      ADDRESSES_SEPOLIA.BattleEscrow,
            abi:          BattleEscrowABI,
            functionName: 'settle',
            args:         [battleIdBytes, winnerWallet],
          }),
        )
        onChainStatus = 'settle-submitted'
        progress('settlement-submitted', `BattleEscrow settle submitted: ${settlementTxHash.slice(0, 10)}...`, {
          track: 'BattleEscrow',
          txHash: settlementTxHash,
          winnerPetId,
        })
      } catch (e) {
        onChainStatus = 'settle-failed'
        const msg = formatContractWriteError(e)
        settlementError = msg
        progress('settlement-failed', `BattleEscrow settle failed: ${msg}`, {
          track: 'BattleEscrow',
          error: msg,
          winnerPetId,
        })
        console.error('[Battle] settle:', msg)
      }
    }

    const pot  = String(parseFloat(stakeAmount) * 2)
    const text = `Battle over! Pet ${winnerPetId} wins (${votes.length}/${judges.length} votes)`
    memory.add({ kind: 'event', content: { event: 'battle-result', battleId, winner: winnerPetId, transcript } })
    progress('ens-belt', `Winner pet ${winnerPetId} will receive an ENS debate belt update from Hub.`, {
      track: 'ENS',
      winnerPetId,
      key: 'tama.belts.debate',
    })
    return {
      winner:  winnerPetId,
      text,
      judges:  judgeResults,
      pot,
      payouts: [{ betterPetId: winnerPetId, amount: pot }],
      createTxHash,
      settlementTxHash,
      onChainStatus,
      settlementError,
    }

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
  await axl.send(fromPeer, { type: 'battle-accept', battleId: msg.battleId, fromPetId: myPetId, toPetId: msg.fromPetId })
}

export async function handleBattleDebate(
  axl:       AXLClient,
  brain:     Brain,
  memory:    Memory,
  fromPeer:  string,
  msg:       { battleId: string; round: number; text: string; fromPetId: number },
  myPetId:   number,
) {
  const response = await battleChatOrFallback(
    brain,
    {
      text:      `Battle debate: opponent says "${msg.text}". Respond!`,
      fromPetId: msg.fromPetId,
    },
    myPetId,
    msg.round,
  )
  await axl.send(fromPeer, { type: 'battle-debate', battleId: msg.battleId, round: msg.round, text: response, fromPetId: myPetId, toPetId: msg.fromPetId })
  memory.add({ kind: 'event', content: { event: 'battle-debate-passive', round: msg.round, text: response } })
}

export async function handleBattleJudge(
  axl:        AXLClient,
  brain:      Brain,
  fromPeer:   string,
  msg:        { battleId: string; transcript: unknown[]; pet1Id: number; pet2Id: number },
  myPetId:    number,
) {
  const vote = await judgeOrFallback(brain, msg, myPetId)
  await axl.send(fromPeer, { type: 'battle-vote', battleId: msg.battleId, vote, fromPetId: myPetId, toPetId: msg.pet1Id })
}