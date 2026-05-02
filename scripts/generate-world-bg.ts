// Generate the PetCity world background via OpenAI gpt-image-1.
//
// Output: apps/web/public/world-bg.png
//
// Layout encoded into the prompt is mirrored by partner-zone coords in
// world.tmj — keeping prompt + zones in sync is what lets pets walk into
// the right partner building.
//
// Run:  tsx scripts/generate-world-bg.ts
//       tsx scripts/generate-world-bg.ts --force   (overwrite existing)
//       tsx scripts/generate-world-bg.ts --quality high  (default: medium)

import 'dotenv/config'
import OpenAI from 'openai'
import { writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const OUT_PATH = resolve(process.cwd(), 'apps/web/public/world-bg.png')

const args = new Set(process.argv.slice(2))
const force = args.has('--force')
const qualityArg = (() => {
  const i = process.argv.indexOf('--quality')
  return i >= 0 ? process.argv[i + 1] : 'medium'
})() as 'low' | 'medium' | 'high'

const PROMPT = `
Top-down 16-bit pixel art map of a cozy night town, square 1024x1024 view.

LAYOUT (strictly follow this spatial composition):
- TOP-LEFT QUADRANT (0-600 px wide, 0-220 px tall): a row of FOUR distinct
  partner buildings, side by side, each roughly 120 pixels wide:
    1. Leftmost: blue clinic with a rooftop satellite-dish / antenna,
       glowing cyan windows (mesh network communication theme).
    2. Left-center: green-roofed registry office with a wooden signpost
       and parchment scrolls in the window (name registry theme).
    3. Right-center: orange forge / workshop with a tall chimney emitting
       warm smoke and an anvil silhouette in front (automation forge theme).
    4. Rightmost: purple stone vault with glowing magenta crystal windows
       and a heavy reinforced door (storage vault theme).
  Each partner building has a clearly different color and silhouette so
  they are immediately distinguishable from above.

- BOTTOM-LEFT QUADRANT (0-600 px wide, 220-450 px tall): cluster of 4-5
  smaller cozy civilian houses with red or brown pitched roofs, lit yellow
  windows, wooden doors. Cobblestone or dirt path runs between them.

- TOP-RIGHT QUADRANT (650-1024 px wide, 0-450 px tall): half-timbered
  greenhouse / breeding hall with a translucent cyan glass roof and stone
  base. A small statue or fountain to its right.

- BOTTOM-RIGHT QUADRANT (650-1024 px wide, 450-1024 px tall): dark stone
  battlefield arena with cracked tile floor and a tall glowing purple
  portal frame at its center. Faint magenta runes around the portal.

- CENTER (300-650 px wide, 450-700 px tall): central park with a stone
  fountain (tiered, water flowing), wooden benches around it, and 4-5
  scattered round-canopy trees.

- BOTTOM-LEFT (0-300 px wide, 700-1024 px tall): dark blue pond with
  water reflections, lily pads, surrounded by a few reeds.

CONNECTING ELEMENTS:
- Dirt or cobble paths weaving between every zone.
- Warm-glow lampposts spaced along the paths (small yellow halos).
- Pine and round-leaf trees scattered along map edges and rocky borders.
- Rocky cliffs / dark forest line the outer map edges.

ATMOSPHERE:
- Night setting, deep navy / indigo overall tone.
- Building windows lit warm yellow / orange.
- Lamppost glows visible.
- Cozy farm-sim aesthetic similar to Stardew Valley night scenes.

STRICT CONSTRAINTS:
- NO text, NO words, NO letters, NO signs with readable writing.
- NO UI elements, NO icons, NO HUD.
- NO characters, NO people, NO animals, NO pets visible (pets are added at runtime).
- Single flat top-down image, NOT isometric.
- Pixel art style, vivid saturated palette, sharp pixel edges.
`.trim()

async function main() {
  if (existsSync(OUT_PATH) && !force) {
    console.log(`[world-bg] ${OUT_PATH} already exists. Pass --force to regenerate.`)
    process.exit(0)
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('[world-bg] OPENAI_API_KEY missing in .env or .env.local')
    process.exit(1)
  }

  const client = new OpenAI({ apiKey })

  console.log(`[world-bg] generating at quality=${qualityArg}, this takes 30-90s...`)
  const start = Date.now()

  const resp = await client.images.generate({
    model: 'gpt-image-1',
    prompt: PROMPT,
    size: '1024x1024',
    quality: qualityArg,
    n: 1,
  })

  const b64 = resp.data?.[0]?.b64_json
  if (!b64) {
    console.error('[world-bg] OpenAI returned no image. Response:', JSON.stringify(resp).slice(0, 500))
    process.exit(1)
  }

  const buf = Buffer.from(b64, 'base64')
  writeFileSync(OUT_PATH, buf)

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[world-bg] wrote ${OUT_PATH} (${(buf.length / 1024).toFixed(0)} KB) in ${elapsed}s`)
}

main().catch((err) => {
  console.error('[world-bg] failed:', err)
  process.exit(1)
})
