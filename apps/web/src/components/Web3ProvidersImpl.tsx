'use client'

// Web3Providers — WagmiProvider + QueryClientProvider + RainbowKitProvider.
// Wraps the entire app at layout.tsx so any client component can call hooks
// like useAccount(), useWriteContract(), etc.
//
// Notes:
//   - We use connectorsForWallets with RainbowKit's wallet adapters so the
//     ConnectButton modal shows branded "MetaMask", "Rainbow", "Coinbase Wallet"
//     etc. rather than generic "Browser Wallet" entries.
//   - We deliberately do NOT include WalletConnect — its underlying @reown/appkit
//     touches indexedDB at module-eval time which crashes Next.js static
//     prerender with "indexedDB is not defined".
//   - cookieStorage keeps connection state SSR-safe.

import { type ReactNode, useState } from 'react'
import { WagmiProvider, createConfig, http, cookieStorage, createStorage } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RainbowKitProvider,
  darkTheme,
  connectorsForWallets,
} from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  rainbowWallet,
  coinbaseWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets'
import '@rainbow-me/rainbowkit/styles.css'

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [metaMaskWallet, rainbowWallet, coinbaseWallet],
    },
    {
      groupName: 'Other',
      wallets: [injectedWallet],
    },
  ],
  {
    appName: 'PetCity',
    // Even though we don't ship WalletConnect, connectorsForWallets requires
    // a projectId. Using "demo" is fine for non-WC wallets; real WC flows
    // would need a real id from cloud.reown.com.
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'demo',
  },
)

const config = createConfig({
  chains: [sepolia],
  connectors,
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  },
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
})

export function Web3Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#ff1e8e',
            accentColorForeground: '#0a0c2e',
            borderRadius: 'none',
            fontStack: 'system',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
