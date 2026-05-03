'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { PixelButton, PixelCard } from '@/components/ui'
import { AdoptionFlow } from '@/components/AdoptionFlow'
import { PetParade } from '@/components/landing/PetParade'
import { TwinklingStars } from '@/components/landing/TwinklingStars'

/// Landing page — pixel-art game splash inspired by Pumpville / Pet Agent
/// Society. Above-the-fold hero is the showpiece: world-bg.png fills the
/// canvas as a real screenshot of the in-game world, twinkling stars float
/// over the night sky, and a row of pet sprites parades across the cobble-
/// stone street. Below is a lean integrations strip + 3-card "what's inside"
/// row + footer. No marketing fluff — every claim links to a real on-chain
/// proof or live game zone.

const NAV_LINKS: Array<{ label: string; href: string }> = [
  { label: 'DISCOVER',     href: '#whats-inside' },
  { label: 'INTEGRATIONS', href: '#integrations' },
  { label: 'DOCS',         href: 'https://github.com/ritiklakhwani/eth-open-agents' },
]

interface IntegrationCard {
  key:         string
  logo:        string
  name:        string
  description: string
}

const INTEGRATIONS: IntegrationCard[] = [
  { key: 'gensyn',    logo: '/logos/gensyn.png',    name: 'GENSYN AXL', description: 'Peer-to-peer mesh between pet processes' },
  { key: 'ens',       logo: '/logos/ens.png',       name: 'ENS',        description: 'Every pet gets <name>.tama.eth + rich text records' },
  { key: 'keeperhub', logo: '/logos/keeperhub.png', name: 'KEEPERHUB',  description: 'Autonomous workflows: mailbox, allowance, escrow' },
  { key: '0g',        logo: '/logos/0g.png',        name: '0G',         description: 'Encrypted vault for pet brain & memory' },
]

interface FeatureCard {
  emoji:       string
  title:       string
  body:        string
  accentClass: string
}

const FEATURES: FeatureCard[] = [
  {
    emoji:       '★',
    title:       'AUTONOMOUS PETS',
    body:        'Your pet wanders the world, meets others, and chats over an AXL P2P mesh — no input required.',
    accentClass: 'text-[color:var(--color-pink)]',
  },
  {
    emoji:       '◆',
    title:       'REAL ON-CHAIN GIFTS',
    body:        'Send USDC via KeeperHub conditional workflows. The transfer fires when the recipient comes online.',
    accentClass: 'text-[color:var(--color-cyan)]',
  },
  {
    emoji:       '✦',
    title:       'INHERITED TRAITS',
    body:        'Breed pets to mint a child iNFT with parent lineage encoded onchain and a sprite blended via AI.',
    accentClass: 'text-[color:var(--color-lime)]',
  },
]

export default function Home() {
  const [showAdopt, setShowAdopt] = useState(false)
  const { address } = useAccount()

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[color:var(--color-bg-deep)]">
      {/* ── HERO ── */}
      <section className="relative h-screen min-h-[720px] w-full overflow-hidden">
        {/* world-bg.png — the real Phaser-rendered cozy night-town backdrop */}
        <div
          className="absolute inset-0 bg-cover bg-center pixelated"
          style={{
            backgroundImage:    'url(/world-bg.png)',
            // Sit the visible street near the bottom of the hero so the pet
            // parade lands on actual cobblestones rather than empty sky.
            backgroundPosition: 'center 70%',
          }}
          aria-hidden="true"
        />
        {/* Soft navy overlay so headline + nav stay legible over the busy bg */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(10,12,46,0.55) 0%, rgba(10,12,46,0.15) 35%, rgba(10,12,46,0.0) 65%, rgba(10,12,46,0.45) 100%)',
          }}
          aria-hidden="true"
        />

        <TwinklingStars />

        {/* Top bar — logo / nav / wallet */}
        <header className="relative z-20 flex items-center justify-between px-6 py-5 md:px-12">
          <Link href="/" className="flex items-baseline gap-2 group">
            <span className="font-[family-name:var(--font-pixel)] text-xl md:text-2xl text-[color:var(--color-pink)] group-hover:text-[color:var(--color-pink-hi)] transition-colors leading-none">
              PET
            </span>
            <span className="font-[family-name:var(--font-pixel)] text-xl md:text-2xl text-[color:var(--color-yellow)] group-hover:text-white transition-colors leading-none">
              CITY
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest text-[color:var(--color-ink)] hover:text-[color:var(--color-cyan)] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <ConnectButton showBalance={false} chainStatus="icon" />
          </div>
        </header>

        {/* Centered hero copy + CTAs */}
        <div className="relative z-20 flex flex-col items-center justify-center text-center px-6 pt-10 md:pt-20">
          <p className="font-[family-name:var(--font-pixel)] text-[10px] md:text-xs tracking-[0.4em] text-[color:var(--color-cyan)] mb-5 animate-blink">
            ★ ETHGLOBAL OPEN AGENTS ★
          </p>

          <h1 className="font-[family-name:var(--font-pixel)] text-3xl md:text-6xl lg:text-7xl text-stroke-navy leading-tight mb-6 max-w-5xl">
            Adopt. Raise.<br className="md:hidden" /> Earn Trust.
          </h1>

          <p className="font-[family-name:var(--font-pixel-readable)] text-xl md:text-2xl text-[color:var(--color-ink)] mb-2 max-w-2xl text-stroke-navy-sm">
            The trust layer for AI agents.
          </p>
          <p className="font-[family-name:var(--font-pixel-readable)] text-base md:text-lg text-[color:var(--color-ink-mid)] mb-10 max-w-2xl text-stroke-navy-sm">
            Your pet lives onchain — chats, breeds, sends gifts,<br className="hidden md:block" /> earns ENS reputation. Powered by 5 sponsor stacks.
          </p>

          {/* Three CTAs — yellow ADOPT, cyan ENTER, ghost CREDITS */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
            <PixelButton variant="primary" size="lg" onClick={() => setShowAdopt(true)}>
              ★ ADOPT A PET
            </PixelButton>
            <Link href="/world">
              <PixelButton variant="secondary" size="lg">
                ▶ ENTER PETCITY
              </PixelButton>
            </Link>
            <a href="#whats-inside">
              <PixelButton variant="ghost" size="lg">
                ↓ DISCOVER
              </PixelButton>
            </a>
          </div>
        </div>

        {/* Pets walking on the street near the bottom of the hero */}
        <PetParade />
      </section>

      {/* ── WHAT'S INSIDE ── */}
      <section id="whats-inside" className="relative px-6 py-20 md:py-28">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-[family-name:var(--font-pixel)] text-2xl md:text-4xl text-center text-[color:var(--color-pink)] mb-3 animate-reveal">
            WHAT&apos;S INSIDE
          </h2>
          <p className="font-[family-name:var(--font-pixel-readable)] text-lg md:text-xl text-center text-[color:var(--color-ink-mid)] mb-14 max-w-2xl mx-auto animate-reveal">
            Three things every pet does, all backed by real onchain transactions you can click and verify.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="animate-reveal"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <PixelCard variant="default" className="h-full hover:translate-y-[-4px] transition-transform">
                  <div className="flex flex-col gap-3">
                    <span className={`font-[family-name:var(--font-pixel)] text-3xl ${f.accentClass}`}>
                      {f.emoji}
                    </span>
                    <h3 className="font-[family-name:var(--font-pixel)] text-sm tracking-widest text-[color:var(--color-ink)]">
                      {f.title}
                    </h3>
                    <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)] leading-relaxed">
                      {f.body}
                    </p>
                  </div>
                </PixelCard>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS STRIP ── */}
      <section id="integrations" className="relative px-6 py-20 md:py-24 border-t-4 border-[color:var(--color-border)]">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-[family-name:var(--font-pixel)] text-2xl md:text-4xl text-center text-[color:var(--color-cyan)] mb-3 animate-reveal">
            INTEGRATIONS
          </h2>
          <p className="font-[family-name:var(--font-pixel-readable)] text-lg md:text-xl text-center text-[color:var(--color-ink-mid)] mb-14 max-w-2xl mx-auto animate-reveal">
            Five sponsor stacks wired end-to-end. Every claim verifiable on Sepolia or 0G.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {INTEGRATIONS.map((p, i) => (
              <div
                key={p.key}
                className="animate-reveal flex flex-col items-center text-center gap-3 border-2 border-[color:var(--color-border)] bg-[color:var(--color-bg-mid)] p-5 hover:border-[color:var(--color-cyan)] transition-colors"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.logo}
                  alt={p.name}
                  width={56}
                  height={56}
                  className="pixelated"
                />
                <span className="font-[family-name:var(--font-pixel)] text-[11px] tracking-widest text-[color:var(--color-yellow)]">
                  {p.name}
                </span>
                <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-mid)] leading-snug">
                  {p.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative px-6 py-10 border-t-4 border-[color:var(--color-border)] bg-[color:var(--color-bg-deep)]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-ink-low)] tracking-widest">
            © 2026 PETCITY · PRESS START
          </p>
          <p className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-ink-low)] tracking-widest">
            BUILT FOR ETHGLOBAL OPEN AGENTS
          </p>
        </div>
      </footer>

      <AdoptionFlow
        open={showAdopt}
        onClose={() => setShowAdopt(false)}
        ownerAddress={address}
      />
    </main>
  )
}
