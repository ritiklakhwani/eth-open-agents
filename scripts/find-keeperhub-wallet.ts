import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const __filename = fileURLToPath(import.meta.url)
config({ path: path.resolve(path.dirname(__filename), '..', '.env') })

async function main() {
  const apiKey = process.env.KEEPERHUB_API_KEY
  if (!apiKey) { console.error('KEEPERHUB_API_KEY not set'); process.exit(1) }

  const transport = new StreamableHTTPClientTransport(new URL('https://app.keeperhub.com/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  })
  const client = new Client({ name: 'wallet-finder', version: '0.0.1' }, { capabilities: {} })
  await client.connect(transport)

  console.log('--- AVAILABLE TOOLS ---')
  const tools = await client.listTools()
  for (const t of tools.tools) {
    console.log(`  ${t.name}`)
  }

  // Try common wallet-listing tool names
  const candidates = ['list_wallets', 'list_wallet_integrations', 'list_integrations', 'get_wallets']
  for (const name of candidates) {
    if (tools.tools.find(t => t.name === name)) {
      console.log(`\n--- Calling ${name} ---`)
      const r = await client.callTool({ name, arguments: {} })
      console.log(JSON.stringify(r, null, 2).slice(0, 2000))
    }
  }

  await client.close()
}

main().catch(e => { console.error(e); process.exit(1) })
