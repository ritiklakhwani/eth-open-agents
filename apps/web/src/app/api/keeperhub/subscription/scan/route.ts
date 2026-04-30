// /api/keeperhub/subscription/scan — proxy to Hub :3001.
//
// Hub returns { ok: true } immediately and the actual proposals arrive over
// socket.io later (Brain.decide() takes a few seconds). For UI ergonomics
// we ALWAYS return our rich canned proposal list right away so the review
// screen has something to render. When the Hub is up, we ALSO fire the
// trigger so the real workflow gets registered in SQLite for logs.
//
// Follow-up: subscribe to socket.io 'activity' events in SubscriptionPanel
// and replace canned proposals with the real Hub-emitted ones.

import { callHub } from '@/lib/hub'

interface ScanPayload {
  petId: number
}

export async function POST(req: Request) {
  let body: ScanPayload
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.petId) {
    return Response.json({ error: 'petId required' }, { status: 400 })
  }

  // Fire the Hub trigger fire-and-forget; the brain takes a few seconds and
  // the result comes via socket.io. We don't wait for it.
  const hubAck = await callHub<{ ok?: boolean }>(
    '/api/keeperhub/subscription/scan',
    { method: 'POST', body: { petId: body.petId } },
  )

  // Simulate "pet thinking" latency for visual feedback
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
    source: hubAck?.ok ? 'hub' : 'stub',
  })
}
