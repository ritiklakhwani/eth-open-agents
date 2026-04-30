import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const __filename = fileURLToPath(import.meta.url)
config({ path: path.resolve(path.dirname(__filename), '..', '.env') })

async function main() {
  const apiKey = process.env.KEEPERHUB_API_KEY!
  if (!apiKey) { console.error('KEEPERHUB_API_KEY not set'); process.exit(1) }
  const transport = new StreamableHTTPClientTransport(new URL('https://app.keeperhub.com/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  })
  const client = new Client({ name: 'list-wf', version: '0.0.1' }, { capabilities: {} })
  await client.connect(transport)
  const r = await client.callTool({ name: 'list_workflows', arguments: {} }) as { content: Array<{ type: string; text?: string }> }
  const text = r.content.map(c => c.text || '').join('')
  const items = JSON.parse(text)
  for (const w of items) {
    console.log(`  ${w.id}  ${w.name || '<no-name>'}  ${w.status || ''}`)
  }
  await client.close()
}
main().catch(e => { console.error(e); process.exit(1) })
