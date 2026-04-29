import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

// fofr/sticker-maker is text-to-image; generates a transparent-background pet sticker
const STICKER_MODEL = 'fofr/sticker-maker:4acb778eb059772225ec213948f0660867b2e03f277448f18cf1800b96a65a1a'

export async function pixelatePhoto(_imageBuffer: Buffer, _mimeType: string): Promise<{ spriteUrl: string }> {
  const output = await replicate.run(STICKER_MODEL, {
    input: {
      prompt: 'pixel art pet creature, 16-bit cute animal, chibi style, transparent background',
      negative_prompt: 'realistic, photo, blurry, text',
      steps: 17,
      width: 512,
      height: 512,
      number_of_images: 1,
      output_format: 'webp',
    },
  })

  const url = Array.isArray(output) ? output[0] : output
  if (typeof url !== 'string') throw new Error('Replicate returned unexpected output')
  return { spriteUrl: url }
}