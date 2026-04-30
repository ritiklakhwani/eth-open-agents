'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PixelButton, PixelCard } from '@/components/ui'

export default function Home() {
  const [showCredits, setShowCredits] = useState(false)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      {/* Hero — Press Start 2P retro game splash */}
      <div className="text-center max-w-3xl mx-auto">
        <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-cyan)] tracking-[0.3em] mb-6 animate-blink">
          ★ ETHGLOBAL OPEN AGENTS ★
        </p>

        <h1 className="font-[family-name:var(--font-pixel)] text-4xl md:text-6xl text-[color:var(--color-pink)] mb-8 leading-tight">
          PET<br/>CITY
        </h1>

        <p className="font-[family-name:var(--font-pixel-readable)] text-2xl text-[color:var(--color-ink)] mb-2">
          The trust layer for AI agents.
        </p>
        <p className="font-[family-name:var(--font-pixel-readable)] text-xl text-[color:var(--color-ink-mid)] mb-12">
          Adopt a pet. Raise it. Watch it earn your trust.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-6 items-center justify-center mb-16">
          <Link href="/world">
            <PixelButton variant="primary" size="lg">
              ▶ ENTER PETCITY
            </PixelButton>
          </Link>
          <PixelButton variant="secondary" size="lg" onClick={() => setShowCredits((s) => !s)}>
            ? CREDITS
          </PixelButton>
        </div>

        {/* Credits pop-out */}
        {showCredits && (
          <div className="max-w-md mx-auto mb-12">
            <PixelCard variant="cyan" title="CREDITS">
              <ul className="font-[family-name:var(--font-pixel-readable)] text-lg space-y-2 text-left">
                <li>► Built on Sepolia + 0G testnet</li>
                <li>► Powered by Gensyn AXL</li>
                <li>► ENS-native pet identity</li>
                <li>► KeeperHub autonomous workflows</li>
                <li>► 0G iNFT for pet intelligence</li>
              </ul>
            </PixelCard>
          </div>
        )}

        {/* Track integration badges */}
        <div className="flex flex-wrap gap-3 justify-center">
          {['ETH', 'ENS', 'AXL', 'KEEPERHUB', '0G'].map((track) => (
            <div
              key={track}
              className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest border-2 border-[color:var(--color-border)] px-3 py-1.5 text-[color:var(--color-ink-mid)] bg-[color:var(--color-bg-mid)]"
            >
              {track}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom signature */}
      <p className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-ink-low)] mt-auto pt-12">
        © 2026 PETCITY · PRESS START
      </p>
    </main>
  )
}
