// /api/pets/sprite — generate a pixel-art pet sprite via Gemini 2.5 Flash Image.
//
// Three input modalities (multipart/form-data):
//   * field "photo"  (File)   → image-to-image (camera capture or file upload)
//   * field "prompt" (string) → text-to-image
//   * field "archetype" (string, optional) → biases the style hint
//
// Output: { spriteUrl: string } — relative URL under /sprites/<sha256>.png.
// Files are persisted to apps/web/public/sprites/ so they're served by Next.

import { generateFromImage, generateFromPrompt } from 'sprite-gen'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { createHash } from 'crypto'

const SPRITES_DIR = resolve(process.cwd(), 'public', 'sprites')

async function ensureDir() {
  if (!existsSync(SPRITES_DIR)) {
    await mkdir(SPRITES_DIR, { recursive: true })
  }
}

async function persistSprite(pngBytes: Buffer): Promise<string> {
  await ensureDir()
  const hash = createHash('sha256').update(pngBytes).digest('hex').slice(0, 16)
  const filename = `${hash}.png`
  await writeFile(resolve(SPRITES_DIR, filename), pngBytes)
  return `/sprites/${filename}`
}

export async function POST(req: Request) {
  const formData = await req.formData().catch(() => null)
  if (!formData) {
    return Response.json({ error: 'multipart/form-data required' }, { status: 400 })
  }

  const photo = formData.get('photo') as File | null
  const prompt = formData.get('prompt') as string | null
  const archetype = (formData.get('archetype') as string | null) ?? undefined

  try {
    if (photo && photo.size > 0) {
      const buffer = Buffer.from(await photo.arrayBuffer())
      const { pngBytes } = await generateFromImage(buffer, photo.type || 'image/jpeg', archetype)
      const spriteUrl = await persistSprite(pngBytes)
      return Response.json({ spriteUrl, source: 'image' })
    }

    if (prompt && prompt.trim().length > 0) {
      const { pngBytes } = await generateFromPrompt(prompt, archetype)
      const spriteUrl = await persistSprite(pngBytes)
      return Response.json({ spriteUrl, source: 'prompt' })
    }

    return Response.json(
      { error: 'either "photo" file or "prompt" string required' },
      { status: 400 },
    )
  } catch (err) {
    console.error('[api/pets/sprite] generation failed:', err)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
