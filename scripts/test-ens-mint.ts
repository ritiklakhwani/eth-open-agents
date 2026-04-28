// Live smoke test for packages/ens/.
// Mints smoketest.tama.eth pointing at the pet's smart wallet, with peerId + blob CID
// as text records. Then reads everything back to verify.

import 'dotenv/config'
import {
  mintPetSubname,
  readPeerIdFromENS,
  readBlobCIDFromENS,
  readPetAddrFromENS,
  petNamehashViaENS,
} from '../packages/ens/index.ts'
import type { Hex, Address } from 'viem'

const RPC_URL = process.env.SEPOLIA_RPC_URL!
const SIGNER_KEY = process.env.DEPLOYER_PRIVATE_KEY! as Hex

// Fresh test pet — independent from Phase 2 smoke pet (which had a partial subname from earlier debugging run)
const PET_NAME = 'testpet'
const PET_WALLET: Address = '0xf3aC1b8311Eabea1b22fC91681dd7A6e429a11E1'  // pet 1's CREATE2 wallet
const FAKE_PEER_ID = 'a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345'  // 64 hex chars (mock for ENS test)
const FAKE_BLOB_CID = 'bafyTestPetCID'

async function main() {
  console.log(`\nMinting ${PET_NAME}.tama.eth ...`)
  console.log(`  pet wallet: ${PET_WALLET}`)
  console.log(`  peerId:     ${FAKE_PEER_ID}`)
  console.log(`  blobCID:    ${FAKE_BLOB_CID}`)
  console.log(`  namehash:   ${petNamehashViaENS(PET_NAME)}`)

  const result = await mintPetSubname({
    petName: PET_NAME,
    petWalletAddress: PET_WALLET,
    peerId: FAKE_PEER_ID,
    blobCID: FAKE_BLOB_CID,
    rpcUrl: RPC_URL,
    signerKey: SIGNER_KEY,
  })

  console.log('\nMinted')
  console.log(`  subname tx:  ${result.subnameTxHash}`)
  console.log(`  setAddr tx:  ${result.setAddrTxHash}`)
  console.log(`  setText txs: ${JSON.stringify(result.setTextTxHashes)}`)

  console.log('\nWaiting 12s for blocks to confirm...')
  await new Promise(r => setTimeout(r, 12000))

  console.log('\nReading back from ENS:')
  const addr = await readPetAddrFromENS(PET_NAME, RPC_URL)
  const peerId = await readPeerIdFromENS(PET_NAME, RPC_URL)
  const blob = await readBlobCIDFromENS(PET_NAME, RPC_URL)

  console.log(`  addr:      ${addr}`)
  console.log(`  peerId:    ${peerId}`)
  console.log(`  blobCID:   ${blob}`)

  // Assertions
  if (addr.toLowerCase() !== PET_WALLET.toLowerCase()) throw new Error(`addr mismatch: ${addr} vs ${PET_WALLET}`)
  if (peerId !== FAKE_PEER_ID) throw new Error(`peerId mismatch: "${peerId}" vs "${FAKE_PEER_ID}"`)
  if (blob !== FAKE_BLOB_CID) throw new Error(`blobCID mismatch: "${blob}" vs "${FAKE_BLOB_CID}"`)

  console.log('\nAll reads match — Phase 3 ENS package working end-to-end on Sepolia')
}

main().catch(err => { console.error(err); process.exit(1) })
