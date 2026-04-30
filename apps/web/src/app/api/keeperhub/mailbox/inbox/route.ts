// /api/keeperhub/mailbox/inbox — STUB.
//
// Returns canned pending + delivered gifts for the pet so the inbox panel
// has something to render. Will be replaced by a Hub query against the
// keeperhub_workflows table joined with delivery state.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const petId = Number(searchParams.get('petId'))
  if (!Number.isFinite(petId)) {
    return Response.json({ error: 'petId required' }, { status: 400 })
  }

  return Response.json({
    petId,
    inbox: [
      {
        id: 'kh_mb_demo01',
        from: 'rusty.tama.eth',
        message: 'Saw this and thought of you, friend.',
        giftAmountUsdc: 5,
        deliveredAt: Date.now() - 1000 * 60 * 23,
        status: 'delivered',
      },
      {
        id: 'kh_mb_demo02',
        from: 'tofu.tama.eth',
        message: 'Park later? Bring your A-game.',
        giftAmountUsdc: 0,
        deliveredAt: Date.now() - 1000 * 60 * 60 * 4,
        status: 'delivered',
      },
    ],
    pending: [
      {
        id: 'kh_mb_pending01',
        to: 'mira.tama.eth',
        message: 'Welcome back!',
        giftAmountUsdc: 2,
        triggerCondition: 'recipient online',
        status: 'pending',
      },
    ],
    source: 'stub',
  })
}
