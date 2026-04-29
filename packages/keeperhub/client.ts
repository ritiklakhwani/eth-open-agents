// Thin wrapper around @modelcontextprotocol/sdk for talking to KeeperHub MCP.
// Handles initialize → session-id → tool calls.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const KEEPERHUB_MCP_URL = 'https://app.keeperhub.com/mcp'

export interface KeeperHubClient {
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  close: () => Promise<void>
}

/// Connects to KeeperHub MCP. KEEPERHUB_API_KEY env var must be set.
export async function connectKeeperHub(): Promise<KeeperHubClient> {
  const apiKey = process.env.KEEPERHUB_API_KEY
  if (!apiKey) throw new Error('KEEPERHUB_API_KEY not set')

  const transport = new StreamableHTTPClientTransport(new URL(KEEPERHUB_MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  })

  const client = new Client({ name: 'tama-keeperhub', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)

  return {
    async callTool(name, args) {
      const result = await client.callTool({ name, arguments: args })
      // result.content is an array of TextContent | ImageContent | etc.
      // For our use, tools return JSON-stringified text content.
      const text = (result.content as Array<{ type: string; text?: string }>)
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text!)
        .join('')
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    },
    async close() {
      await client.close()
    },
  }
}
