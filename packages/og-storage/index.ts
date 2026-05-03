import { MemData } from '@0glabs/0g-ts-sdk'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import { spawn } from 'child_process'

export interface PetIdentityBlob {
  sprite: string
  archetype: string
  personality: string
  traits: Record<string, number>
  memorySnapshot: unknown[]
  createdAt: number
  updatedAt: number
}

/// Resolve paths relative to the repo root, NOT process.cwd(). Different
/// importers run from different cwds (Hub from repo root, Next.js dev from
/// apps/web, pet workers from anywhere) — without anchoring to the package
/// location, cache files and the CLI binary end up scattered across wrong dirs.
/// This file lives at packages/og-storage/index.ts → ../.. is the repo root.
const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT  = resolve(dirname(__filename), '..', '..')

const FALLBACK_CACHE_DIR = resolve(REPO_ROOT, 'data', 'og-cache')
const TX_HASH_DIR        = resolve(REPO_ROOT, 'data', 'og-tx-hashes')

/// Path to the bundled 0G Go CLI binary. Cloned + built from
/// github.com/0gfoundation/0g-storage-client and dropped at repo-root `bin/`.
/// We subprocess this instead of using the TS SDK because TS SDK 0.3.3's
/// `Indexer.upload()` hardcodes a Flow-contract submission that reverts on
/// the Galileo testnet right now. The Go CLI uses a more permissive upload
/// path that the testnet indexer actually accepts.
const OG_CLI_BIN = resolve(REPO_ROOT, 'bin', '0g-storage-client')

function cliAvailable(): boolean {
  return existsSync(OG_CLI_BIN)
}

/// Compute the 0G merkle root of a blob without uploading.
/// This is the real CID format — same hash 0G would assign — so it works as a stable
/// content-address even when on-chain submission isn't available.
export async function computeMerkleRoot(data: PetIdentityBlob): Promise<string> {
  const bytes = Buffer.from(JSON.stringify(data), 'utf-8')
  const memData = new MemData(bytes)
  const [tree, err] = await memData.merkleTree()
  if (err || !tree) throw err ?? new Error('Failed to compute merkle tree')
  const root = tree.rootHash()
  if (!root) throw new Error('Merkle tree returned null root')
  return root
}

/// Persist blob to local fallback cache keyed by CID. Used when 0G upload fails
/// (testnet Flow contract issues, CLI not installed, etc.) so fetchBlob can
/// still recover the data.
async function cacheLocally(cid: string, data: PetIdentityBlob): Promise<void> {
  await mkdir(FALLBACK_CACHE_DIR, { recursive: true })
  await writeFile(join(FALLBACK_CACHE_DIR, `${cid.replace(/^0x/, '')}.json`), JSON.stringify(data))
}

async function fetchFromCache(cid: string): Promise<PetIdentityBlob | null> {
  try {
    const raw = await readFile(join(FALLBACK_CACHE_DIR, `${cid.replace(/^0x/, '')}.json`), 'utf-8')
    return JSON.parse(raw) as PetIdentityBlob
  } catch {
    return null
  }
}

/// Persist the on-chain tx hash for a successful upload. Side-channel JSON file
/// so consumers (Hub `/api/integration/og-status`) can surface a
/// chainscan-galileo link as proof the blob really hit the chain.
async function persistTxHash(cid: string, txHash: string): Promise<void> {
  await mkdir(TX_HASH_DIR, { recursive: true })
  const payload = { cid, txHash, timestamp: Date.now() }
  await writeFile(
    join(TX_HASH_DIR, `${cid.replace(/^0x/, '')}.json`),
    JSON.stringify(payload),
  )
}

/// Read a previously-persisted tx hash. Returns null if the upload was
/// fallback-cached locally (no chain submission happened).
export async function getOgTxHash(cid: string): Promise<string | null> {
  try {
    const raw = await readFile(
      join(TX_HASH_DIR, `${cid.replace(/^0x/, '')}.json`),
      'utf-8',
    )
    const parsed = JSON.parse(raw) as { txHash?: string }
    return parsed.txHash ?? null
  } catch {
    return null
  }
}

interface CliRunResult {
  stdout: string
  stderr: string
  code: number
}

function runCli(args: string[]): Promise<CliRunResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(OG_CLI_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.once('error', rejectPromise)
    child.once('close', (code: number | null) => {
      resolvePromise({ stdout, stderr, code: code ?? -1 })
    })
  })
}

/// Parse the CLI's combined stdout+stderr for the merkle root the binary
/// printed after a successful upload. The Go CLI logs in several formats —
/// matches "Root hash: 0x...", "root=0x...", "root hash 0x...".
function parseRoot(out: string): string | null {
  const m = out.match(/(?:root\s*hash|root)\s*[:=]?\s*"?(0x[a-fA-F0-9]{64})"?/i)
  return m ? m[1] : null
}

/// Parse the CLI output for the on-chain submission tx hash.
/// The CLI logs the tx hash twice — once as bare `hash=0x…` on the "Succeeded
/// to send transaction" line, and again as `txHash=0x…` on the "Transaction
/// receipt" line. We match either, with `txHash` preferred (it's more
/// specific). Case-insensitive because Go's logrus capitalizes inconsistently.
function parseTxHash(out: string): string | null {
  // Prefer the explicit `txHash=` form
  const explicit = out.match(/txhash\s*[:=]\s*"?(0x[a-fA-F0-9]{64})"?/i)
  if (explicit) return explicit[1]
  // Fallback: bare `hash=0x…` on the "Succeeded to send transaction" line
  const m = out.match(/Succeeded to send transaction[^\n]*?\bhash\s*[:=]\s*"?(0x[a-fA-F0-9]{64})"?/i)
  return m ? m[1] : null
}

interface CliUploadOk {
  ok: true
  rootHash: string
  txHash: string | null
}

async function uploadViaCli(bytes: Buffer): Promise<CliUploadOk> {
  const rpcUrl = process.env.ZERO_G_RPC_URL
  const indexerUrl = process.env.ZERO_G_INDEXER_URL
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!rpcUrl || !indexerUrl || !pk) {
    throw new Error('ZERO_G_RPC_URL / ZERO_G_INDEXER_URL / DEPLOYER_PRIVATE_KEY not set')
  }

  const tmpPath = join(tmpdir(), `pet-blob-up-${randomBytes(8).toString('hex')}.json`)
  await writeFile(tmpPath, new Uint8Array(bytes))
  try {
    const { stdout, stderr, code } = await runCli([
      'upload',
      '--url',     rpcUrl,
      '--key',     pk,
      '--indexer', indexerUrl,
      '--file',    tmpPath,
      // Strip ANSI colors so our root/tx-hash regex matches reliably.
      '--log-color-disabled',
    ])
    const combined = `${stdout}\n${stderr}`
    if (code !== 0) {
      throw new Error(`0g-storage-client upload exit=${code}: ${combined.slice(-300)}`)
    }
    const rootHash = parseRoot(combined)
    if (!rootHash) {
      throw new Error(`0g-storage-client upload: could not parse root from output: ${combined.slice(-300)}`)
    }
    return { ok: true, rootHash, txHash: parseTxHash(combined) }
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

async function downloadViaCli(cid: string): Promise<Buffer | null> {
  const indexerUrl = process.env.ZERO_G_INDEXER_URL
  if (!indexerUrl) return null
  const tmpPath = join(tmpdir(), `pet-blob-dl-${randomBytes(8).toString('hex')}.json`)
  try {
    const { stdout, stderr, code } = await runCli([
      'download',
      '--indexer', indexerUrl,
      '--root',    cid,
      '--file',    tmpPath,
    ])
    if (code !== 0) {
      console.warn(
        `[og-storage] CLI download failed (exit=${code}): ${(stderr || stdout).slice(-200)}`,
      )
      return null
    }
    return await readFile(tmpPath)
  } catch {
    return null
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

/// Upload a PetIdentityBlob to 0G Storage. Returns the rootHash as the blob CID.
///
/// Strategy:
///   1. Compute the real merkle root locally (the canonical 0G CID format)
///   2. If the bundled Go CLI is available, subprocess it to upload + capture tx hash
///   3. If CLI is missing OR upload fails (testnet flake, network), persist to
///      local cache and return the merkle root anyway — it remains a stable
///      content-address. Consumers don't have to know about the fallback.
export async function uploadBlob(data: PetIdentityBlob): Promise<string> {
  const cid = await computeMerkleRoot(data)
  const bytes = Buffer.from(JSON.stringify(data), 'utf-8')

  if (cliAvailable()) {
    try {
      const result = await uploadViaCli(bytes)
      if (result.txHash) await persistTxHash(result.rootHash, result.txHash)
      return result.rootHash
    } catch (uploadErr) {
      console.warn(
        `[og-storage] 0G CLI upload failed (${(uploadErr as Error).message.slice(0, 120)}) — ` +
        `falling back to local cache. CID is still valid (real merkle root).`,
      )
    }
  } else {
    console.warn(
      `[og-storage] 0G CLI not found at ${OG_CLI_BIN} — using local cache only. ` +
      `Run: git clone https://github.com/0gfoundation/0g-storage-client.git && (cd 0g-storage-client && go build) && mv 0g-storage-client/0g-storage-client bin/`,
    )
  }
  await cacheLocally(cid, data)
  return cid
}

/// Fetch a PetIdentityBlob from 0G Storage by its CID (rootHash).
///
/// Tries the Go CLI first (if installed), falls back to local cache.
export async function fetchBlob(cid: string): Promise<PetIdentityBlob> {
  if (cliAvailable()) {
    const buf = await downloadViaCli(cid)
    if (buf) {
      try {
        return JSON.parse(buf.toString('utf-8')) as PetIdentityBlob
      } catch {
        // fall through to cache
      }
    }
  }

  const cached = await fetchFromCache(cid)
  if (cached) return cached

  throw new Error(`fetchBlob: blob ${cid} not found on 0G or local cache`)
}

/// Re-upload updated blob data; returns new CID. Old CID is ignored (content-addressed).
export async function updateBlob(_currentCid: string, newData: PetIdentityBlob): Promise<string> {
  return uploadBlob(newData)
}
