// AXL HTTP bridge wrapper.
// AXL is application-agnostic — /send body is raw bytes, /recv returns raw bytes.
// We serialize our messages as JSON strings over that raw channel.

export class AXLClient {
  constructor(private apiPort: number) {}

  async send(toPeerId: string, msg: object): Promise<void> {
    const r = await fetch(`http://127.0.0.1:${this.apiPort}/send`, {
      method: 'POST',
      headers: { 'X-Destination-Peer-Id': toPeerId },
      body: JSON.stringify(msg),
    })
    if (!r.ok) throw new Error(`AXL send failed: ${r.status} ${await r.text()}`)
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