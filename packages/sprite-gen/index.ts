// sprite-gen — Gemini 2.5 Flash Image (nano-banana) wrapper.
//
// Three input modalities:
//   * generateFromImage(buffer, mimeType, archetype?)  — image-to-image (camera or upload)
//   * generateFromPrompt(prompt, archetype?)            — text-to-image
//
// Both return raw PNG bytes (as Buffer). Caller is responsible for
// persistence (e.g. apps/web saves to public/sprites/<hash>.png and serves a URL).
//
// Output is post-processed with sharp: nearest-neighbor downsample to 64x64,
// then upsample to 256x256 — enforces a hard pixel grid so the sprite reads
// as 8/16-bit even when Gemini draws "pixel-ish" instead of true pixel art.

import { GoogleGenAI } from '@google/genai'
import sharp from 'sharp'

const MODEL = 'gemini-2.5-flash-image'

const STYLE_PROMPT =
  'Transform the input into a cute 16-bit pixel art creature sprite, ' +
  'chibi style, vivid saturated colors, sharp pixel edges, transparent background, ' +
  'centered, full body, facing the viewer. Match the subject\'s features ' +
  '(face shape, hair color, distinctive traits) so the sprite is recognizable.'

const PROMPT_STYLE_SUFFIX =
  ' — rendered as a 16-bit pixel art creature sprite, chibi style, vivid saturated ' +
  'colors, sharp pixel edges, transparent background, centered, facing viewer.'

function archetypeHint(archetype?: string): string {
  if (!archetype) return ''
  const map: Record<string, string> = {
    sage:    ' The creature looks calm, wise, with mystic blue/cyan accents.',
    gremlin: ' The creature looks mischievous, with magenta/pink accents.',
    athlete: ' The creature looks strong and energetic, with lime green accents.',
    joker:   ' The creature looks playful and silly, with yellow accents.',
    scholar: ' The creature looks studious and curious, with purple accents.',
  }
  return map[archetype] ?? ''
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  return new GoogleGenAI({ apiKey })
}

/// Extract the first inline image from a Gemini generateContent response.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractInlineImage(response: any): Buffer {
  const candidates = response?.candidates ?? []
  for (const cand of candidates) {
    const parts = cand?.content?.parts ?? []
    for (const part of parts) {
      if (part?.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64')
      }
    }
  }
  throw new Error('Gemini response contained no image data')
}

/// Pixel-grid post-processing: downsample to 64x64 with nearest-neighbor,
/// then upsample to 256x256 (also nearest-neighbor) so the result is hard pixels.
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
  /// Raw PNG bytes after pixel-grid post-processing. Caller persists.
  pngBytes: Buffer
  /// Source modality, for logging / analytics.
  source: 'image' | 'prompt'
}

/// Image-to-image: takes a user photo (camera frame or upload), returns
/// a recognizable pixel-art creature sprite.
export async function generateFromImage(
  buffer: Buffer,
  mimeType: string,
  archetype?: string,
): Promise<SpriteResult> {
  const client = getClient()
  const prompt = STYLE_PROMPT + archetypeHint(archetype)

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { data: buffer.toString('base64'), mimeType } },
        ],
      },
    ],
  })

  const raw = extractInlineImage(response)
  const pngBytes = await pixelize(raw)
  return { pngBytes, source: 'image' }
}

/// Text-to-image: takes a freeform prompt, returns a pixel-art creature sprite.
export async function generateFromPrompt(
  userPrompt: string,
  archetype?: string,
): Promise<SpriteResult> {
  const client = getClient()
  const prompt = userPrompt.trim() + PROMPT_STYLE_SUFFIX + archetypeHint(archetype)

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  })

  const raw = extractInlineImage(response)
  const pngBytes = await pixelize(raw)
  return { pngBytes, source: 'prompt' }
}

/// Back-compat shim. Older callers used pixelatePhoto and expected a hosted URL.
/// We now return a data: URL so the shape { spriteUrl } stays the same.
export async function pixelatePhoto(
  buffer: Buffer,
  mimeType: string,
): Promise<{ spriteUrl: string }> {
  const { pngBytes } = await generateFromImage(buffer, mimeType)
  return { spriteUrl: `data:image/png;base64,${pngBytes.toString('base64')}` }
}
