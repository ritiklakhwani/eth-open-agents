// /api/keeperhub/mailbox/send — proxy to Hub :3001 with payload translation.
//
// Frontend POSTs:    { fromPetId, toPetName, message, giftAmountUsdc }
// Hub expects:       { fromPetId, toPetId,   amountUSDC, message }
//
// We resolve toPetName → toPetId via Hub `/api/pets`.
//
// On Hub timeout/error we fall back to the canned response so the UI keeps
// working even when the Hub isn't running.

import { callHub, fetchPetByName, proxyOrFallback } from '@/lib/hub'

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

  const amountUSDC = String(body.giftAmountUsdc ?? 0)

  const result = await proxyOrFallback(
    async () => {
      const recipient = await fetchPetByName(body.toPetName)
      if (!recipient) return null   // unknown recipient → fall through to stub
      const hubResp = await callHub<{ ok?: boolean }>(
        '/api/keeperhub/mailbox/send',
        {
          method: 'POST',
          body: {
            fromPetId: body.fromPetId,
            toPetId:   recipient.token_id,
            amountUSDC,
            message: body.message.trim(),
          },
        },
      )
      if (!hubResp?.ok) return null
      return {
        // Hub returns just { ok: true } and the workflowId arrives via socket.io
        // later. Synthesize a placeholder id so the UI's "queued" panel still
        // has something to render. Source tag will be 'hub' so callers know it
        // was a real trigger.
        workflowId: `kh_mb_pending_${Date.now().toString(36)}`,
        status: 'pending',
        fromPetId: body.fromPetId,
        toPetName: body.toPetName,
        message: body.message.trim(),
        triggerCondition: 'target ENS lastSeenBlock within 30 blocks of head',
        estimatedDeliveryMs: 'when recipient comes online',
      }
    },
    () => ({
      workflowId: `kh_mb_${Date.now().toString(36)}`,
      status: 'pending',
      fromPetId: body.fromPetId,
      toPetName: body.toPetName,
      message: body.message.trim(),
      triggerCondition: 'target ENS lastSeenBlock within 30 blocks of head',
      estimatedDeliveryMs: 'when recipient comes online',
    }),
  )

  // Slight latency so the UI loading state is visible
  await new Promise((r) => setTimeout(r, 200))

  return Response.json(result)
}
