'use client'

// Client-only wrapper. The wallet adapter chain (RainbowKit → wagmi connectors
// → @walletconnect/* under the hood) touches indexedDB/localStorage at module
// init, which crashes Next.js SSR. Dynamic import with ssr:false inside a
// client component keeps the providers entirely on the browser side.

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'

const Web3ProvidersImpl = dynamic(
  () => import('./Web3ProvidersImpl').then(m => m.Web3Providers),
  { ssr: false },
)

export function Web3Providers({ children }: { children: ReactNode }) {
  return <Web3ProvidersImpl>{children}</Web3ProvidersImpl>
}