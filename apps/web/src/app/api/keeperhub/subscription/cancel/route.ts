// /api/keeperhub/subscription/cancel — STUB.
//
// Real flow: pet calls packages/keeperhub `createSubscriptionCancellation()`
// which schedules a one-shot tx to terminate the recurring USDC stream on
// SubscriptionRegistry. Returns a workflow id for tracking.

interface CancelPayload {
  petId: number
  subIds: string[]
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

  await new Promise((r) => setTimeout(r, 700))

  const totalSavingsUsdc = body.subIds.reduce((acc, id) => {
    const map: Record<string, number> = {
      sub_netflix: 15.49,
      sub_spotify: 9.99,
      sub_dropbox: 11.99,
      sub_nyt: 5.0,
      sub_chatgpt: 20.0,
    }
    return acc + (map[id] ?? 0)
  }, 0)

  return Response.json({
    workflowId: `kh_sub_${Date.now().toString(36)}`,
    cancelledSubIds: body.subIds,
    monthlySavingsUsdc: Math.round(totalSavingsUsdc * 100) / 100,
    annualSavingsUsdc: Math.round(totalSavingsUsdc * 12 * 100) / 100,
    status: 'scheduled',
    source: 'stub',
  })
}
