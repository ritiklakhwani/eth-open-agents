// Live smoke test for packages/keeperhub.
// Creates a recurring allowance workflow on KeeperHub against our Sepolia contracts,
// verifies it lands, then deletes it (we don't want a stale weekly cron firing forever).

import 'dotenv/config'
import { connectKeeperHub, createRecurringAllowance } from '../packages/keeperhub/index.ts'

async function main() {
  console.log('Connecting to KeeperHub MCP...')
  const client = await connectKeeperHub()

  try {
    // List existing workflows first
    const existing = await client.callTool('list_workflows', { limit: 100, offset: 0 })
    console.log('Existing workflows:', JSON.stringify(existing).slice(0, 200))

    // Try to list integrations to find a wallet ID we can use
    let walletIntegrationId = process.env.KEEPERHUB_WALLET_ID
    if (!walletIntegrationId) {
      console.log('\nNo KEEPERHUB_WALLET_ID env var — listing integrations...')
      const integrations = await client.callTool('list_integrations', { type: 'web3' })
      console.log('Integrations:', JSON.stringify(integrations).slice(0, 500))
      // Will error below if no wallet — that tells us we need to set one up in the KeeperHub UI
      walletIntegrationId = (integrations as Array<{ id: string }>)?.[0]?.id ?? 'PLACEHOLDER'
    }

    console.log(`\nUsing wallet integration: ${walletIntegrationId}`)
    console.log('Creating recurring allowance workflow...')

    const wf = await createRecurringAllowance(client, {
      petId: 1,
      petWalletAddress: '0xf3aC1b8311Eabea1b22fC91681dd7A6e429a11E1', // existing test pet wallet
      amountUSDC: '1',
      cron: '0 0 * * 0', // weekly Sunday 00:00 UTC
      walletIntegrationId,
    })

    console.log('Created workflow:', JSON.stringify(wf, null, 2))

    // Read it back
    const readBack = await client.callTool('get_workflow', { id: wf.id })
    console.log('Read-back nodes count:', (readBack as { nodes?: unknown[] }).nodes?.length)

    // Cleanup — delete the test workflow so we don't have stale cron firing
    console.log('\nCleaning up: deleting test workflow...')
    await client.callTool('delete_workflow', { id: wf.id })
    console.log('Deleted — Phase 8 KeeperHub primitive 1 verified end-to-end')
  } catch (err) {
    console.error('Test failed:', err)
    throw err
  } finally {
    await client.close()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
