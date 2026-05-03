// GET /api/battle/pending-for-pet?petId= — proxy Hub: active battles for this pet
// (so the opponent can resume the same `battleId` / escrow key to stake).

import { HUB_URL } from '@/lib/hub'

export async function GET(req: Request) {
  const petId = new URL(req.url).searchParams.get('petId')
  if (!petId || !Number.isFinite(Number(petId)) || Number(petId) <= 0) {
    return Response.json({ error: 'petId required', battles: [] }, { status: 400 })
  }
  try {
    const res = await fetch(
      `${HUB_URL}/api/battle/pending-for-pet?petId=${encodeURIComponent(petId)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) {
      return Response.json({ battles: [], source: 'hub-error' as const })
    }
    const json = (await res.json()) as { battles?: unknown[] }
    return Response.json({
      battles: Array.isArray(json.battles) ? json.battles : [],
      source:      'hub' as const,
    })
  } catch {
    return Response.json({ battles: [], source: 'offline' as const })
  }
}
