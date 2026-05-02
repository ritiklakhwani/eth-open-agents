// /api/pets/sprite/breed — generate a child pet sprite that visually blends
// two parent sprites via OpenAI gpt-image-1 multi-image edit.
//
// Input (JSON body):
//   { parentASpriteUrl: string, parentBSpriteUrl: string, childName?, archetype? }
//
// Both URLs may be:
//   * Relative paths (e.g. "/sprites/<hash>.png") — resolved against the
//     same Next.js origin so the file is loaded from /public.
//   * Absolute http(s) URLs — fetched as-is.
//
// Output: { spriteUrl: string, source: 'image' } — same shape as /api/pets/sprite,
// so AdoptionFlow / BreedingFlow can use it interchangeably.

import { generateFromTwoImages } from 'sprite-gen'
import { writeFile, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { createHash } from 'crypto'

const SPRITES_DIR = resolve(process.cwd(), 'public', 'sprites')

async function ensureDir() {
  if (!existsSync(SPRITES_DIR)) await mkdir(SPRITES_DIR, { recursive: true })
}

async function persistSprite(pngBytes: Buffer): Promise<string> {
  await ensureDir()
  const hash = createHash('sha256').update(pngBytes).digest('hex').slice(0, 16)
  const filename = `${hash}.png`
  await writeFile(resolve(SPRITES_DIR, filename), pngBytes)
  return `/sprites/${filename}`
}

/// Load a sprite either from disk (if relative path under /sprites/) or via
/// HTTP fetch (absolute URL). Returns the PNG bytes + a guessed mime.
async function loadSprite(url: string): Promise<{ buffer: Buffer; mime: string }> {
  if (url.startsWith('/sprites/')) {
    const filename = url.replace(/^\/sprites\//, '').split('?')[0]
    const path = resolve(SPRITES_DIR, filename)
    if (!existsSync(path)) {
      throw new Error(`local sprite not found: ${path}`)
    }
    const buf = await readFile(path)
    return { buffer: buf, mime: 'image/png' }
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`sprite fetch ${res.status}: ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const mime = res.headers.get('content-type') ?? 'image/png'
  return { buffer: buf, mime }
}

interface BreedPayload {
  parentASpriteUrl: string
  parentBSpriteUrl: string
  childName?: string
  archetype?: string
}

export async function POST(req: Request) {
  let body: BreedPayload
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.parentASpriteUrl || !body.parentBSpriteUrl) {
    return Response.json(
      { error: 'parentASpriteUrl and parentBSpriteUrl required' },
      { status: 400 },
    )
  }

  try {
    const [a, b] = await Promise.all([
      loadSprite(body.parentASpriteUrl),
      loadSprite(body.parentBSpriteUrl),
    ])
    const { pngBytes } = await generateFromTwoImages(
      a.buffer, a.mime,
      b.buffer, b.mime,
      { childName: body.childName, archetype: body.archetype },
    )
    const spriteUrl = await persistSprite(pngBytes)
    return Response.json({ spriteUrl, source: 'breed' })
  } catch (err) {
    console.error('[api/pets/sprite/breed] failed:', err)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
