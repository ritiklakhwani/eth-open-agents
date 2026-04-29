import { Indexer, MemData } from '@0glabs/0g-ts-sdk'
import { Wallet, JsonRpcProvider } from 'ethers'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

export interface PetIdentityBlob {
  sprite: string
  archetype: string
  personality: string
  traits: Record<string, number>
  memorySnapshot: unknown[]
  createdAt: number
  updatedAt: number
}

const FALLBACK_CACHE_DIR = resolve('data', 'og-cache')

function makeIndexer(): Indexer {
  const url = process.env.ZERO_G_INDEXER_URL
  if (!url) throw new Error('ZERO_G_INDEXER_URL not set')
  return new Indexer(url)
}

function makeSigner(): Wallet {
  const rpcUrl = process.env.ZERO_G_RPC_URL
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!rpcUrl || !pk) throw new Error('ZERO_G_RPC_URL or DEPLOYER_PRIVATE_KEY not set')
  return new Wallet(pk, new JsonRpcProvider(rpcUrl))
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
/// (testnet Flow contract issues, etc.) so fetchBlob can still recover the data.
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

/// Upload a PetIdentityBlob to 0G Storage. Returns the rootHash as the blob CID.
///
/// Strategy:
///   1. Compute the real merkle root locally (the canonical 0G CID format)
///   2. Try to upload to 0G via the SDK
///   3. If upload fails (e.g. testnet Flow contract revert), persist to local cache
///      and return the merkle root anyway — it remains a stable content-address
///   4. Either way, return the same CID — consumers don't have to know about the fallback
export async function uploadBlob(data: PetIdentityBlob): Promise<string> {
  const cid = await computeMerkleRoot(data)
  const bytes = Buffer.from(JSON.stringify(data), 'utf-8')
  const memData = new MemData(bytes)

  try {
    const indexer = makeIndexer()
    const signer = makeSigner()
    const rpcUrl = process.env.ZERO_G_RPC_URL!

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [result, err] = await indexer.upload(memData, rpcUrl, signer as any, {
      tags: '0x',
      finalityRequired: false,
      taskSize: 10,
      expectedReplica: 1,
      skipTx: true,
      fee: BigInt('0'),
    })
    if (err) throw err
    // 0G's returned root should match what we computed
    return result.rootHash
  } catch (uploadErr) {
    console.warn(
      `[og-storage] 0G upload failed (${(uploadErr as Error).message.slice(0, 80)}...) — ` +
      `falling back to local cache. CID is still valid (real merkle root).`,
    )
    await cacheLocally(cid, data)
    return cid
  }
}

/// Fetch a PetIdentityBlob from 0G Storage by its CID (rootHash).
///
/// Tries 0G first; falls back to local cache (in case this CID was upload-cached).
export async function fetchBlob(cid: string): Promise<PetIdentityBlob> {
  // Try 0G first
  try {
    const tmpPath = join(tmpdir(), `pet-blob-${randomBytes(8).toString('hex')}.json`)
    const indexer = makeIndexer()
    const err = await indexer.download(cid, tmpPath, false)
    if (!err) {
      try {
        const raw = await readFile(tmpPath, 'utf-8')
        return JSON.parse(raw) as PetIdentityBlob
      } finally {
        await unlink(tmpPath).catch(() => {})
      }
    }
  } catch {
    // fall through to cache
  }

  const cached = await fetchFromCache(cid)
  if (cached) return cached

  throw new Error(`fetchBlob: blob ${cid} not found on 0G or local cache`)
}

/// Re-upload updated blob data; returns new CID. Old CID is ignored (content-addressed).
export async function updateBlob(_currentCid: string, newData: PetIdentityBlob): Promise<string> {
  return uploadBlob(newData)
}
