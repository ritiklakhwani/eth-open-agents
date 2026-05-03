// Public-explorer URL builders for partner-integration modal links.
// Every link is a chance for a judge to click and verify the integration is
// real (not stubbed) — they hit Sepolia / ENS app / 0G explorer and see the
// actual on-chain or off-chain proof.
//
// Sepolia chain id 11155111. All deployed addresses live in
// `packages/contracts-sdk/index.ts` as `ADDRESSES_SEPOLIA`.

import { ADDRESSES_SEPOLIA } from 'contracts-sdk'

const ETHERSCAN = 'https://sepolia.etherscan.io'
const ENS_APP   = 'https://sepolia.app.ens.domains'
// 0G has TWO things judges might want to see:
//   1. The blockchain (Galileo testnet) at chainscan-galileo.0g.ai — for txs / addresses
//   2. The storage indexer JSON API at indexer-storage-testnet-turbo.0g.ai — for CIDs
// The chain explorer has NO /storage/<cid> path, so we link to the indexer's
// file-lookup endpoint instead (returns JSON metadata if the CID is registered).
const ZERO_G_CHAIN_EXPLORER  = 'https://chainscan-galileo.0g.ai'
const ZERO_G_STORAGE_INDEXER = 'https://indexer-storage-testnet-turbo.0g.ai'

/// Etherscan token page for a specific TamaPet NFT (shows owner + metadata).
export function etherscanTokenLink(tokenId: number | string): string {
  return `${ETHERSCAN}/token/${ADDRESSES_SEPOLIA.TamaPet}?a=${tokenId}`
}

/// Etherscan address page for any wallet / contract.
export function etherscanAddressLink(addr: string): string {
  return `${ETHERSCAN}/address/${addr}`
}

/// Etherscan transaction page.
export function etherscanTxLink(hash: string): string {
  return `${ETHERSCAN}/tx/${hash}`
}

/// "Read Contract" tab on the TamaPet contract page — judges can call
/// `intelligenceCID(tokenId)` and see the SAME 0G CID we display in the
/// 0G panel. Proves the iNFT pointer lives on Sepolia.
export function etherscanIntelligenceCIDReadLink(): string {
  return `${ETHERSCAN}/address/${ADDRESSES_SEPOLIA.TamaPet}#readContract`
}

/// Sepolia ENS app — renders all text records for the subname beautifully.
export function ensAppLink(name: string): string {
  return `${ENS_APP}/${name}`
}

/// 0G storage indexer file-lookup. Returns JSON file metadata if the CID
/// is registered on the indexer (size, segments, status). Fallback-cached
/// blobs (testnet Flow contract reverts) won't resolve here — that's why
/// the on-chain `intelligenceCID` link on Sepolia is the stronger proof.
export function zeroGIndexerLink(cid: string): string {
  return `${ZERO_G_STORAGE_INDEXER}/file?root=${cid}`
}

/// 0G Galileo testnet chain explorer home — judge can see this is a real
/// running chain, browse recent txs, etc.
export const zeroGChainExplorerHome = ZERO_G_CHAIN_EXPLORER

/// 0G Galileo chainscan transaction page. Returned by the Hub
/// `/api/integration/og-status` endpoint when a real on-chain submission
/// happened (Go CLI captured the tx hash). This is the strongest proof the
/// blob actually hit the chain — judges click and see the tx receipt.
export function zeroGTxLink(hash: string): string {
  return `${ZERO_G_CHAIN_EXPLORER}/tx/${hash}`
}

/// TamaPet contract on Etherscan (general view, not token-specific).
export const tamaPetContractLink = `${ETHERSCAN}/address/${ADDRESSES_SEPOLIA.TamaPet}`

/// All deployed contract addresses, re-exported for convenience.
export const ADDRESSES = ADDRESSES_SEPOLIA
