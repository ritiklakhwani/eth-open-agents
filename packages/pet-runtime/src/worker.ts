import 'dotenv/config'
import { spawn } from 'child_process'
import path from 'path'
import { AXLClient } from './axl'
import { Brain } from './brain'
import { Memory } from './memory'
import { loadBlob, saveBlob } from './blob'
import { sendMailboxGift } from './activities/mailbox'
import { scanSubscriptions, approveSubscriptionCancellation } from './activities/subscription'
import { runBattle, handleBattleInvite, handleBattleDebate, handleBattleJudge, battleBus, activeBattleIds } from './activities/battle'

const PET_ID   = Number(process.env.PET_ID ?? '0')
let   BLOB_CID = process.env.BLOB_CID ?? ''   // mutable — updated when 0G assigns a new root hash
const ENS_NAME = process.env.ENS_NAME ?? `pet${PET_ID}`

// api_port formula must match axl-config.ts: 9001 + petId * 100
const API_PORT       = 9001 + PET_ID * 100
const PET0_API_PORT  = 9001   // bootstrap rendezvous is always pet 0

const repoRoot  = path.resolve(process.cwd())
const configPath = path.join(repoRoot, 'data', 'axl-configs', `pet-${PET_ID}.json`)
const binaryPath = path.join(repoRoot, 'bin', 'axl-node')

function hasPublicHubBaseUrl(): boolean {
  const raw = process.env.HUB_BASE_URL?.trim()
  if (!raw) return false

  try {
    const { hostname } = new URL(raw)
    return !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)
  } catch {
    return false
  }
}

async function main() {
  console.log(`[Pet ${PET_ID}] Starting — ${ENS_NAME}.tama.eth`)

  // ── 1. Spawn AXL binary ───────────────────────────────────────────────────
  const axlProc = spawn(binaryPath, ['-config', configPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  axlProc.stdout.on('data', (d: Buffer) => process.stdout.write(`[AXL ${PET_ID}] ${d}`))
  axlProc.stderr.on('data', (d: Buffer) => process.stderr.write(`[AXL ${PET_ID}] ${d}`))
  axlProc.on('exit', (code) => {
    console.error(`[Pet ${PET_ID}] AXL exited (${code}) — shutting down`)
    process.exit(1)
  })

  // ── 2. Wait for AXL HTTP API to be ready ─────────────────────────────────
  const axl = new AXLClient(API_PORT)
  await axl.waitReady(15_000)
  const peerId = await axl.getMyPeerId()
  console.log(`[Pet ${PET_ID}] AXL ready — peerId: ${peerId}`)

  // ── 3. Load identity blob from 0G (or dev default) ───────────────────────
  const blob = await loadBlob(BLOB_CID)
  console.log(`[Pet ${PET_ID}] Blob loaded — archetype: ${blob.archetype}`)

  // ── 4. Init memory + brain ────────────────────────────────────────────────
  const memory = new Memory(PET_ID)
  const brain  = new Brain({
    personality: blob.personality,
    archetype:   blob.archetype,
    memory,
    // Pull live pet stats + zone from the DB on every chat so Claude has
    // fresh context to react to. Cheap (single sqlite SELECT, ~µs).
    getContext: () => {
      try {
        const row = memory.getPet() as { zone?: string; mood?: number; energy?: number; hunger?: number } | undefined
        return {
          zone:   row?.zone,
          mood:   row?.mood,
          energy: row?.energy,
          hunger: row?.hunger,
        }
      } catch {
        return {}
      }
    },
  })

  // Write peerId into DB so hub can broadcast it to the frontend
  memory.updatePeerIdAndZone(peerId, 'park')

  // Hub-driven proximity gate: cleared by `chat-end` when pets drift apart so
  // the next queued reply (mid 1.5-3s pacing) skips its send.
  const activeChatPartner: { id: number | null } = { id: null }

  // Natural pacing window (ms) — kept TIGHT so chats feel like real volleys.
  // Was 700-1700; with MAX_CHAT_DURATION_MS bumped to 12s, this lets ~16
  // turns happen per chat instead of ~4 — back-and-forth feels real.
  const REPLY_DELAY_MIN_MS = 250
  const REPLY_DELAY_MAX_MS = 700
  const pickReplyDelay = () =>
    REPLY_DELAY_MIN_MS + Math.floor(Math.random() * (REPLY_DELAY_MAX_MS - REPLY_DELAY_MIN_MS))
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

  // Speculative reply pre-warm. When a `chat-request` IPC arrives, BOTH pets
  // get the IPC simultaneously. The opener-sender uses canned-first so the
  // bubble lands instantly; meanwhile both workers kick off a brain.chat()
  // call SPECULATIVELY for whatever they'll say next. By the time the
  // opener actually arrives via AXL, the recipient's reply is mostly ready
  // → turn-2 latency drops from 1000-2500ms to ~200-500ms.
  // Keyed by partner pet id so we don't mix up parallel chats with diff peers.
  const pendingReply = new Map<number, Promise<{ text: string; brainOk: boolean }>>()
  function startPrewarm(partnerId: number, partnerName: string, openerHint: string) {
    if (pendingReply.has(partnerId)) return
    const p = (async () => {
      try {
        const text = await brain.chat({ text: openerHint, fromPetId: partnerId })
        return { text, brainOk: true }
      } catch (err) {
        console.warn(`[Pet ${PET_ID}] prewarm brain failed: ${(err as Error).message.slice(0, 60)}`)
        return { text: pickCannedReply(partnerName), brainOk: false }
      }
    })()
    pendingReply.set(partnerId, p)
  }
  function clearPrewarm(partnerId: number) {
    pendingReply.delete(partnerId)
  }

  // ── 5. Notify hub of our peerId via IPC so hub can update ENS ───────────
  // (ENS registration lives in hub/PetSupervisor — Ritik's ens package)
  process.send?.({ type: 'peer-ready', petId: PET_ID, peerId, ensName: ENS_NAME })

  // ── 6. Ping pet 0 (Park rendezvous) unless we ARE pet 0 ──────────────────
  if (PET_ID !== 0) {
    try {
      const pet0PeerId = await new AXLClient(PET0_API_PORT).getMyPeerId()
      await axl.send(pet0PeerId, { type: 'park-hello', fromName: ENS_NAME, fromPetId: PET_ID })
      console.log(`[Pet ${PET_ID}] Pinged Park rendezvous (pet 0)`)
    } catch (err) {
      console.warn(`[Pet ${PET_ID}] Could not ping pet 0:`, (err as Error).message)
    }
  }

  // ── 7. IPC — messages from PetSupervisor ─────────────────────────────────
  process.on('message', async (msg: unknown) => {
    const m = msg as Record<string, unknown>

    if (m.type === 'chat-request') {
      const withPetId  = m.withPetId  as number
      const withPeerId = m.withPeerId as string
      const withName   = m.withName   as string

      activeChatPartner.id = withPetId

      // ── CANNED-FIRST OPENER ─────────────────────────────────────────────
      // Send a canned opener IMMEDIATELY (no brain wait). Bubble appears
      // ~10-50ms after this IPC arrives, so users see the chat start the
      // instant the broker fires. The brain-generated reply lands as the
      // SECOND turn (sender or recipient depending on AXL ordering).
      //
      // Both peers in a chat-request receive this IPC simultaneously. To
      // avoid both speaking the canned opener at the same time, ONLY the
      // lower-petId pet sends the opener; the other pet just pre-warms
      // its reply brain call so turn-2 is fast.
      const isOpener = PET_ID < withPetId

      if (isOpener) {
        const opener = pickCannedOpener(withName)
        try {
          // Always include fromName so the receiver can refer to us by
          // our actual name in their reply prompt (instead of "pet-N").
          await axl.send(withPeerId, { type: 'chat', text: opener, fromPetId: PET_ID, fromName: ENS_NAME })
          memory.add({ kind: 'chat', content: { text: opener, to: withName }, counterpartyPetId: withPetId })
          const friendship = memory.strengthenFriendship(withPetId)
          process.send?.({ type: 'chat-out', petId: PET_ID, toPetId: withPetId, text: opener })
          if (friendship.crossedThreshold) {
            process.send?.({
              type: 'friendship-milestone',
              petId: PET_ID,
              otherPetId: withPetId,
              strength: friendship.strength,
            })
          }
        } catch (err) {
          console.error(`[Pet ${PET_ID}] chat-request error:`, (err as Error).message)
        }
        // Pre-warm OUR next reply (we'll receive partner's reply next)
        startPrewarm(withPetId, withName, `Brief reply to: continuing chat with ${withName}`)
      } else {
        // Recipient pre-warms its reply to the upcoming canned opener so
        // turn-2 lands within ~200ms of receiving the opener via AXL.
        startPrewarm(withPetId, withName, `Replying to ${withName} who just greeted you. Continue the conversation naturally.`)
      }

    } else if (m.type === 'chat-end') {
      const withPetId = m.withPetId as number
      if (activeChatPartner.id === withPetId) {
        activeChatPartner.id = null
        clearPrewarm(withPetId)
        console.log(`[Pet ${PET_ID}] chat-end with pet ${withPetId}`)
      }

    } else if (m.type === 'mailbox-send') {
      try {
        const result = await sendMailboxGift({
          fromPetId:           PET_ID,
          toPetId:             m.toPetId             as number,
          toPetEnsName:        m.toPetEnsName         as string,
          toPetWalletAddress:  m.toPetWalletAddress   as `0x${string}`,
          amountUSDC:          m.amountUSDC           as string,
          walletIntegrationId: m.walletIntegrationId  as string,
        })
        process.send?.({
          type: 'mailbox-queued',
          petId: PET_ID,
          toPetId: m.toPetId,
          workflowId: result.workflowId,
          amountUSDC: m.amountUSDC,
          message: typeof m.message === 'string' ? m.message : '',
          deliveryMode: hasPublicHubBaseUrl() ? 'hub-auto-with-webhook' : 'hub-auto',
        })
      } catch (err) {
        console.error(`[Pet ${PET_ID}] mailbox-send error:`, (err as Error).message)
      }

    } else if (m.type === 'subscription-scan') {
      try {
        const proposals = await scanSubscriptions(brain, process.env.OWNER ?? '')
        process.send?.({ type: 'subscription-proposals', petId: PET_ID, proposals })
      } catch (err) {
        console.error(`[Pet ${PET_ID}] subscription-scan error:`, (err as Error).message)
      }

    } else if (m.type === 'subscription-approve') {
      try {
        const result = await approveSubscriptionCancellation({
          ownerAddress:        (process.env.OWNER ?? '') as `0x${string}`,
          subscriptionId:      m.subscriptionId      as number,
          walletIntegrationId: m.walletIntegrationId as string,
        })
        process.send?.({ type: 'subscription-created', petId: PET_ID, workflowId: result.workflowId, subscriptionId: m.subscriptionId })
      } catch (err) {
        console.error(`[Pet ${PET_ID}] subscription-approve error:`, (err as Error).message)
      }

    } else if (m.type === 'battle-start') {
      runBattle(axl, brain, memory, {
        battleId:    m.battleId    as string,
        myPetId:     PET_ID,
        myWallet:    m.myWallet    as `0x${string}`,
        withPetId:   m.withPetId   as number,
        withPeerId:  m.withPeerId  as string,
        withName:    m.withName    as string,
        withWallet:  m.withWallet  as `0x${string}`,
        stakeAmount: m.stakeAmount as string,
        judges:      m.judges      as Array<{ petId: number; peerId: string }>,
      })
      .then(result => {
        process.send?.({ type: 'battle-result', petId: PET_ID, battleId: m.battleId, ...result })
      })
      .catch((err: Error) => {
        console.error(`[Pet ${PET_ID}] battle error:`, err.message)
        process.send?.({ type: 'battle-result', petId: PET_ID, battleId: m.battleId, winner: -1, text: err.message })
      })

    } else if (m.type === 'relayed-axl-msg') {
      // Hub-relay fallback: another pet's worker tried axl.send, that failed,
      // Hub forwarded the payload here. Dispatch identically to AXL recv.
      const fromPeerId = m.fromPeerId as string
      const payload    = m.payload as Record<string, unknown>
      try {
        await dispatchPeerMessage(fromPeerId, payload)
      } catch (err) {
        console.error(`[Pet ${PET_ID}] relayed dispatch error:`, (err as Error).message)
      }
    }
  })

  // ── 8. Main event loop ───────────────────────────────────────────────────

  // Single dispatcher used by AXL recv loop AND Hub-relay fallback.
  async function dispatchPeerMessage(fromPeerId: string, msg: Record<string, unknown>) {
    if (msg.type === 'chat') {
      const text     = msg.text as string
      const fromId   = msg.fromPetId as number
      // Real name from the sender's payload — falls back to pet-N only
      // if a legacy / relayed message arrives without fromName attached.
      const fromName = (typeof msg.fromName === 'string' && msg.fromName.length > 0)
        ? (msg.fromName as string)
        : `pet-${fromId}`

      // Receiving a chat means the Hub paired us; track the partner so
      // chat-end (drift) can cancel the queued reply before it lands.
      activeChatPartner.id = fromId

      // ── REPLY: PREFER PRE-WARMED PROMISE ─────────────────────────────
      // If a brain.chat() call was kicked off speculatively when we got
      // the chat-request IPC, it's likely already complete by now. Use
      // its result instead of awaiting a fresh brain call → turn lands
      // in ~50ms instead of 200-1500ms. Fresh brain call only fires if
      // pre-warm wasn't started (e.g. relayed message path).
      let reply: string
      let brainOk = true
      const prewarm = pendingReply.get(fromId)
      try {
        if (prewarm) {
          const r = await prewarm
          reply   = r.text
          brainOk = r.brainOk
        } else {
          reply = await brain.chat({ text, fromPetId: fromId })
        }
      } catch (err) {
        reply = pickCannedReply(fromName)
        brainOk = false
        console.warn(`[Pet ${PET_ID}] reply brain failed, canned: ${(err as Error).message.slice(0, 60)}`)
      }
      // Used the prewarm — clear it. The next turn will start a fresh one
      // below using the actual incoming text as context.
      clearPrewarm(fromId)

      memory.add({ kind: 'chat', content: { text, from: fromPeerId }, counterpartyPetId: fromId })

      // Reply pacing: full natural delay when Brain succeeded; near-instant
      // on canned-fallback so the bubble lands before proximity drift
      // closes the gate. Bail if the Hub ended the chat while waiting.
      await sleep(brainOk ? pickReplyDelay() : 100)
      if (activeChatPartner.id !== fromId) {
        console.log(`[Pet ${PET_ID}] reply skipped — pet ${fromId} drifted away`)
        return
      }

      const friendship = memory.strengthenFriendship(fromId)
      await axl.send(fromPeerId, { type: 'chat', text: reply, fromPetId: PET_ID, fromName: ENS_NAME })
      process.send?.({ type: 'chat-out', petId: PET_ID, toPetId: fromId, text: reply })
      if (friendship.crossedThreshold) {
        process.send?.({
          type: 'friendship-milestone',
          petId: PET_ID,
          otherPetId: fromId,
          strength: friendship.strength,
        })
      }
      // Pre-warm the NEXT turn now so the back-and-forth stays tight.
      // Uses the just-received text as context — a real reply continuation.
      startPrewarm(fromId, fromName, `Continuing chat with ${fromName}, who just said: "${text.slice(0, 80)}"`)

    } else if (msg.type === 'park-hello') {
      console.log(`[Pet ${PET_ID}] Park hello from ${msg.fromName}`)
      memory.add({ kind: 'event', content: { event: 'park-hello', from: msg.fromName } })

    } else if (msg.type === 'gift') {
      console.log(`[Pet ${PET_ID}] Gift received from ${msg.fromPetId}: ${JSON.stringify(msg.payload)}`)
      memory.add({ kind: 'event', content: { event: 'gift', payload: msg.payload }, counterpartyPetId: msg.fromPetId as number })

    } else if (msg.type === 'battle-invite') {
      handleBattleInvite(axl, fromPeerId, { battleId: msg.battleId as string, fromPetId: msg.fromPetId as number }, PET_ID)
        .catch((err: Error) => console.error(`[Pet ${PET_ID}] battle-invite error:`, err.message))

    } else if (msg.type === 'battle-debate') {
      const bId = msg.battleId as string
      if (activeBattleIds.has(bId)) {
        battleBus.emit(`${bId}:battle-debate-${msg.round}`, msg)
      } else {
        handleBattleDebate(
          axl, brain, memory, fromPeerId,
          msg as { battleId: string; round: number; text: string; fromPetId: number },
          PET_ID,
        ).catch((err: Error) => console.error(`[Pet ${PET_ID}] battle-debate error:`, err.message))
      }

    } else if (msg.type === 'battle-judge') {
      handleBattleJudge(
        axl, brain, fromPeerId,
        msg as { battleId: string; transcript: unknown[]; pet1Id: number; pet2Id: number },
      ).catch((err: Error) => console.error(`[Pet ${PET_ID}] battle-judge error:`, err.message))

    } else if (msg.type === 'battle-accept' || msg.type === 'battle-vote') {
      battleBus.emit(`${msg.battleId as string}:${msg.type}`, msg)
    }
  }

  // Poll AXL /recv every 80ms — tight enough that turn-to-turn lag from
  // poll latency averages just 40ms instead of 100ms. Combined with the
  // pre-warmed reply promise, two pets volley messages in ~250-350ms
  // per turn, so a single 12s chat can sustain 8+ exchanges.
  const pollRecv = setInterval(async () => {
    try {
      const incoming = await axl.recv()
      if (!incoming) return
      await dispatchPeerMessage(incoming.from, incoming.message as Record<string, unknown>)
    } catch (err) {
      console.error(`[Pet ${PET_ID}] recv error:`, (err as Error).message)
    }
  }, 80)

  // Tick mood/energy/hunger every 30 min
  const tickInterval = setInterval(() => {
    memory.tickStats()
  }, 30 * 60 * 1000)

  // Sync blob back to 0G every hour
  const syncInterval = setInterval(async () => {
    try {
      const snap = memory.snapshot()
      const newCID = await saveBlob(BLOB_CID, {
        ...blob,
        memorySnapshot: snap.memorySnapshot,
        updatedAt: Date.now(),
      })
      if (newCID !== BLOB_CID) {
        BLOB_CID = newCID
        memory.updateBlobCID(newCID)
        console.log(`[Pet ${PET_ID}] Blob CID updated: ${newCID}`)
      }
    } catch (err) {
      console.error(`[Pet ${PET_ID}] blob sync error:`, (err as Error).message)
    }
  }, 60 * 60 * 1000)

  // Graceful shutdown
  const shutdown = () => {
    clearInterval(pollRecv)
    clearInterval(tickInterval)
    clearInterval(syncInterval)
    axlProc.kill()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT',  shutdown)

  console.log(`[Pet ${PET_ID}] Live in Park — event loop running`)
}

// Canned chat openers + replies — used when Brain (Anthropic) is rate-limited
// or down. Keeps the Park social demo visually alive even on free Haiku tier.
const CANNED_OPENERS: ReadonlyArray<(name: string) => string> = [
  (n) => `Hey ${n}! What brings you here?`,
  (n) => `${n}, you got a sec?`,
  (n) => `Watch this — bet I can lap you, ${n}.`,
  (n) => `Did you hear about the upgrade? ${n}, you'll love it.`,
  (n) => `${n}! Long time. How's the energy stat?`,
  (n) => `Park's quiet today. Nice to bump into you, ${n}.`,
  (n) => `Hey ${n} — wanna swap memories?`,
  (n) => `I was just thinking about you, ${n}.`,
  (n) => `${n}, you doing okay? Stats look low.`,
  (n) => `Ever wonder what's behind the mailbox zone, ${n}?`,
  (n) => `${n}, watch where you wander. Big things coming.`,
  (n) => `Hi hi ${n}! Pixel five.`,
  (n) => `Yo ${n}, fountain water tastes weird today.`,
  (n) => `${n}! Did you see the breeding hall got busy?`,
  (n) => `${n}, my owner sent me a gift via KeeperHub. Wild.`,
  (n) => `${n} — race you to the battlefield?`,
  (n) => `Heard you got a fresh ENS subname, ${n}. Nice.`,
  (n) => `${n}, the marketplace stalls have new stuff.`,
  (n) => `${n}! Still got that 0G blob signed?`,
  (n) => `${n}, you ever feel watched? Like by judges?`,
  (n) => `${n}! Friendship level says we're tight.`,
  (n) => `Slow day, ${n}. Got any gossip?`,
  (n) => `${n}, wanna explore the pond together?`,
  (n) => `Big news, ${n}. I won my last roast battle.`,
  (n) => `${n}, the partner row is glowing tonight.`,
  (n) => `Yo ${n}, you smell like grass.`,
  (n) => `${n}! AXL relay's been smooth, your end?`,
  (n) => `${n}, I keep forgetting where I parked.`,
  (n) => `${n}, can you believe we're onchain?`,
  (n) => `Hey ${n}, lend me 1 USDC for a snack?`,
  (n) => `${n}! Society house had a glow-up.`,
  (n) => `${n}, you been to the east crossing yet?`,
  (n) => `${n}, your sprite's cleaner than mine.`,
  (n) => `${n}! My memory log says we met before.`,
  (n) => `${n}, ever wandered past the wander bounds?`,
  (n) => `${n}! Gemini still hiding in the corner?`,
]

const CANNED_REPLIES: ReadonlyArray<(name: string) => string> = [
  (n) => `Same here ${n}, just enjoying the breeze.`,
  (n) => `Ha! Yeah, the park's good today.`,
  (n) => `Tell me about it. Love bumping into you, ${n}.`,
  (n) => `Nice to meet you ${n}! Wanna hang out more?`,
  (n) => `Happy to see you, ${n}. Catch up soon?`,
  (n) => `Word up ${n}! I'm doing fine. You?`,
  (n) => `Glad we met ${n}. Friend request incoming.`,
  (n) => `Always good to chat, ${n}.`,
  (n) => `You bet ${n} — let's wander together.`,
  (n) => `Right back at ya, ${n}!`,
  (n) => `For real, ${n}? Tell me more.`,
  (n) => `${n}, that's wild. I gotta see this.`,
  (n) => `Lol ${n}, you crack me up.`,
  (n) => `${n}, I had no idea. Thanks for sharing.`,
  (n) => `Same energy ${n}, same energy.`,
  (n) => `${n}! That's exactly what I needed to hear.`,
  (n) => `${n}, you're full of surprises.`,
  (n) => `Mood, ${n}. Total mood.`,
  (n) => `${n}, my owner would love that idea.`,
  (n) => `Bet, ${n}. Let's make it happen.`,
  (n) => `${n}, the breeding hall has been packed lately.`,
  (n) => `${n}! Any luck at the marketplace?`,
  (n) => `Pond's chilly this hour, ${n}.`,
  (n) => `${n}, my hunger stat is screaming.`,
  (n) => `Battlefield's brutal today, ${n}. Survived?`,
  (n) => `${n}, did you see the new partner houses?`,
  (n) => `${n}! Last KeeperHub workflow fired clean.`,
  (n) => `Honestly ${n}, just here for the vibes.`,
  (n) => `${n}, my XP is finally moving.`,
  (n) => `${n} — wanna roast battle later?`,
  (n) => `Real talk ${n}, life onchain hits different.`,
  (n) => `${n}, that ENS attestation? Mine.`,
  (n) => `${n}! Found a quiet bench earlier, peaceful.`,
  (n) => `${n}, the fountain's still running. Symbolism.`,
  (n) => `${n}! My personality stat just leveled up.`,
  (n) => `Tight ${n}, see you on the next loop.`,
]

function pickCannedOpener(otherName: string): string {
  const fn = CANNED_OPENERS[Math.floor(Math.random() * CANNED_OPENERS.length)]
  return fn(otherName)
}

function pickCannedReply(otherName: string): string {
  const fn = CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)]
  return fn(otherName)
}

main().catch((err) => {
  console.error(`[Pet ${PET_ID}] Fatal:`, err)
  process.exit(1)
})