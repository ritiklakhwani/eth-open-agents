import { Indexer, MemData } from '@0glabs/0g-ts-sdk'
import { Wallet, JsonRpcProvider } from 'ethers'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
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

function makeIndexer(): Indexer {
  const url = process.env.ZERO_G_INDEXER_URL
  if (!url) throw new Error('ZERO_G_INDEXER_URL not set')
  return new Indexer(url)
}

function makeSigner(): Wallet {
  const rpcUrl = process.env.ZERO_G_RPC_URL
  const pk     = process.env.DEPLOYER_PRIVATE_KEY
  if (!rpcUrl || !pk) throw new Error('ZERO_G_RPC_URL or DEPLOYER_PRIVATE_KEY not set')
  return new Wallet(pk, new JsonRpcProvider(rpcUrl))
}

// Upload a PetIdentityBlob to 0G Storage. Returns the rootHash as the blob CID.
export async function uploadBlob(data: PetIdentityBlob): Promise<string> {
  const bytes   = Buffer.from(JSON.stringify(data), 'utf-8')
  const memData = new MemData(bytes)
  const indexer = makeIndexer()
  const signer  = makeSigner()   // throws if ZERO_G_RPC_URL or DEPLOYER_PRIVATE_KEY not set
  const rpcUrl  = process.env.ZERO_G_RPC_URL!

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, err] = await indexer.upload(memData, rpcUrl, signer as any)
  if (err) throw err
  return result.rootHash
}

// Fetch a PetIdentityBlob from 0G Storage by its CID (rootHash).
export async function fetchBlob(cid: string): Promise<PetIdentityBlob> {
  const tmpPath = join(tmpdir(), `pet-blob-${randomBytes(8).toString('hex')}.json`)
  const indexer = makeIndexer()

  const err = await indexer.download(cid, tmpPath, false)
  if (err) throw err

  try {
    const raw = await readFile(tmpPath, 'utf-8')
    return JSON.parse(raw) as PetIdentityBlob
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

// Re-upload updated blob data; returns new CID. Old CID is ignored (content-addressed).
export async function updateBlob(_currentCid: string, newData: PetIdentityBlob): Promise<string> {
  return uploadBlob(newData)
}