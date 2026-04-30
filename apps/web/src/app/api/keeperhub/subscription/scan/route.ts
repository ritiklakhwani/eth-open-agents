// /api/keeperhub/subscription/scan — STUB.
//
// Real flow: pet Brain (Sonnet, capped 5/day) inspects owner's recurring tx
// history, classifies subs as used/unused. Returns the proposal list for
// owner approval. Until Karmanay's activity lands, returns a canned 5-item
// list with one obvious cancel candidate.

export async function POST(req: Request) {
  let body: { petId?: number }
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  if (!body.petId) {
    return Response.json({ error: 'petId required' }, { status: 400 })
  }

  // Simulate "pet thinking" latency
  await new Promise((r) => setTimeout(r, 1100))

  return Response.json({
    petId: body.petId,
    scannedAt: Date.now(),
    subscriptions: [
      {
        id: 'sub_netflix',
        name: 'Netflix',
        amountUsdc: 15.49,
        frequency: 'monthly',
        lastUsedDays: 42,
        recommendation: 'CANCEL',
        reason: 'No login activity in 42 days. You watched Stranger Things and stopped.',
      },
      {
        id: 'sub_spotify',
        name: 'Spotify',
        amountUsdc: 9.99,
        frequency: 'monthly',
        lastUsedDays: 1,
        recommendation: 'KEEP',
        reason: 'Daily listening, 14h this week.',
      },
      {
        id: 'sub_dropbox',
        name: 'Dropbox Plus',
        amountUsdc: 11.99,
        frequency: 'monthly',
        lastUsedDays: 28,
        recommendation: 'REVIEW',
        reason: 'Storage at 2% capacity. Could downgrade to free tier.',
      },
      {
        id: 'sub_nyt',
        name: 'NYT Cooking',
        amountUsdc: 5.0,
        frequency: 'monthly',
        lastUsedDays: 67,
        recommendation: 'CANCEL',
        reason: 'Not opened since February. You saved 0 recipes.',
      },
      {
        id: 'sub_chatgpt',
        name: 'ChatGPT Plus',
        amountUsdc: 20.0,
        frequency: 'monthly',
        lastUsedDays: 0,
        recommendation: 'KEEP',
        reason: 'Active daily.',
      },
    ],
    petCommentary:
      "I found two clear cancellations and one downgrade. " +
      "If you approve all, I'll save you $32.48 every month. " +
      "Want me to schedule them?",
    source: 'stub',
  })
}
