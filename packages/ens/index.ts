// ens — Sepolia ENS NameWrapper helpers for pet subnames
// Owner: Ritik. Phase 3 (ENS setup).
//
// PetCity uses ENS as the discovery layer Gensyn AXL admittedly lacks:
//   - Each pet gets <name>.tama.eth via NameWrapper.setSubnodeRecord
//   - addr() resolves to the pet's CREATE2 smart wallet
//   - text record `tama.peerId` holds the AXL ed25519 pubkey for discovery
//   - text record `tama.blob` holds the 0G Storage CID
//   - additional text records hold attestations / achievements (Most Creative track)
//
// Hub watches Mint events from TamaPet and calls mintPetSubname() once the worker
// reports its peerId.

import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  labelhash,
  keccak256,
  encodePacked,
  type WalletClient,
  type PublicClient,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

// ── Sepolia addresses (mirrors contracts-sdk ADDRESSES_SEPOLIA) ──────────────
const ENS_NAME_WRAPPER = '0x0635513f179D50A207757E05759CbD106d7dFcE8' as const
const ENS_PUBLIC_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD' as const

const TAMA_ETH_NODE = '0x1574b16c9d940607ca49d7331864e50a0a339fec866ec8f55d1ffd818c36938c' as const

// ── Minimal ABIs ─────────────────────────────────────────────────────────────
const NameWrapperABI = [
  {
    type: 'function',
    name: 'setSubnodeRecord',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'parentNode', type: 'bytes32' },
      { name: 'label', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'ttl', type: 'uint64' },
      { name: 'fuses', type: 'uint32' },
      { name: 'expiry', type: 'uint64' },
    ],
    outputs: [{ name: 'node', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'isApprovedForAll',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

const PublicResolverABI = [
  {
    type: 'function',
    name: 'setAddr',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'addr', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'addr',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'setText',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'text',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

// ── Helpers to compute pet subnode ──────────────────────────────────────────
/// Given a pet name, return the namehash of <name>.tama.eth
export function petNamehash(petName: string): Hex {
  // namehash(<name>.tama.eth) = keccak256(parent || keccak256(label))
  const labelHash = keccak256(encodePacked(['string'], [petName]))
  return keccak256(encodePacked(['bytes32', 'bytes32'], [TAMA_ETH_NODE, labelHash])) as Hex
}

/// Same thing, but using viem's namehash (string-based, slightly different path)
export function petNamehashViaENS(petName: string): Hex {
  return namehash(`${petName}.tama.eth`)
}

// ── Clients ─────────────────────────────────────────────────────────────────
function makePublicClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) })
}

function makeWalletClient(rpcUrl: string, privateKey: Hex): WalletClient {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) })
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface MintPetSubnameArgs {
  petName: string
  petWalletAddress: Address  // pet's CREATE2 smart wallet (addr() target)
  peerId: string             // AXL ed25519 pubkey
  blobCID: string            // 0G Storage CID
  rpcUrl: string
  signerKey: Hex             // private key authorized on NameWrapper (deployer)
}

/// Registers <petName>.tama.eth, sets addr() to the pet wallet, and writes
/// the AXL peerId + 0G blob CID as text records.
///
/// Sends 4 transactions sequentially, waiting for each receipt before the next
/// (avoids "replacement transaction underpriced" when nonces collide).
export async function mintPetSubname(args: MintPetSubnameArgs): Promise<{
  subnameNode: Hex
  subnameTxHash: Hex
  setAddrTxHash: Hex
  setTextTxHashes: Record<string, Hex>
}> {
  const { petName, petWalletAddress, peerId, blobCID, rpcUrl, signerKey } = args
  const wallet = makeWalletClient(rpcUrl, signerKey)
  const publicClient = makePublicClient(rpcUrl)
  const account = wallet.account!
  const node = petNamehashViaENS(petName)

  // 1. Mint the subname (transfers ownership to deployer too — could refine to use pet wallet,
  //    but deployer keeps mint authority for future updateText calls)
  const subnameTxHash = await wallet.writeContract({
    chain: sepolia,
    account,
    address: ENS_NAME_WRAPPER,
    abi: NameWrapperABI,
    functionName: 'setSubnodeRecord',
    args: [
      TAMA_ETH_NODE,
      petName,
      account.address,
      ENS_PUBLIC_RESOLVER,
      0n,                    // ttl
      0,                     // fuses (none — keep mutable for hackathon)
      BigInt('0xffffffffffffffff'),  // expiry: max uint64 (NameWrapper accepts up to parent expiry)
    ],
  })
  await publicClient.waitForTransactionReceipt({ hash: subnameTxHash })

  // 2. Set addr() to the pet's wallet
  const setAddrTxHash = await wallet.writeContract({
    chain: sepolia,
    account,
    address: ENS_PUBLIC_RESOLVER,
    abi: PublicResolverABI,
    functionName: 'setAddr',
    args: [node, petWalletAddress],
  })
  await publicClient.waitForTransactionReceipt({ hash: setAddrTxHash })

  // 3. Write text records (peerId, blobCID) — separate calls, wait for each
  const setTextTxHashes: Record<string, Hex> = {}
  for (const [key, value] of [
    ['tama.peerId', peerId],
    ['tama.blob', blobCID],
  ] as const) {
    const tx = await wallet.writeContract({
      chain: sepolia,
      account,
      address: ENS_PUBLIC_RESOLVER,
      abi: PublicResolverABI,
      functionName: 'setText',
      args: [node, key, value],
    })
    await publicClient.waitForTransactionReceipt({ hash: tx })
    setTextTxHashes[key] = tx
  }

  return { subnameNode: node, subnameTxHash, setAddrTxHash, setTextTxHashes }
}

/// Reads the AXL peerId for a given pet name. Hub uses this to find the pet's
/// AXL identity for routing (filling Gensyn AXL's discovery gap with ENS).
export async function readPeerIdFromENS(petName: string, rpcUrl: string): Promise<string> {
  const node = petNamehashViaENS(petName)
  const client = makePublicClient(rpcUrl)
  return await client.readContract({
    address: ENS_PUBLIC_RESOLVER,
    abi: PublicResolverABI,
    functionName: 'text',
    args: [node, 'tama.peerId'],
  })
}

/// Reads the 0G blob CID for a given pet name.
export async function readBlobCIDFromENS(petName: string, rpcUrl: string): Promise<string> {
  const node = petNamehashViaENS(petName)
  const client = makePublicClient(rpcUrl)
  return await client.readContract({
    address: ENS_PUBLIC_RESOLVER,
    abi: PublicResolverABI,
    functionName: 'text',
    args: [node, 'tama.blob'],
  })
}

/// Reads the pet wallet address registered in ENS (addr() record).
export async function readPetAddrFromENS(petName: string, rpcUrl: string): Promise<Address> {
  const node = petNamehashViaENS(petName)
  const client = makePublicClient(rpcUrl)
  return await client.readContract({
    address: ENS_PUBLIC_RESOLVER,
    abi: PublicResolverABI,
    functionName: 'addr',
    args: [node],
  })
}

/// Generic text-record reader for arbitrary keys (achievements, attestations, etc.)
export async function readTextRecord(petName: string, key: string, rpcUrl: string): Promise<string> {
  const node = petNamehashViaENS(petName)
  const client = makePublicClient(rpcUrl)
  return await client.readContract({
    address: ENS_PUBLIC_RESOLVER,
    abi: PublicResolverABI,
    functionName: 'text',
    args: [node, key],
  })
}

/// Generic text-record writer.
export async function setTextRecord(
  petName: string,
  key: string,
  value: string,
  rpcUrl: string,
  signerKey: Hex,
): Promise<Hex> {
  const node = petNamehashViaENS(petName)
  const wallet = makeWalletClient(rpcUrl, signerKey)
  return await wallet.writeContract({
    chain: sepolia,
    account: wallet.account!,
    address: ENS_PUBLIC_RESOLVER,
    abi: PublicResolverABI,
    functionName: 'setText',
    args: [node, key, value],
  })
}

/// Update lastSeenBlock heartbeat for a pet — used by KeeperHub conditional
/// mailbox workflow to know when a pet is "online enough" to receive a gift.
export async function heartbeatLastSeen(petName: string, rpcUrl: string, signerKey: Hex): Promise<Hex> {
  const client = makePublicClient(rpcUrl)
  const block = await client.getBlockNumber()
  return setTextRecord(petName, 'tama.lastSeenBlock', block.toString(), rpcUrl, signerKey)
}

/// Issue an attestation from one pet to another (Most Creative ENS prize angle).
/// fromPet vouches for toPet with a textual claim. Stored on the toPet's profile
/// as text record `tama.vouches.<fromPetName>` so a single read shows all vouchers.
export async function issueAttestation(
  fromPetName: string,
  toPetName: string,
  claim: string,
  rpcUrl: string,
  signerKey: Hex,
): Promise<Hex> {
  const key = `tama.vouches.${fromPetName}`
  const value = JSON.stringify({ claim, at: Date.now(), by: fromPetName })
  return setTextRecord(toPetName, key, value, rpcUrl, signerKey)
}
