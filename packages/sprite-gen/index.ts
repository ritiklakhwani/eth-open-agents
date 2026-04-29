import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

const PIXEL_ART_MODEL = 'fofr/sticker-maker' as `${string}/${string}`

export async function pixelatePhoto(imageBuffer: Buffer, mimeType: string): Promise<{ spriteUrl: string }> {
  const dataUri = `data:${mimeType};base64,${imageBuffer.toString('base64')}`

  const output = await replicate.run(PIXEL_ART_MODEL, {
    input: {
      image: dataUri,
      prompt: 'pixel art pet, 32x32, 16-bit cute creature, transparent background',
    },
  })

  const url = Array.isArray(output) ? output[0] : output
  if (typeof url !== 'string') throw new Error('Replicate returned unexpected output')
  return { spriteUrl: url }
}