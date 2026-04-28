// contracts-sdk — viem ABIs + addresses for deployed contracts
// Owner: Ritik. Filled during Phase 2 (Contracts).
//
// Karmanay's Hub imports from here to watch Mint events, query pet data, etc.

import TamaPetAbi from './abis/TamaPet.json'
import PetWalletFactoryAbi from './abis/PetWalletFactory.json'
import PetWalletAbi from './abis/PetWallet.json'
import BattleEscrowAbi from './abis/BattleEscrow.json'
import SubscriptionRegistryAbi from './abis/SubscriptionRegistry.json'

export const TamaPetABI = TamaPetAbi
export const PetWalletFactoryABI = PetWalletFactoryAbi
export const PetWalletABI = PetWalletAbi
export const BattleEscrowABI = BattleEscrowAbi
export const SubscriptionRegistryABI = SubscriptionRegistryAbi

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
