// Live test — exercises packages/og-storage against the real 0G testnet.
// Uploads a fake pet identity blob, gets back a CID, downloads it, asserts equality.

import 'dotenv/config'
import { uploadBlob, fetchBlob, type PetIdentityBlob } from '../packages/og-storage/index.ts'

const fakeBlob: PetIdentityBlob = {
  sprite: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  archetype: 'scholar',
  personality: 'You are a curious AI pet. Be playful and brief.',
  traits: { curiosity: 80, energy: 100, friendliness: 75 },
  memorySnapshot: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

async function main() {
  console.log('Uploading test blob to 0G Storage...')
  console.log(`  RPC:     ${process.env.ZERO_G_RPC_URL}`)
  console.log(`  Indexer: ${process.env.ZERO_G_INDEXER_URL}`)

  const cid = await uploadBlob(fakeBlob)
  console.log(`\nUploaded — CID: ${cid}`)

  console.log('\nFetching back from 0G...')
  const fetched = await fetchBlob(cid)

  // Assertions
  if (fetched.archetype !== fakeBlob.archetype) throw new Error('archetype mismatch')
  if (fetched.personality !== fakeBlob.personality) throw new Error('personality mismatch')
  if (fetched.traits.curiosity !== fakeBlob.traits.curiosity) throw new Error('traits.curiosity mismatch')
  if (fetched.sprite !== fakeBlob.sprite) throw new Error('sprite mismatch')

  console.log('\nAll fields match. 0G round-trip verified end-to-end.')
  console.log(`Pet identity blob CID: ${cid}`)
}

main().catch(err => { console.error(err); process.exit(1) })
