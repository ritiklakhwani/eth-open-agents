// Hub helper — small utilities for proxying Next API routes to Karmanay's Hub.
//
// Each Next route imports `proxyOrFallback` and passes:
//   - a function that calls the Hub
//   - a function that returns canned stub data
//
// The helper races them with a 2s timeout. If the Hub is down or errors, the
// stub is returned. Either way the caller's response stays consistent so the
// UI doesn't need to know which side served it.

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3001'
const HUB_TIMEOUT_MS = 2000

interface HubPetRow {
  token_id: number
  name: string | null
  ens_name: string | null
  wallet_address: string | null
  peer_id: string | null
}

/// Look up a pet on the Hub by ENS-friendly name (e.g. "rusty.tama.eth" or
/// "rusty"). Returns null if Hub is down or no pet matches.
export async function fetchPetByName(needle: string): Promise<HubPetRow | null> {
  const norm = needle.trim().toLowerCase().replace(/\.tama\.eth$/, '')
  try {
    const res = await fetch(`${HUB_URL}/api/pets`, {
      signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const pets = (await res.json()) as HubPetRow[]
    return pets.find((p) => (p.name ?? '').toLowerCase() === norm) ?? null
  } catch {
    return null
  }
}

/// Fetch all pets from the Hub. Returns [] on failure.
export async function fetchAllPets(): Promise<HubPetRow[]> {
  try {
    const res = await fetch(`${HUB_URL}/api/pets`, {
      signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) return []
    return (await res.json()) as HubPetRow[]
  } catch {
    return []
  }
}

interface HubFetchOpts {
  method?: 'GET' | 'POST'
  body?: unknown
  /** Override default Hub timeout (e.g. battle status needs a longer read). */
  timeoutMs?: number
}

/// Fire a Hub request. Returns parsed JSON on success, null on failure/timeout.
export async function callHub<T = unknown>(
  path: string,
  opts: HubFetchOpts = {},
): Promise<T | null> {
  const timeoutMs = opts.timeoutMs ?? HUB_TIMEOUT_MS
  try {
    const res = await fetch(`${HUB_URL}${path}`, {
      method:  opts.method ?? 'POST',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body:    opts.body ? JSON.stringify(opts.body) : undefined,
      signal:  AbortSignal.timeout(timeoutMs),
      cache:   'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/// Try the Hub call; if it returns null (down/error), build the stub response.
/// Tags responses with `source: 'hub' | 'stub'` so the dev console + Pet
/// Inspector LIVE/DEMO indicator stays meaningful.
export async function proxyOrFallback<TOut extends Record<string, unknown>>(
  hubAttempt: () => Promise<TOut | null>,
  stubFactory: () => TOut,
): Promise<TOut & { source: 'hub' | 'stub' }> {
  const hubResult = await hubAttempt().catch(() => null)
  if (hubResult) return { ...hubResult, source: 'hub' as const }
  return { ...stubFactory(), source: 'stub' as const }
}

export { HUB_URL }
