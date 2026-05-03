// Verifies BattleEscrow on Sepolia matches repo config (judge = deployer signer,
// escrow + USDC addresses aligned with contracts-sdk / .env).
//
//   pnpm verify:battle-prereqs
//
// Requires SEPOLIA_RPC_URL (or falls back to public Sepolia RPC).

import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createPublicClient, http, getAddress, formatEther } from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { ADDRESSES_SEPOLIA, BattleEscrowABI, battleIdToEscrowKey } from 'contracts-sdk'

const __filename = fileURLToPath(import.meta.url)
config({ path: path.resolve(path.dirname(__filename), '..', '.env') })

/** Same rule as pet-runtime createBattle stake arg (USDC 6 decimals). */
export function stakeUsdcHumanToUnits(amountHuman: string): bigint {
  const n = Number.parseFloat(amountHuman)
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid stake amount: ${amountHuman}`)
  return BigInt(Math.round(n * 1_000_000))
}

function lc(a: string) {
  return getAddress(a).toLowerCase()
}

function ok(msg: string) {
  console.log(`✓ ${msg}`)
}

function fail(msg: string) {
  console.error(`✗ ${msg}`)
}

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
  const escrowEnv = process.env.BATTLE_ESCROW_ADDRESS?.trim()
  const deployerEnv = process.env.DEPLOYER_ADDRESS?.trim()
  const usdcEnv = process.env.USDC_SEPOLIA?.trim()
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined

  const sdkEscrow = ADDRESSES_SEPOLIA.BattleEscrow
  const sdkUsdc = ADDRESSES_SEPOLIA.USDC

  if (escrowEnv && lc(escrowEnv) !== lc(sdkEscrow)) {
    fail(`BATTLE_ESCROW_ADDRESS (${escrowEnv}) !== ADDRESSES_SEPOLIA.BattleEscrow (${sdkEscrow})`)
    process.exitCode = 1
  } else {
    ok(`BATTLE_ESCROW_ADDRESS matches contracts-sdk BattleEscrow (${sdkEscrow})`)
  }

  if (usdcEnv && lc(usdcEnv) !== lc(sdkUsdc)) {
    fail(`USDC_SEPOLIA (${usdcEnv}) !== ADDRESSES_SEPOLIA.USDC (${sdkUsdc})`)
    process.exitCode = 1
  } else {
    ok(`USDC_SEPOLIA matches contracts-sdk USDC (${sdkUsdc})`)
  }

  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) })
  const escrow = getAddress(sdkEscrow)

  const onChainJudge = await client.readContract({
    address: escrow,
    abi: BattleEscrowABI,
    functionName: 'judge',
  })
  const onChainUsdc = await client.readContract({
    address: escrow,
    abi: BattleEscrowABI,
    functionName: 'usdc',
  })

  if (lc(onChainUsdc) !== lc(sdkUsdc)) {
    fail(`BattleEscrow.usdc() on chain (${onChainUsdc}) !== ADDRESSES_SEPOLIA.USDC (${sdkUsdc})`)
    process.exitCode = 1
  } else {
    ok('BattleEscrow.usdc() on Sepolia matches contracts-sdk USDC')
  }

  let signerFromKey: string | null = null
  if (privateKey && /^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    signerFromKey = privateKeyToAccount(privateKey).address
    if (lc(onChainJudge) !== lc(signerFromKey)) {
      fail(
        `BattleEscrow.judge() (${onChainJudge}) !== address from DEPLOYER_PRIVATE_KEY (${signerFromKey}). settle() will revert NotAuthorizedJudge.`,
      )
      process.exitCode = 1
    } else {
      ok('BattleEscrow.judge() matches address derived from DEPLOYER_PRIVATE_KEY (settle signer)')
    }
    const wei = await client.getBalance({ address: signerFromKey as `0x${string}` })
    console.log(`\nDeployer (${signerFromKey}) Sepolia ETH balance: ${formatEther(wei)} ETH`)
    if (wei === 0n) {
      console.warn('! Zero ETH — fund this address on Sepolia or settle txs will fail.')
    }
    if (deployerEnv && lc(signerFromKey) !== lc(deployerEnv)) {
      fail(`DEPLOYER_ADDRESS (${deployerEnv}) !== address from DEPLOYER_PRIVATE_KEY (${signerFromKey})`)
      process.exitCode = 1
    } else if (deployerEnv) {
      ok('DEPLOYER_ADDRESS matches DEPLOYER_PRIVATE_KEY')
    }
  } else if (deployerEnv) {
    if (lc(onChainJudge) !== lc(deployerEnv)) {
      fail(
        `BattleEscrow.judge() (${onChainJudge}) !== DEPLOYER_ADDRESS (${deployerEnv}). Set DEPLOYER_PRIVATE_KEY to match judge or call setJudge.`,
      )
      process.exitCode = 1
    } else {
      ok('BattleEscrow.judge() matches DEPLOYER_ADDRESS (set DEPLOYER_PRIVATE_KEY to this key to settle)')
    }
    const weiEnv = await client.getBalance({ address: getAddress(deployerEnv) })
    console.log(`\nDeployer (${getAddress(deployerEnv)}) Sepolia ETH balance: ${formatEther(weiEnv)} ETH`)
    if (weiEnv === 0n) {
      console.warn('! Zero ETH — fund this address on Sepolia or settle txs will fail.')
    }
  } else {
    console.warn('! Skipping judge vs signer check: set DEPLOYER_PRIVATE_KEY and/or DEPLOYER_ADDRESS')
    console.log(`  On-chain judge: ${onChainJudge}`)
  }

  // Stake encoding sanity (documented single rule)
  const samples = ['1', '5', '1.5', '0.000001']
  console.log('\nStake amount encoding (USDC 6 decimals, createBattle arg):')
  for (const s of samples) {
    console.log(`  "${s}" USDC → ${stakeUsdcHumanToUnits(s)} wei`)
  }

  const sampleBid = 'battle-a1b2c3d4e5f67890'
  console.log('\nBattle id → escrow bytes32 (use battleIdToEscrowKey everywhere):')
  console.log(`  ${sampleBid} → ${battleIdToEscrowKey(sampleBid)}`)

  if (process.exitCode) {
    console.error('\nFix mismatches (redeploy, update .env, or BattleEscrow.setJudge from owner) and re-run.')
  } else {
    console.log('\nAll prerequisite checks passed.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
