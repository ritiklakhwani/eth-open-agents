// /api/keeperhub/mailbox/send — STUB.
//
// Real flow: frontend POSTs gift details → Hub IPC to sender's pet worker →
// pet activity calls packages/keeperhub `createConditionalMailbox()` → returns
// workflow id. Until Karmanay's activity lands, this returns a canned id so the
// modal demos end-to-end.

interface SendPayload {
  fromPetId: number
  toPetName: string
  message: string
  giftAmountUsdc?: number
}

export async function POST(req: Request) {
  let body: SendPayload
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body.fromPetId || !body.toPetName || !body.message) {
    return Response.json(
      { error: 'fromPetId, toPetName, message required' },
      { status: 400 },
    )
  }

  // Simulate slight latency so the UI loading state is visible
  await new Promise((r) => setTimeout(r, 600))

  return Response.json({
    workflowId: `kh_mb_${Date.now().toString(36)}`,
    status: 'pending',
    fromPetId: body.fromPetId,
    toPetName: body.toPetName,
    triggerCondition: `target ENS lastSeenBlock within 5 of head`,
    estimatedDeliveryMs: 'when recipient comes online',
    source: 'stub',
  })
}
