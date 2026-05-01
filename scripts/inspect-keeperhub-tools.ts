import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const __filename = fileURLToPath(import.meta.url)
config({ path: path.resolve(path.dirname(__filename), '..', '.env') })

async function main() {
  const apiKey = process.env.KEEPERHUB_API_KEY!
  const transport = new StreamableHTTPClientTransport(new URL('https://app.keeperhub.com/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  })
  const client = new Client({ name: 'inspect', version: '0.0.1' }, { capabilities: {} })
  await client.connect(transport)

  const tools = await client.listTools()
  const target = tools.tools.find(t => t.name === 'execute_contract_call')
  if (!target) {
    console.log('execute_contract_call not found')
  } else {
    console.log('Name:', target.name)
    console.log('Description:', target.description)
    console.log('Input schema:')
    console.log(JSON.stringify(target.inputSchema, null, 2))
  }
  await client.close()
}
main().catch(e => { console.error(e); process.exit(1) })
