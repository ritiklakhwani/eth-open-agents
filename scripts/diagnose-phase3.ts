// Diagnose Phase 3 ENS state for all alive pets.
//
//   1. Lists every pet with a peer_id from the Hub
//   2. For each, checks Sepolia ENS for: addr() / tama.peerId / tama.lastSeenBlock
//   3. Reports which step (A2 mint, A3 heartbeat) succeeded per pet
//
// Run after `pnpm exec tsx apps/hub/src/index.ts` is up.

import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
config({ path: path.resolve(path.dirname(__filename), '..', '.env') })

import { readPetAddrFromENS, readPeerIdFromENS, readTextRecord } from 'ens'

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3001'

interface PetRow {
  token_id: number
  name: string
  wallet_address: string | null
  peer_id: string | null
}

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL
  if (!rpcUrl) throw new Error('SEPOLIA_RPC_URL not set')

  console.log(`Fetching pets from Hub at ${HUB_URL}...\n`)
  const res = await fetch(`${HUB_URL}/api/pets`)
  if (!res.ok) throw new Error(`Hub fetch failed: ${res.status}`)
  const all = (await res.json()) as PetRow[]
  const alive = all.filter((p) => p.peer_id && p.peer_id !== '' && p.peer_id !== 'fakepeer2')

  console.log(`Total pets in DB: ${all.length}`)
  console.log(`Pets with real peer_id: ${alive.length}\n`)

  let mintedCount = 0
  let heartbeatCount = 0
  console.log(`${'pet'.padEnd(4)} ${'name'.padEnd(12)} ${'A2 ENS addr'.padEnd(45)} ${'A3 lastSeenBlock'}`)
  console.log('-'.repeat(110))

  for (const pet of alive) {
    let addr: string
    let peerInEns: string
    let lastSeen: string
    try {
      addr = await readPetAddrFromENS(pet.name, rpcUrl)
    } catch (e) {
      addr = `ERR ${(e as Error).message.slice(0, 20)}`
    }
    try {
      peerInEns = await readPeerIdFromENS(pet.name, rpcUrl)
    } catch {
      peerInEns = ''
    }
    try {
      lastSeen = await readTextRecord(pet.name, 'tama.lastSeenBlock', rpcUrl)
    } catch {
      lastSeen = ''
    }

    const a2 = addr && addr !== '0x0000000000000000000000000000000000000000'
      ? `OK ${addr.slice(0, 10)}…${addr.slice(-4)}`
      : 'MISSING (Phase 3 not minted)'
    const a3 = lastSeen && lastSeen !== '0' && lastSeen !== ''
      ? `OK block ${lastSeen}`
      : 'MISSING (heartbeat not run)'

    if (addr && addr !== '0x0000000000000000000000000000000000000000') mintedCount++
    if (lastSeen && lastSeen !== '0' && lastSeen !== '') heartbeatCount++

    console.log(`${String(pet.token_id).padEnd(4)} ${pet.name.padEnd(12)} ${a2.padEnd(45)} ${a3}`)
  }

  console.log('-'.repeat(110))
  console.log(`\nA2 (subname mint):       ${mintedCount}/${alive.length} pets`)
  console.log(`A3 (lastSeenBlock):      ${heartbeatCount}/${alive.length} pets`)
  console.log(`A5 (mailbox auto-fire):  requires A3 ≥ 1 → ${heartbeatCount >= 1 ? 'READY' : 'BLOCKED'}`)
  console.log()

  if (mintedCount === 0) {
    console.log('Diagnosis: Hub running OLD CODE — restart Hub to pick up Phase 3 mint logic.')
  } else if (mintedCount < alive.length) {
    console.log(`Diagnosis: ${alive.length - mintedCount} pets still pending. Wait or check Hub log for "[Pet N] ENS mint skipped" warnings.`)
  } else if (heartbeatCount === 0) {
    console.log('Diagnosis: ENS minted, but heartbeat tick has not fired yet. Wait 30s after Hub boot.')
  } else {
    console.log('Diagnosis: A2 + A3 + A5 fully working.')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
