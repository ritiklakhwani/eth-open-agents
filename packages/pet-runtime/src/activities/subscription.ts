import { connectKeeperHub, createSubscriptionCancellation } from 'keeperhub'
import type { Brain } from '../brain.js'

// Mocked recurring tx history — represents what a real wallet-indexer would return
const MOCK_TX_HISTORY = [
  { id: 1, name: 'Netflix',         amount: '15.99', intervalDays: 30,  lastCharged: '2026-03-31' },
  { id: 2, name: 'Spotify',         amount:  '9.99', intervalDays: 30,  lastCharged: '2026-04-01' },
  { id: 3, name: 'AWS compute',     amount: '127.43', intervalDays: 30, lastCharged: '2026-04-05' },
  { id: 4, name: 'Adobe CC',        amount: '54.99', intervalDays: 30,  lastCharged: '2026-04-03' },
  { id: 5, name: 'Gym membership',  amount: '39.99', intervalDays: 30,  lastCharged: '2026-03-28' },
  { id: 6, name: 'Domain renewals', amount: '12.00', intervalDays: 365, lastCharged: '2026-01-01' },
  { id: 7, name: 'VPN service',     amount:  '8.33', intervalDays: 30,  lastCharged: '2026-04-10' },
] as const

export interface SubscriptionProposal {
  subscriptionId: number
  name:           string
  amountUSDC:     string
  reason:         string
}

export async function scanSubscriptions(
  brain:        Brain,
  ownerAddress: string,
): Promise<SubscriptionProposal[]> {
  // Sort by cost descending, keep top 3 candidates
  const candidates = [...MOCK_TX_HISTORY]
    .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
    .slice(0, 3)

  // Call Brain once per candidate so each proposal gets its own rationale
  const proposals = await Promise.all(
    candidates.map(async sub => {
      const reason = await brain.decide(
        `Should the owner cancel "${sub.name}" ($${sub.amount}/mo)? Give a one-sentence recommendation.`,
        { ownerAddress, subscription: sub },
      )
      return {
        subscriptionId: sub.id,
        name:           sub.name,
        amountUSDC:     sub.amount,
        reason:         reason.slice(0, 140),
      }
    }),
  )

  return proposals
}

export async function approveSubscriptionCancellation(args: {
  ownerAddress:        `0x${string}`
  subscriptionId:      number
  walletIntegrationId: string
}): Promise<{ workflowId: string }> {
  const client = await connectKeeperHub()
  try {
    const workflow = await createSubscriptionCancellation(client, {
      ownerAddress:        args.ownerAddress,
      subscriptionId:      args.subscriptionId,
      walletIntegrationId: args.walletIntegrationId,
    })
    return { workflowId: workflow.id }
  } finally {
    await client.close()
  }
}