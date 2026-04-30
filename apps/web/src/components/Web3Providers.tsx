'use client'

// Web3Providers — WagmiProvider + QueryClientProvider + RainbowKitProvider.
// Wraps the entire app at layout.tsx so any client component can call hooks
// like useAccount(), useWriteContract(), etc.
//
// Notes:
//   - We use wagmi's createConfig (not RainbowKit's getDefaultConfig) so we
//     skip the WalletConnect / @reown/appkit dependency, which is what
//     crashes Next.js static prerender with "indexedDB is not defined".
//     RainbowKit's UI works fine with injected wallets only (MetaMask etc.).
//   - cookieStorage keeps connection state SSR-safe.

import { type ReactNode, useState } from 'react'
import { WagmiProvider, createConfig, http, cookieStorage, createStorage } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected, metaMask } from 'wagmi/connectors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'

const config = createConfig({
  chains: [sepolia],
  connectors: [injected(), metaMask()],
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
