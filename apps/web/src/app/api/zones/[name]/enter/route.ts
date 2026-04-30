// /api/zones/[name]/enter — pet entered a zone in the world.
// Karmanay's onZoneEnter helper POSTs here. We log it; future iterations
// will fire KeeperHub workflows (e.g. office zone → subscription scan).

type Zone = 'park' | 'office' | 'arena' | 'lounge' | 'kitchen' | 'mailbox'
const VALID_ZONES: Set<Zone> = new Set(['park', 'office', 'arena', 'lounge', 'kitchen', 'mailbox'])

interface ZoneEnterPayload {
  petId: number
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params

  if (!VALID_ZONES.has(name as Zone)) {
    return Response.json({ error: `unknown zone: ${name}` }, { status: 400 })
  }

  let payload: ZoneEnterPayload
  try {
    payload = await req.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (typeof payload?.petId !== 'number') {
    return Response.json({ error: 'petId required' }, { status: 400 })
  }

  console.log(`[zones] pet ${payload.petId} entered ${name}`)

  // TODO Phase 9 follow-up: trigger zone-specific actions
  //  - office → fire Subscription Pet workflow scan
  //  - arena → join battle queue
  //  - kitchen → restore stats
  //  - mailbox → check pending KeeperHub mailbox deliveries
  //  - lounge → open owner-pet 1:1 chat modal (handled client-side via UI)

  return Response.json({ ok: true, zone: name, petId: payload.petId })
}
