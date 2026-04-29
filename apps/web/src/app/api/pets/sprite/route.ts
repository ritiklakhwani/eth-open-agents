import { pixelatePhoto } from 'sprite-gen'

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('photo') as File | null
  if (!file) return Response.json({ error: 'no photo' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    const result = await pixelatePhoto(buffer, file.type)
    return Response.json(result)
  } catch (err) {
    console.error(err)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}