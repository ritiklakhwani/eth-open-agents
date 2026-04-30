// /api/keeperhub/subscription/cancel — proxy to Hub :3001.
//
// Frontend POSTs:    { petId, subIds[] }      where each id is a string slug
// Hub expects:       POST /approve { petId, subscriptionId }   (single numeric)
//
// We loop over subIds, calling Hub /approve once per cancellation. Each call
// returns { ok: true } and the workflow id arrives via socket.io. We synthesize
// the savings response shape the UI expects regardless of where the data came from.

import { callHub } from '@/lib/hub'

interface CancelPayload {
  petId: number
  subIds: string[]
}

// Map UI string ids → numeric ids the Hub uses for SubscriptionRegistry
const SUB_ID_TO_NUM: Record<string, number> = {
  sub_netflix: 1,
  sub_spotify: 2,
  sub_dropbox: 3,
  sub_nyt:     4,
  sub_chatgpt: 5,
}

const SUB_ID_TO_AMOUNT: Record<string, number> = {
  sub_netflix: 15.49,
  sub_spotify:  9.99,
  sub_dropbox: 11.99,
  sub_nyt:      5.0,
  sub_chatgpt: 20.0,
}

export async function POST(req: Request) {
  let body: CancelPayload
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.petId || !Array.isArray(body.subIds) || body.subIds.length === 0) {
    return Response.json({ error: 'petId, subIds[] required' }, { status: 400 })
  }

  // Fire one Hub call per cancellation
  const hubAcks = await Promise.all(
    body.subIds.map((slug) => {
      const numericId = SUB_ID_TO_NUM[slug]
      if (numericId == null) return Promise.resolve(null)
      return callHub<{ ok?: boolean }>('/api/keeperhub/subscription/approve', {
        method: 'POST',
        body: { petId: body.petId, subscriptionId: numericId },
      })
    }),
  )

  const allHubOk = hubAcks.every((a) => a?.ok === true)
  const anyHubOk = hubAcks.some((a) => a?.ok === true)

  await new Promise((r) => setTimeout(r, 500))

  const totalSavingsUsdc = body.subIds.reduce(
    (acc, id) => acc + (SUB_ID_TO_AMOUNT[id] ?? 0),
    0,
  )

  return Response.json({
    workflowId: `kh_sub_${Date.now().toString(36)}`,
    cancelledSubIds: body.subIds,
    monthlySavingsUsdc: Math.round(totalSavingsUsdc * 100) / 100,
    annualSavingsUsdc:  Math.round(totalSavingsUsdc * 12 * 100) / 100,
    status: 'scheduled',
    source: allHubOk ? 'hub' : anyHubOk ? 'partial' : 'stub',
  })
}
