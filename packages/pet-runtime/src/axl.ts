// AXL HTTP bridge wrapper.
// AXL is application-agnostic — /send body is raw bytes, /recv returns raw bytes.
// We serialize our messages as JSON strings over that raw channel.
//
// Hub-relay fallback: AXL's gVisor-namespace TCP routing isn't reachable on
// hosts where gVisor inter-namespace forwarding isn't configured. When a
// direct `axl.send` fails, the worker IPC-relays the message to the Hub,
// which broadcasts it to the recipient worker via child-process IPC. Battle
// messages are also mirrored through the relay because AXL can accept a local
// send even when cross-namespace delivery never reaches the opponent.

export class AXLClient {
  constructor(private apiPort: number) {}

  async send(toPeerId: string, msg: object): Promise<void> {
    const shouldMirror = shouldMirrorThroughHub(msg)
    const mirrored = shouldMirror ? relayThroughHub(toPeerId, msg) : false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), shouldMirror ? 1_500 : 10_000)

    try {
      const r = await fetch(`http://127.0.0.1:${this.apiPort}/send`, {
        method: 'POST',
        headers: { 'X-Destination-Peer-Id': toPeerId },
        signal: controller.signal,
        body: JSON.stringify(msg),
      })
      if (!r.ok) throw new Error(`AXL send failed: ${r.status} ${await r.text()}`)
    } catch (axlErr) {
      // Fall back to Hub relay — IPC message to supervisor, which forwards
      // to the recipient worker. Only works when running under PetSupervisor
      // (i.e. process.send is defined).
      if (mirrored) {
        return
      }
      if (relayThroughHub(toPeerId, msg)) {
        return
      }
      throw axlErr
    } finally {
      clearTimeout(timeout)
    }
  }

  async recv(): Promise<{ from: string; message: unknown } | null> {
    const r = await fetch(`http://127.0.0.1:${this.apiPort}/recv`)
    if (r.status === 204) return null
    if (!r.ok) throw new Error(`AXL recv failed: ${r.status}`)
    const from = r.headers.get('X-From-Peer-Id')
    if (!from) return null
    const body = await r.text()
    let message: unknown
    try {
      message = JSON.parse(body)
    } catch {
      message = body
    }
    return { from, message }
  }

  async getMyPeerId(): Promise<string> {
    const r = await fetch(`http://127.0.0.1:${this.apiPort}/topology`)
    if (!r.ok) throw new Error(`AXL topology failed: ${r.status}`)
    const data = await r.json() as { our_public_key: string }
    return data.our_public_key
  }

  // Polls until the AXL node's HTTP API is up, or throws after maxWaitMs.
  async waitReady(maxWaitMs = 10_000): Promise<void> {
    const deadline = Date.now() + maxWaitMs
    while (Date.now() < deadline) {
      try {
        await this.getMyPeerId()
        return
      } catch {
        await new Promise(r => setTimeout(r, 250))
      }
    }
    throw new Error(`AXL node on port ${this.apiPort} did not become ready within ${maxWaitMs}ms`)
  }
}

function shouldMirrorThroughHub(msg: object): boolean {
  const type = (msg as { type?: unknown }).type
  return typeof type === 'string' && type.startsWith('battle-')
}

function relayThroughHub(toPeerId: string, msg: object): boolean {
  if (typeof process.send !== 'function') return false
  process.send({ type: 'relay-axl-msg', toPeerId, msg })
  return true
}