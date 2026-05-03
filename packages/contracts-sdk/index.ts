// contracts-sdk — viem ABIs + addresses for deployed contracts
// Owner: Ritik. Filled during Phase 2 (Contracts).
//
// Karmanay's Hub imports from here to watch Mint events, query pet data, etc.

import type { Abi, Hex } from 'viem'
import { keccak256, toBytes } from 'viem'
import TamaPetAbi from './abis/TamaPet.json'
import PetWalletFactoryAbi from './abis/PetWalletFactory.json'
import PetWalletAbi from './abis/PetWallet.json'
import BattleEscrowAbi from './abis/BattleEscrow.json'
import SubscriptionRegistryAbi from './abis/SubscriptionRegistry.json'

export const TamaPetABI             = TamaPetAbi             as Abi
export const PetWalletFactoryABI    = PetWalletFactoryAbi    as Abi
export const PetWalletABI           = PetWalletAbi           as Abi
export const BattleEscrowABI        = BattleEscrowAbi        as Abi
export const SubscriptionRegistryABI = SubscriptionRegistryAbi as Abi

/// Deployed contract addresses (Sepolia, chain id 11155111)
export const ADDRESSES_SEPOLIA = {
  TamaPet: '0x7908833343ccD377A4AdA8665527BCC6a2906974',
  PetWalletFactory: '0x5FaFf2Ec55D75d68DADB7a2Fd44B2f1415e22ecC',
  BattleEscrow: '0x0A119AD7Fa83ED88051e65Ba8fE941fa3cC29841',
  SubscriptionRegistry: '0x6cB862b383954eA0a65da1752aF8CDEf14bb137C',
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  ENSRegistry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
  ENSNameWrapper: '0x0635513f179D50A207757E05759CbD106d7dFcE8',
  ENSPublicResolver: '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
} as const

export const SEPOLIA_CHAIN_ID = 11155111

/**
 * `bytes32` passed to BattleEscrow (`createBattle`, `stake`, `settle`).
 * Hub/runtime use the same UTF-8 string `battleId` (e.g. `battle-a1b2c3d4`);
 * this is always `keccak256(toBytes(battleId))`. Any UI/API building stake
 * calldata must use this helper so on-chain `battleId` matches.
 */
export function battleIdToEscrowKey(battleId: string): Hex {
  return keccak256(toBytes(battleId))
}

/** Row returned by BattleEscrow `battles(bytes32)`. */
export interface BattleEscrowBattlesRow {
  pet1: Hex
  pet2: Hex
  stakeAmount: bigint
  pet1Staked: boolean
  pet2Staked: boolean
  settled: boolean
  winner: Hex
}

const ZERO = '0x0000000000000000000000000000000000000000' as Hex

/**
 * Normalizes `readContract({ functionName: 'battles' })` — viem often decodes
 * the Solidity struct as a **tuple array**, so `.pet1Staked` on the raw value
 * is `undefined` unless parsed by index.
 */
export function parseBattleEscrowBattlesRead(raw: unknown): BattleEscrowBattlesRow | null {
  if (Array.isArray(raw) && raw.length >= 7) {
    return {
      pet1:       raw[0] as Hex,
      pet2:       raw[1] as Hex,
      stakeAmount: raw[2] as bigint,
      pet1Staked: Boolean(raw[3]),
      pet2Staked: Boolean(raw[4]),
      settled:    Boolean(raw[5]),
      winner:     raw[6] as Hex,
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    const pet1 = o.pet1
    const pet2 = o.pet2
    if (typeof pet1 !== 'string' || typeof pet2 !== 'string') return null
    const stake = o.stakeAmount
    const stakeAmount = typeof stake === 'bigint' ? stake : BigInt(String(stake ?? 0))
    const winner = o.winner
    return {
      pet1:       pet1 as Hex,
      pet2:       pet2 as Hex,
      stakeAmount,
      pet1Staked: Boolean(o.pet1Staked),
      pet2Staked: Boolean(o.pet2Staked),
      settled:    Boolean(o.settled),
      winner:     (typeof winner === 'string' ? winner : ZERO) as Hex,
    }
  }
  return null
}