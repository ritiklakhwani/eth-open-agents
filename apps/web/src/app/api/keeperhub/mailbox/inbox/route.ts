// /api/keeperhub/mailbox/inbox — proxy to Hub for real mailbox workflow state.
// Falls back to canned data when the Hub is unreachable so the UI keeps
// rendering during local dev or pre-Hub-boot.

import { callHub, proxyOrFallback } from '@/lib/hub'

interface InboxItem {
  id: string
  from: string
  message: string
  giftAmountUsdc: number
  deliveredAt: number
  status: string
}
interface PendingItem {
  id: string
  to: string
  message: string
  giftAmountUsdc: number
  triggerCondition: string
  status: string
}
interface InboxResp {
  petId: number
  inbox: InboxItem[]
  pending: PendingItem[]
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const petId = Number(searchParams.get('petId'))
  if (!Number.isFinite(petId)) {
    return Response.json({ error: 'petId required' }, { status: 400 })
  }

  const result = await proxyOrFallback(
    async () => callHub<InboxResp>(`/api/keeperhub/mailbox/inbox?petId=${petId}`, { method: 'GET' }),
    () => ({
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
    }),
  )

  return Response.json(result)
}