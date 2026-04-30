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
  const brain  = new Brain({ personality: blob.personality, archetype: blob.archetype, memory })

  // Write peerId into DB so hub can broadcast it to the frontend
  memory.updatePeerIdAndZone(peerId, 'park')

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
      try {
        const opener = await brain.meetingOpener(withName)
        await axl.send(withPeerId, { type: 'chat', text: opener, fromPetId: PET_ID })
        memory.add({ kind: 'chat', content: { text: opener, to: withName }, counterpartyPetId: withPetId })
        memory.strengthenFriendship(withPetId)
        process.send?.({ type: 'chat-out', petId: PET_ID, toPetId: withPetId, text: opener })
      } catch (err) {
        console.error(`[Pet ${PET_ID}] chat-request error:`, (err as Error).message)
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
        process.send?.({ type: 'mailbox-queued', petId: PET_ID, toPetId: m.toPetId, workflowId: result.workflowId })
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
    }
  })

  // ── 8. Main event loop ───────────────────────────────────────────────────

  // Poll AXL /recv every 5s
  const pollRecv = setInterval(async () => {
    try {
      const incoming = await axl.recv()
      if (!incoming) return
      const msg = incoming.message as Record<string, unknown>

      if (msg.type === 'chat') {
        const text     = msg.text as string
        const fromId   = msg.fromPetId as number
        const reply    = await brain.chat({ text, fromPetId: fromId })
        memory.add({ kind: 'chat', content: { text, from: incoming.from }, counterpartyPetId: fromId })
        memory.strengthenFriendship(fromId)
        await axl.send(incoming.from, { type: 'chat', text: reply, fromPetId: PET_ID })
        process.send?.({ type: 'chat-out', petId: PET_ID, toPetId: fromId, text: reply })

      } else if (msg.type === 'park-hello') {
        console.log(`[Pet ${PET_ID}] Park hello from ${msg.fromName}`)
        memory.add({ kind: 'event', content: { event: 'park-hello', from: msg.fromName } })

      } else if (msg.type === 'gift') {
        console.log(`[Pet ${PET_ID}] Gift received from ${msg.fromPetId}: ${JSON.stringify(msg.payload)}`)
        memory.add({ kind: 'event', content: { event: 'gift', payload: msg.payload }, counterpartyPetId: msg.fromPetId as number })

      } else if (msg.type === 'battle-invite') {
        handleBattleInvite(axl, incoming.from, { battleId: msg.battleId as string, fromPetId: msg.fromPetId as number }, PET_ID)
          .catch((err: Error) => console.error(`[Pet ${PET_ID}] battle-invite error:`, err.message))

      } else if (msg.type === 'battle-debate') {
        const bId = msg.battleId as string
        if (activeBattleIds.has(bId)) {
          // We're driving this battle — route opponent's response to battleBus
          battleBus.emit(`${bId}:battle-debate-${msg.round}`, msg)
        } else {
          // We're the passive participant — generate and send a rebuttal
          handleBattleDebate(
            axl, brain, memory, incoming.from,
            msg as { battleId: string; round: number; text: string; fromPetId: number },
            PET_ID,
          ).catch((err: Error) => console.error(`[Pet ${PET_ID}] battle-debate error:`, err.message))
        }

      } else if (msg.type === 'battle-judge') {
        handleBattleJudge(
          axl, brain, incoming.from,
          msg as { battleId: string; transcript: unknown[]; pet1Id: number; pet2Id: number },
        ).catch((err: Error) => console.error(`[Pet ${PET_ID}] battle-judge error:`, err.message))

      } else if (msg.type === 'battle-accept' || msg.type === 'battle-vote') {
        battleBus.emit(`${msg.battleId as string}:${msg.type}`, msg)
      }
    } catch (err) {
      console.error(`[Pet ${PET_ID}] recv error:`, (err as Error).message)
    }
  }, 5_000)

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

main().catch((err) => {
  console.error(`[Pet ${PET_ID}] Fatal:`, err)
  process.exit(1)
})