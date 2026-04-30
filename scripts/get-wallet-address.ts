import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const __filename = fileURLToPath(import.meta.url)
config({ path: path.resolve(path.dirname(__filename), '..', '.env') })

async function main() {
  const apiKey = process.env.KEEPERHUB_API_KEY
  const id = 'jrlrpj0zuipfb0yg22gkv'
  if (!apiKey) { console.error('KEEPERHUB_API_KEY not set'); process.exit(1) }

  const transport = new StreamableHTTPClientTransport(new URL('https://app.keeperhub.com/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  })
  const client = new Client({ name: 'wallet-detail', version: '0.0.1' }, { capabilities: {} })
  await client.connect(transport)

  const r = await client.callTool({ name: 'get_wallet_integration', arguments: { integrationId: id } })
  console.log(JSON.stringify(r, null, 2))

  await client.close()
}
main().catch(e => { console.error(e); process.exit(1) })
