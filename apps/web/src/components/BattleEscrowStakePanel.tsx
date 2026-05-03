'use client'

import { useCallback, useEffect, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { encodeFunctionData, erc20Abi, getAddress, type Hash } from 'viem'
import {
  ADDRESSES_SEPOLIA,
  BattleEscrowABI,
  PetWalletABI,
  battleIdToEscrowKey,
  parseBattleEscrowBattlesRead,
} from 'contracts-sdk'
import { PixelButton, PixelCard } from './ui'

const EXPLORER_TX = 'https://sepolia.etherscan.io/tx'

/** Keep eth_call volume low — Alchemy free tier returns 429 if polled too often (see BattleArena STATUS poll). */
const ESCROW_POLL_MS = 6_000

export interface StakeMatchInfo {
  battleId: string
  escrowBattleKey?: string
  /** Hub `pet_a` — must match BattleEscrow on-chain pet1. When omitted, `petId` is treated as pet1. */
  escrowPet1TokenId?: number
  petId: number
  opponent: { tokenId: number; name: string; ensName: string }
  stakeUsdc: number
}

interface PetApiRow {
  walletAddress?: string
  ownerAddress?: string
}

interface BattleEscrowStakePanelProps {
  match: StakeMatchInfo
}

export function BattleEscrowStakePanel({ match }: BattleEscrowStakePanelProps) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending, reset: resetWrite } = useWriteContract()

  const chainPet1TokenId = match.escrowPet1TokenId ?? match.petId
  const chainPet2TokenId =
    match.escrowPet1TokenId != null
      ? (match.petId === chainPet1TokenId ? match.opponent.tokenId : match.petId)
      : match.opponent.tokenId

  const [pet1Wallet, setPet1Wallet] = useState<`0x${string}` | null>(null)
  const [pet2Wallet, setPet2Wallet] = useState<`0x${string}` | null>(null)
  const [pet1Owner, setPet1Owner] = useState<string | null>(null)
  const [pet2Owner, setPet2Owner] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [onChainPet1, setOnChainPet1] = useState<`0x${string}` | null>(null)
  const [onChainPet2, setOnChainPet2] = useState<`0x${string}` | null>(null)
  const [pet1Staked, setPet1Staked] = useState(false)
  const [pet2Staked, setPet2Staked] = useState(false)
  const [battleExists, setBattleExists] = useState(false)

  const [fundTx, setFundTx] = useState<Hash | null>(null)
  const [approveSkipped, setApproveSkipped] = useState(false)
  const [approveTx, setApproveTx] = useState<Hash | null>(null)
  const [stakeTx, setStakeTx] = useState<Hash | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)
  const [stepErrorTone, setStepErrorTone] = useState<'warn' | 'error'>('error')
  /** Sepolia RPC rate limit (e.g. Alchemy 429) — poll less aggressively and warn user. */
  const [rpcWarn, setRpcWarn] = useState<string | null>(null)

  const escrowKey =
    (match.escrowBattleKey as `0x${string}` | undefined) ?? battleIdToEscrowKey(match.battleId)
  const stakeWei = BigInt(Math.round(match.stakeUsdc * 1_000_000))

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    ;(async () => {
      try {
        const [ra, rb] = await Promise.all([
          fetch(`/api/pets/${chainPet1TokenId}`, { cache: 'no-store' }).then((r) => r.json()),
          fetch(`/api/pets/${chainPet2TokenId}`, { cache: 'no-store' }).then((r) => r.json()),
        ])
        const pa = ra?.pet as PetApiRow | undefined
        const pb = rb?.pet as PetApiRow | undefined
        if (cancelled) return
        if (!pa?.walletAddress || pa.walletAddress === '0x0000000000000000000000000000000000000000') {
          setLoadError(`Could not load BattleEscrow pet1 wallet (token ${chainPet1TokenId})`)
          return
        }
        if (!pb?.walletAddress || pb.walletAddress === '0x0000000000000000000000000000000000000000') {
          setLoadError(`Could not load BattleEscrow pet2 wallet (token ${chainPet2TokenId})`)
          return
        }
        setPet1Wallet(getAddress(pa.walletAddress as `0x${string}`))
        setPet2Wallet(getAddress(pb.walletAddress as `0x${string}`))
        setPet1Owner(pa.ownerAddress ? getAddress(pa.ownerAddress as `0x${string}`).toLowerCase() : null)
        setPet2Owner(pb.ownerAddress ? getAddress(pb.ownerAddress as `0x${string}`).toLowerCase() : null)
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [chainPet1TokenId, chainPet2TokenId])

  const pollBattle = useCallback(async () => {
    if (!publicClient) return
    try {
      const raw = await publicClient.readContract({
        address: ADDRESSES_SEPOLIA.BattleEscrow,
        abi: BattleEscrowABI,
        functionName: 'battles',
        args: [escrowKey],
      })
      const row = parseBattleEscrowBattlesRead(raw)
      if (!row) return
      const p1 = row.pet1
      const exists = p1 !== '0x0000000000000000000000000000000000000000'
      setBattleExists(exists)
      if (exists) {
        setOnChainPet1(getAddress(row.pet1))
        setOnChainPet2(getAddress(row.pet2))
      } else {
        setOnChainPet1(null)
        setOnChainPet2(null)
      }
      setPet1Staked(row.pet1Staked)
      setPet2Staked(row.pet2Staked)
      setRpcWarn(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('429') || msg.toLowerCase().includes('too many requests')) {
        setRpcWarn(
          'Sepolia RPC rate limit (429). Wait ~30s, use one browser tab, or set NEXT_PUBLIC_SEPOLIA_RPC_URL to a public endpoint (e.g. publicnode.com) in apps/web/.env.local.',
        )
      }
    }
  }, [publicClient, escrowKey])

  useEffect(() => {
    void pollBattle()
    const t = setInterval(() => void pollBattle(), ESCROW_POLL_MS)
    return () => clearInterval(t)
  }, [pollBattle])

  const correctChain = chainId === sepolia.id

  const addrLc = address?.toLowerCase() ?? ''
  const iOwnPet1 = !!(addrLc && pet1Owner && addrLc === pet1Owner)
  const iOwnPet2 = !!(addrLc && pet2Owner && addrLc === pet2Owner)

  const signingSlot: 'pet1' | 'pet2' | null =
    iOwnPet1 && !pet1Staked ? 'pet1' : iOwnPet2 && !pet2Staked ? 'pet2' : null

  const signingWallet =
    signingSlot === 'pet1' ? pet1Wallet : signingSlot === 'pet2' ? pet2Wallet : null
  const myStakeDone = signingSlot === 'pet1' ? pet1Staked : signingSlot === 'pet2' ? pet2Staked : false

  useEffect(() => {
    setFundTx(null)
    setApproveSkipped(false)
    setApproveTx(null)
    setStakeTx(null)
    setStepError(null)
    setStepErrorTone('error')
  }, [signingWallet])

  const walletsMatchEscrow =
    !battleExists ||
    (onChainPet1 &&
      onChainPet2 &&
      pet1Wallet &&
      pet2Wallet &&
      onChainPet1.toLowerCase() === pet1Wallet.toLowerCase() &&
      onChainPet2.toLowerCase() === pet2Wallet.toLowerCase())

  const allowanceReady = approveSkipped || approveTx !== null
  const canShowFundButton =
    !!signingWallet &&
    !!signingSlot &&
    !myStakeDone &&
    correctChain
  const canShowStakeButtons =
    !!signingWallet &&
    !!signingSlot &&
    battleExists &&
    !myStakeDone &&
    walletsMatchEscrow &&
    correctChain

  async function runApprove() {
    if (!publicClient || !signingWallet || !correctChain) return
    setStepError(null)
    setStepErrorTone('error')
    resetWrite()
    try {
      const allowance = await publicClient.readContract({
        address: ADDRESSES_SEPOLIA.USDC,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [signingWallet, ADDRESSES_SEPOLIA.BattleEscrow],
      })
      if (allowance >= stakeWei) {
        setApproveSkipped(true)
        return
      }
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [ADDRESSES_SEPOLIA.BattleEscrow, stakeWei],
      })
      const hash = await writeContractAsync({
        address: signingWallet,
        abi: PetWalletABI,
        functionName: 'execute',
        args: [ADDRESSES_SEPOLIA.USDC, BigInt(0), data],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setApproveTx(hash)
    } catch (e) {
      const formatted = formatRpcError(e)
      setStepError(formatted.message)
      setStepErrorTone(formatted.tone)
    }
  }

  async function runFundWallet() {
    if (!publicClient || !signingWallet || !correctChain) return
    setStepError(null)
    setStepErrorTone('error')
    resetWrite()
    try {
      const hash = await writeContractAsync({
        address: ADDRESSES_SEPOLIA.USDC,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [signingWallet, stakeWei],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setFundTx(hash)
    } catch (e) {
      const formatted = formatRpcError(e)
      setStepError(formatted.message)
      setStepErrorTone(formatted.tone)
    }
  }

  async function runStake() {
    if (!publicClient || !signingWallet || !correctChain) return
    setStepError(null)
    setStepErrorTone('error')
    resetWrite()
    try {
      const data = encodeFunctionData({
        abi: BattleEscrowABI,
        functionName: 'stake',
        args: [escrowKey],
      })
      const hash = await writeContractAsync({
        address: signingWallet,
        abi: PetWalletABI,
        functionName: 'execute',
        args: [ADDRESSES_SEPOLIA.BattleEscrow, BigInt(0), data],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setStakeTx(hash)
      void pollBattle()
    } catch (e) {
      const formatted = formatRpcError(e)
      setStepError(formatted.message)
      setStepErrorTone(formatted.tone)
    }
  }

  return (
    <PixelCard variant="warm" title="STEP 1 — FUND, APPROVE, STAKE">
      {(!pet1Staked || !pet2Staked) && (
        <div className="mb-3 border-2 border-[color:var(--color-yellow)] bg-[color:var(--color-bg-deep)] p-2 sm:p-3">
          <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink)]">
            <span className="font-[family-name:var(--font-pixel)] text-[color:var(--color-yellow)]">ACTION: </span>
            Click <strong>Fund Pet Wallet</strong>, then <strong>Approve USDC</strong>, then{' '}
            <strong>Stake in escrow</strong> below (once per pet slot). Opening the battle from the list does{' '}
            <strong>not</strong> stake — MetaMask must confirm these txs.
          </p>
        </div>
      )}
      <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-mid)] mb-3">
        Each side puts in {match.stakeUsdc} USDC. Connect the wallet that <strong>owns your pet NFT</strong>, fund the
        pet wallet, approve USDC, then stake into BattleEscrow.
      </p>

      {loadError && (
        <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)] mb-2">
          ! {loadError}
        </p>
      )}

      {!isConnected && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-yellow)]">
            Connect wallet (owner of pet #{match.petId} or #{match.opponent.tokenId}).
          </span>
          <ConnectButton chainStatus="icon" showBalance={false} />
        </div>
      )}

      {isConnected && !correctChain && (
        <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)] mb-2">
          ! Switch wallet network to Sepolia to stake.
        </p>
      )}

      {isConnected && !signingSlot && (
        <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-yellow)] mb-2">
          ! This wallet is not the on-chain owner of either battle pet. Switch to the owner of pet #
          {match.petId} or #{match.opponent.tokenId}.
        </p>
      )}

      <div className="grid gap-2 mb-3 font-[family-name:var(--font-pixel-readable)] text-xs text-[color:var(--color-ink)]">
        <div className="flex justify-between gap-2">
          <span className="text-[color:var(--color-ink-low)]">Battle</span>
          <span className="truncate font-mono">{match.battleId}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[color:var(--color-ink-low)]">Registration</span>
          <span className={battleExists ? 'text-[color:var(--color-lime)]' : 'text-[color:var(--color-yellow)]'}>
            {battleExists ? 'Ready on-chain' : 'Waiting for createBattle…'}
          </span>
        </div>
        {battleExists && !walletsMatchEscrow && (
          <p className="text-[color:var(--color-red)] text-[10px] col-span-full">
            Escrow pet wallets differ from Hub — wait for registration or refresh.
          </p>
        )}
        <div className="flex justify-between gap-2">
          <span className="text-[color:var(--color-ink-low)]">Pet #{chainPet1TokenId} wallet</span>
          <span className="truncate font-mono">{pet1Wallet ? shortAddr(pet1Wallet) : '—'}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[color:var(--color-ink-low)]">Pet #{chainPet2TokenId} wallet</span>
          <span className="truncate font-mono">{pet2Wallet ? shortAddr(pet2Wallet) : '—'}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[color:var(--color-ink-low)]">Pet1 staked</span>
          <span className={pet1Staked ? 'text-[color:var(--color-lime)]' : ''}>{pet1Staked ? 'yes' : 'no'}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[color:var(--color-ink-low)]">Pet2 staked</span>
          <span className={pet2Staked ? 'text-[color:var(--color-lime)]' : ''}>{pet2Staked ? 'yes' : 'no'}</span>
        </div>
        {signingSlot && (
          <div className="flex justify-between gap-2 text-[color:var(--color-cyan)]">
            <span>Your side</span>
            <span className="uppercase">{signingSlot}</span>
          </div>
        )}
      </div>

      {canShowFundButton && (
        <div className="flex flex-col gap-2 mb-2">
          <div className="flex flex-wrap gap-2">
            <PixelButton
              variant="primary"
              disabled={isPending || myStakeDone}
              onClick={() => void runFundWallet()}
            >
              {fundTx ? '1. Funded ✓' : `1. Fund Pet Wallet (${match.stakeUsdc} USDC)`}
            </PixelButton>
            {canShowStakeButtons && (
              <>
                <PixelButton
                  variant="primary"
                  disabled={isPending || allowanceReady}
                  onClick={() => void runApprove()}
                >
                  {approveSkipped ? '2. Allowance OK (skipped)' : approveTx ? '2. Approved ✓' : '2. Approve USDC'}
                </PixelButton>
                <PixelButton
                  variant="danger"
                  disabled={isPending || !allowanceReady}
                  onClick={() => void runStake()}
                >
                  3. Stake in escrow
                </PixelButton>
              </>
            )}
          </div>
          {fundTx && (
            <p className="text-[10px] text-[color:var(--color-ink-low)]">
              Pet wallet funding tx confirmed. If you click again, it will send another {match.stakeUsdc} USDC.
            </p>
          )}
          {!battleExists && (
            <p className="text-[10px] text-[color:var(--color-yellow)]">
              Waiting for BattleEscrow <code>createBattle</code> on-chain. You can fund now; approve and stake appear after registration confirms.
            </p>
          )}
          {approveSkipped && (
            <p className="text-[10px] text-[color:var(--color-ink-low)]">
              Existing allowance covers this stake — no approve tx sent.
            </p>
          )}
        </div>
      )}

      {signingSlot && battleExists && myStakeDone && !(pet1Staked && pet2Staked) && (
        <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-lime)] mb-2">
          Your side is staked. Waiting for the other pet owner to stake…
        </p>
      )}

      {rpcWarn && (
        <p className="font-[family-name:var(--font-pixel-readable)] text-xs text-[color:var(--color-yellow)] mb-2 border border-[color:var(--color-yellow)] p-2">
          ! {rpcWarn}
        </p>
      )}

      {stepError && (
        <p
          className="font-[family-name:var(--font-pixel)] text-xs"
          style={{ color: stepErrorTone === 'warn' ? 'var(--color-yellow)' : 'var(--color-red)' }}
        >
          ! {stepError}
        </p>
      )}

      {(fundTx || approveTx || stakeTx) && (
        <ul className="mt-2 text-[10px] font-mono text-[color:var(--color-cyan)] space-y-1">
          {fundTx && (
            <li>
              Fund:{' '}
              <a className="underline" href={`${EXPLORER_TX}/${fundTx}`} target="_blank" rel="noreferrer">
                {shortAddr(fundTx)}
              </a>
            </li>
          )}
          {approveTx && (
            <li>
              Approve:{' '}
              <a className="underline" href={`${EXPLORER_TX}/${approveTx}`} target="_blank" rel="noreferrer">
                {shortAddr(approveTx)}
              </a>
            </li>
          )}
          {stakeTx && (
            <li>
              Stake:{' '}
              <a className="underline" href={`${EXPLORER_TX}/${stakeTx}`} target="_blank" rel="noreferrer">
                {shortAddr(stakeTx)}
              </a>
            </li>
          )}
        </ul>
      )}

      {pet1Staked && pet2Staked && (
        <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-lime)] mt-2">
          ★ Both stakes confirmed — battle feed continues below.
        </p>
      )}
    </PixelCard>
  )
}

function shortAddr(s: string): string {
  if (s.length <= 14) return s
  return `${s.slice(0, 8)}…${s.slice(-6)}`
}

function formatRpcError(e: unknown): { message: string; tone: 'warn' | 'error' } {
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  if (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request') ||
    lower.includes('request rejected') ||
    lower.includes('action_rejected')
  ) {
    return {
      message: 'Transaction cancelled in wallet. Nothing was sent.',
      tone: 'warn',
    }
  }
  if (msg.includes('429') || msg.toLowerCase().includes('too many requests')) {
    return {
      message:
        'RPC rate limited (429). Your transaction may still succeed — check Etherscan. Wait 30s or retry with one tab open.',
      tone: 'warn',
    }
  }
  if (lower.includes('insufficient funds')) {
    return {
      message: 'Not enough balance for this transaction. Check gas and token funds, then try again.',
      tone: 'error',
    }
  }
  return { message: msg.split('\n')[0].slice(0, 220), tone: 'error' }
}
