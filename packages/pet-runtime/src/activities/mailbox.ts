import { connectKeeperHub, createConditionalMailbox } from 'keeperhub'

export interface MailboxSendArgs {
  fromPetId:           number
  toPetId:             number
  toPetEnsName:        string
  toPetWalletAddress:  `0x${string}`
  amountUSDC:          string
  walletIntegrationId: string
}

export async function sendMailboxGift(args: MailboxSendArgs): Promise<{ workflowId: string }> {
  const client = await connectKeeperHub()
  try {
    const workflow = await createConditionalMailbox(client, {
      fromPetId:           args.fromPetId,
      toPetId:             args.toPetId,
      toPetEnsName:        args.toPetEnsName,
      toPetWalletAddress:  args.toPetWalletAddress,
      amountUSDC:          args.amountUSDC,
      walletIntegrationId: args.walletIntegrationId,
    })
    return { workflowId: workflow.id }
  } finally {
    await client.close()
  }
}