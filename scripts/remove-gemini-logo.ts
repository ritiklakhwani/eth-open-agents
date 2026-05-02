// Patch over the Gemini watermark in the bottom-right of world-bg.png by
// extracting a clean region from a nearby part of the image and pasting it
// over the logo area. Cheaper than re-running image gen.
//
// Run:  pnpm tsx scripts/remove-gemini-logo.ts

import sharp from 'sharp'
import { resolve } from 'path'

const TARGET = resolve(process.cwd(), 'apps/web/public/world-bg.png')

async function main() {
  const meta = await sharp(TARGET).metadata()
  const W = meta.width!
  const H = meta.height!

  const PATCH_W = 110
  const PATCH_H = 80

  const dstX = W - PATCH_W
  const dstY = H - PATCH_H

  // Sample a clean dark stone region from the upper part of battlefield,
  // blur it heavily so any detail (runes / cracks) becomes a soft flat field
  // that blends with the surrounding battlefield without an obvious seam.
  const sample = await sharp(TARGET)
    .extract({ left: 970, top: 440, width: PATCH_W, height: PATCH_H })
    .blur(20)
    .toBuffer()

  const tmp = await sharp(TARGET)
    .composite([{ input: sample, top: dstY, left: dstX }])
    .png()
    .toBuffer()

  await sharp(tmp).toFile(TARGET)
  console.log(`[remove-gemini-logo] blurred-patched ${PATCH_W}x${PATCH_H} at (${dstX}, ${dstY})`)
}

main().catch((err) => {
  console.error('[remove-gemini-logo] failed:', err)
  process.exit(1)
})
