// Live test for Karmanay's Phase 7b sprite-gen API.
// Calls Replicate via the package, gets back a sticker URL.
// Note: current model is text-to-image (ignores buffer/mimeType).

import 'dotenv/config'
import { pixelatePhoto } from '../packages/sprite-gen/index.ts'

async function main() {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('REPLICATE_API_TOKEN not set in .env')
    process.exit(1)
  }
  console.log('Calling Replicate via packages/sprite-gen.pixelatePhoto()...')
  const fakeBuffer = Buffer.from([])  // unused by current text-to-image model
  const result = await pixelatePhoto(fakeBuffer, 'image/jpeg')
  console.log('\nGot sprite URL:')
  console.log(' ', result.spriteUrl)
  console.log('\nPhase 7b sprite-gen verified end-to-end')
}

main().catch(err => { console.error(err); process.exit(1) })
