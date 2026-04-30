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
  const analysis = await brain.decide(
    'Analyze these recurring USDC subscriptions and identify the top 3 to cancel for cost savings. Be concise.',
    { ownerAddress, subscriptions: MOCK_TX_HISTORY },
  )

  // Sort by monthly cost descending, pick top 3; attach AI reasoning as the proposal rationale
  return [...MOCK_TX_HISTORY]
    .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
    .slice(0, 3)
    .map(sub => ({
      subscriptionId: sub.id,
      name:           sub.name,
      amountUSDC:     sub.amount,
      reason:         analysis.slice(0, 140),
    }))
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