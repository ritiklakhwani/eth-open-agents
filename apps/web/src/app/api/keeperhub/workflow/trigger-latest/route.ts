// /api/keeperhub/workflow/trigger-latest — find the most recent KeeperHub
// workflow for a given pet + kind, then execute it.
//
// Demo helper. The mailbox workflow normally polls for recipient ENS
// lastSeenBlock; we don't write that record so it never fires organically.
// This endpoint:
//   1. Lists all KeeperHub workflows via MCP
//   2. Filters by name prefix matching the pet + kind (e.g. "mailbox-18-to-")
//   3. Picks the most recently created one
//   4. Calls execute_workflow to bypass conditions and run the action
//
// We talk to KeeperHub MCP directly here (rather than importing the
// `keeperhub` workspace package) because that package uses ESM-style `.js`
// import extensions that Next.js Turbopack doesn't auto-resolve.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

interface TriggerLatestPayload {
  petId: number
  kind: 'mailbox' | 'subscription' | 'allowance'
}

interface KeeperHubWorkflow {
  id: string
  name: string
  status?: string
  createdAt?: string
}

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3001'

const NAME_FILTER: Record<TriggerLatestPayload['kind'], (petId: number, name: string) => boolean> = {
  mailbox:      (petId, name) => name.startsWith(`mailbox-${petId}-to-`),
  // subscription cancellation workflows aren't pet-scoped in the name; just
  // pick the latest cancel-sub-* workflow globally
  subscription: (_, name) => name.startsWith('cancel-sub-'),
  allowance:    (petId, name) => name === `pet-${petId}-allowance`,
}

async function callKeeperHub<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.KEEPERHUB_API_KEY
  if (!apiKey) throw new Error('KEEPERHUB_API_KEY not set')

  const transport = new StreamableHTTPClientTransport(
    new URL('https://app.keeperhub.com/mcp'),
    { requestInit: { headers: { Authorization: `Bearer ${apiKey}` } } },
  )
  const client = new Client({ name: 'tama-trigger', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)

  try {
    const raw = await client.callTool({ name: toolName, arguments: args })
    const text = (raw.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text!)
      .join('')
    try {
      return JSON.parse(text) as T
    } catch {
      return text as unknown as T
    }
  } finally {
    await client.close()
  }
}

async function markMailboxDelivered(workflowId: string, executionId: string | null): Promise<boolean> {
  try {
    const res = await fetch(`${HUB_URL}/api/keeperhub/mailbox/delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId, executionId }),
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  let body: TriggerLatestPayload
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.petId || !body.kind) {
    return Response.json({ error: 'petId, kind required' }, { status: 400 })
  }

  try {
    const all = await callKeeperHub<KeeperHubWorkflow[]>('list_workflows', {})
    const filter = NAME_FILTER[body.kind]
    const matches = all.filter((w) => w.name && filter(body.petId, w.name))

    if (matches.length === 0) {
      return Response.json(
        {
          error: `no ${body.kind} workflow found for pet ${body.petId}`,
          availableNames: all.map((w) => w.name).slice(0, 10),
        },
        { status: 404 },
      )
    }

    matches.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    const target = matches[0]

    const exec = await callKeeperHub<{ executionId?: string; status?: string; output?: unknown }>(
      'execute_workflow',
      { id: target.id },
    )
    const executionId = exec.executionId ?? null
    const mailboxMarkedDelivered = body.kind === 'mailbox'
      ? await markMailboxDelivered(target.id, executionId)
      : undefined

    return Response.json({
      workflowId: target.id,
      workflowName: target.name,
      executionId,
      status: exec.status ?? 'fired',
      output: exec.output ?? null,
      mailboxMarkedDelivered,
      source: 'hub',
    })
  } catch (err) {
    console.error('[api/keeperhub/workflow/trigger-latest] failed:', err)
    return Response.json(
      { error: (err as Error).message, source: 'error' },
      { status: 500 },
    )
  }
}
