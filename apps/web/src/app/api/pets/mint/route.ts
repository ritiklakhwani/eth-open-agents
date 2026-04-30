// /api/pets/mint — server-side TamaPet mint.
//
// Phase B (wallet connect) will replace this with a client-side wagmi flow where
// the connected wallet signs the mint tx. Until then the server signs with
// DEPLOYER_PRIVATE_KEY so we can demo end-to-end without RainbowKit.

import { createPublicClient, createWalletClient, http, decodeEventLog, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { TamaPetABI, ADDRESSES_SEPOLIA } from 'contracts-sdk'

interface MintPayload {
  to: Address
  name: string
  blobCID: string
  archetype: number | string
  traits: number
}

const ARCHETYPE_INDEX: Record<string, number> = {
  sage: 0,
  gremlin: 1,
  athlete: 2,
  joker: 3,
  scholar: 4,
}

export async function POST(req: Request) {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  const rpc = process.env.SEPOLIA_RPC_URL
  if (!pk || !rpc) {
    return Response.json({ error: 'DEPLOYER_PRIVATE_KEY or SEPOLIA_RPC_URL not set' }, { status: 500 })
  }

  let body: Partial<MintPayload>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body.name || !body.blobCID || !body.to) {
    return Response.json({ error: 'name, blobCID, to required' }, { status: 400 })
  }

  const rawArch = body.archetype
  const archetypeNum: number =
    typeof rawArch === 'string'
      ? (ARCHETYPE_INDEX[rawArch.toLowerCase()] ?? 0)
      : (rawArch ?? 0)
  const traits = BigInt(body.traits ?? 0)

  const account = privateKeyToAccount(pk.startsWith('0x') ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`))
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) })
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpc) })

  try {
    const txHash = await walletClient.writeContract({
      address: ADDRESSES_SEPOLIA.TamaPet as Address,
      abi: TamaPetABI,
      functionName: 'mint',
      args: [body.to, body.name, body.blobCID, archetypeNum, traits],
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

    let tokenId: string | null = null
    let walletAddress: string | null = null
    for (const log of receipt.logs) {
      try {
        const parsed = decodeEventLog({
          abi: TamaPetABI,
          data: log.data,
          topics: log.topics,
        })
        if (parsed.eventName === 'Mint') {
          const args = parsed.args as unknown as Record<string, unknown>
          tokenId = String(args.tokenId)
          walletAddress = String(args.wallet)
          break
        }
      } catch {
        // not a Mint log; skip
      }
    }

    return Response.json({
      txHash,
      tokenId,
      walletAddress,
      blockNumber: Number(receipt.blockNumber),
    })
  } catch (err) {
    console.error('[api/pets/mint] failed:', err)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
