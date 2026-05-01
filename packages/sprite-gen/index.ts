// sprite-gen — OpenAI gpt-image-1 image-to-image with Pollinations fallback.
//
// Primary: OpenAI's gpt-image-1 model. For uploaded photos it preserves the
// subject's distinctive features (face shape, hair color) while transforming
// to 16-bit pixel art. This is the demo opener for the 0G iNFT track:
// "judge uploads face → recognizable pet appears in 5 seconds."
//
// Fallback: Pollinations text-to-image (free, no auth). Used when:
//   - OPENAI_API_KEY missing or revoked
//   - OpenAI 429 / billing issue / quota
//   - Moderation rejects the input image
// Pollinations doesn't accept an image input on free tier so the uploaded
// photo is ignored — UI still shows a creature, just not face-derived.
//
// Output post-processing: nearest-neighbor downsample to 64x64 then upsample
// to 256x256. Enforces a hard pixel grid even when the model draws "pixel-ish"
// instead of true pixel art.

import sharp from 'sharp'
import OpenAI from 'openai'
import { toFile } from 'openai/uploads'

// ── Pollinations (fallback) ──────────────────────────────────────────────────

const POLLINATIONS_URL = 'https://image.pollinations.ai/prompt'
const POLLINATIONS_MODEL = 'flux'

const STYLE_SUFFIX =
  ' rendered as a 16-bit pixel art creature sprite, chibi style, vivid saturated ' +
  'colors, sharp pixel edges, transparent background, centered, facing viewer'

// ── OpenAI primary ───────────────────────────────────────────────────────────

const OPENAI_MODEL = 'gpt-image-1'
const OPENAI_QUALITY: 'low' | 'medium' | 'high' = 'low'  // ~$0.011/image

const OPENAI_IMAGE_PROMPT =
  'Transform the input into a cute 16-bit pixel art creature sprite, chibi style, ' +
  'vivid saturated colors, sharp pixel edges, transparent background, centered, ' +
  "full body, facing the viewer. Match the subject's distinctive features (face shape, " +
  'hair color, ears, accessories) so the sprite is recognizable as them.'

const OPENAI_PROMPT_SUFFIX =
  ' rendered as a 16-bit pixel art creature sprite, chibi style, vivid saturated ' +
  'colors, sharp pixel edges, transparent background, centered, facing viewer.'

const ARCHETYPE_HINTS: Record<string, string> = {
  sage:    'a calm wise pet creature with mystic blue and cyan accents,',
  gremlin: 'a mischievous pet creature with magenta and pink accents,',
  athlete: 'a strong energetic pet creature with lime green accents,',
  joker:   'a playful silly pet creature with yellow accents and a goofy grin,',
  scholar: 'a curious studious pet creature with purple accents and round glasses,',
}

function archetypeHint(archetype?: string): string {
  if (!archetype) return ''
  return ' ' + (ARCHETYPE_HINTS[archetype] ?? '')
}

function buildPollinationsPrompt(userPrompt: string | null, archetype?: string): string {
  const arch = archetype ? ARCHETYPE_HINTS[archetype] ?? '' : ''
  const seed = userPrompt && userPrompt.trim().length > 0
    ? userPrompt.trim()
    : (arch || 'a cute pet creature')
  return [arch, seed, STYLE_SUFFIX].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

async function openAIImageToImage(buffer: Buffer, mimeType: string, archetype?: string): Promise<Buffer> {
  const client = getOpenAI()
  if (!client) throw new Error('OPENAI_API_KEY not set')

  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  const file = await toFile(buffer, `photo.${ext}`, { type: mimeType })

  const resp = await client.images.edit({
    model:   OPENAI_MODEL,
    image:   file,
    prompt:  OPENAI_IMAGE_PROMPT + archetypeHint(archetype),
    size:    '1024x1024',
    quality: OPENAI_QUALITY,
    n:       1,
  })

  const b64 = resp.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI returned no image')
  return Buffer.from(b64, 'base64')
}

async function openAITextToImage(userPrompt: string, archetype?: string): Promise<Buffer> {
  const client = getOpenAI()
  if (!client) throw new Error('OPENAI_API_KEY not set')

  const prompt = userPrompt.trim() + OPENAI_PROMPT_SUFFIX + archetypeHint(archetype)

  const resp = await client.images.generate({
    model:   OPENAI_MODEL,
    prompt,
    size:    '1024x1024',
    quality: OPENAI_QUALITY,
    n:       1,
  })

  const b64 = resp.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI returned no image')
  return Buffer.from(b64, 'base64')
}

async function fetchPollinations(prompt: string): Promise<Buffer> {
  const params = new URLSearchParams({
    model: POLLINATIONS_MODEL,
    width: '512',
    height: '512',
    nologo: 'true',
    enhance: 'true',
  })
  const url = `${POLLINATIONS_URL}/${encodeURIComponent(prompt)}?${params.toString()}`
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) {
    throw new Error(`Pollinations returned ${res.status}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

async function pixelize(pngBytes: Buffer): Promise<Buffer> {
  return sharp(pngBytes)
    .resize(64, 64, {
      kernel: sharp.kernel.nearest,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(256, 256, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer()
}

export interface SpriteResult {
  pngBytes: Buffer
  /// 'image' for image-to-image, 'prompt' for text-to-image. Provider info
  /// (openai vs pollinations) is logged but not exposed in the type to keep
  /// the API stable for callers.
  source: 'image' | 'prompt'
}

/// Image-to-image: tries OpenAI gpt-image-1 first (preserves face features),
/// falls back to Pollinations text-to-image when OpenAI fails.
export async function generateFromImage(
  buffer: Buffer,
  mimeType: string,
  archetype?: string,
): Promise<SpriteResult> {
  let raw: Buffer
  try {
    raw = await openAIImageToImage(buffer, mimeType, archetype)
    console.log('[sprite-gen] OpenAI image-to-image OK')
  } catch (err) {
    console.warn(
      `[sprite-gen] OpenAI failed (${(err as Error).message.slice(0, 80)}) — falling back to Pollinations`,
    )
    const prompt = buildPollinationsPrompt(null, archetype)
    raw = await fetchPollinations(prompt)
  }
  const pngBytes = await pixelize(raw)
  return { pngBytes, source: 'image' }
}

/// Text-to-image: tries OpenAI first, falls back to Pollinations.
export async function generateFromPrompt(
  userPrompt: string,
  archetype?: string,
): Promise<SpriteResult> {
  let raw: Buffer
  try {
    raw = await openAITextToImage(userPrompt, archetype)
    console.log('[sprite-gen] OpenAI text-to-image OK')
  } catch (err) {
    console.warn(
      `[sprite-gen] OpenAI failed (${(err as Error).message.slice(0, 80)}) — falling back to Pollinations`,
    )
    const prompt = buildPollinationsPrompt(userPrompt, archetype)
    raw = await fetchPollinations(prompt)
  }
  const pngBytes = await pixelize(raw)
  return { pngBytes, source: 'prompt' }
}

/// Back-compat shim. Older callers used pixelatePhoto and expected a hosted URL.
export async function pixelatePhoto(
  buffer: Buffer,
  mimeType: string,
): Promise<{ spriteUrl: string }> {
  const { pngBytes } = await generateFromImage(buffer, mimeType)
  return { spriteUrl: `data:image/png;base64,${pngBytes.toString('base64')}` }
}
