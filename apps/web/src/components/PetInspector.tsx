'use client'

import { useEffect, useState } from 'react'
import type { Pet } from 'shared-types'
import { PixelCard, StatBar } from './ui'

interface PetInspectorProps {
  petId: number
  /// Polling interval in ms; null disables polling. Default 5s.
  pollIntervalMs?: number | null
}

interface InspectorPayload {
  pet: Pet
  source: 'hub' | 'mock'
  friendsCount: number
}

const ARCHETYPE_COLOR: Record<Pet['archetype'], string> = {
  sage:    'var(--color-cyan)',
  gremlin: 'var(--color-pink)',
  athlete: 'var(--color-lime)',
  joker:   'var(--color-yellow)',
  scholar: 'var(--color-purple)',
}

const ARCHETYPE_BADGE: Record<Pet['archetype'], string> = {
  sage:    '[ S ]',
  gremlin: '[ G ]',
  athlete: '[ A ]',
  joker:   '[ J ]',
  scholar: '[ K ]',
}

/// HUD inspector pinned top-right of /world. Shows pet name, ENS, stat bars,
/// archetype badge, friend count, and a connection indicator (live = Hub
/// online, demo = mock fallback).
export function PetInspector({ petId, pollIntervalMs = 5000 }: PetInspectorProps) {
  const [data, setData] = useState<InspectorPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function fetchOnce() {
      try {
        const res = await fetch(`/api/pets/${petId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as InspectorPayload
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    }

    void fetchOnce()
    if (pollIntervalMs && pollIntervalMs > 0) {
      timer = setInterval(fetchOnce, pollIntervalMs)
    }

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [petId, pollIntervalMs])

  if (error && !data) {
    return (
      <div className="pointer-events-auto">
        <PixelCard variant="default" className="w-72">
          <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)]">
            ! {error}
          </p>
        </PixelCard>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="pointer-events-auto">
        <PixelCard variant="default" className="w-72">
          <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-ink-low)] animate-blink">
            ▒ LOADING ▒
          </p>
        </PixelCard>
      </div>
    )
  }

  const { pet, source, friendsCount } = data
  const archetypeColor = ARCHETYPE_COLOR[pet.archetype]

  return (
    <div className="pointer-events-auto">
      <PixelCard
        variant="pink"
        className="w-72"
        title={
          <span className="flex items-center gap-2">
            <span style={{ color: archetypeColor }}>{ARCHETYPE_BADGE[pet.archetype]}</span>
            <span>{pet.name.toUpperCase()}</span>
          </span>
        }
        headerRight={
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-ink-mid)] hover:text-[color:var(--color-pink)] cursor-pointer"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '[ + ]' : '[ - ]'}
          </button>
        }
      >
        {!collapsed && (
          <div className="flex flex-col gap-3">
            {/* ENS + archetype */}
            <div className="flex flex-col gap-1">
              <Row label="ENS" value={pet.ensName} valueColor="var(--color-cyan)" />
              <Row label="ARCH" value={pet.archetype.toUpperCase()} valueColor={archetypeColor} />
              <Row label="ZONE" value={pet.zone.toUpperCase()} valueColor="var(--color-yellow)" />
            </div>

            {/* Stat bars */}
            <div className="flex flex-col gap-2">
              <StatBar label="MOOD"   value={pet.mood}   variant="mood"   />
              <StatBar label="ENERGY" value={pet.energy} variant="energy" />
              <StatBar label="HUNGER" value={pet.hunger} variant="hunger" />
            </div>

            {/* Friends + wallet */}
            <div className="flex flex-col gap-1">
              <Row label="FRIENDS" value={String(friendsCount)} valueColor="var(--color-lime)" />
              <Row label="WALLET" value={short(pet.walletAddress)} valueColor="var(--color-ink-mid)" />
              <Row label="TOKEN" value={`#${pet.tokenId}`} valueColor="var(--color-ink-mid)" />
            </div>

            {/* Connection indicator */}
            <div
              className="flex items-center justify-between border-t-2 pt-2"
              style={{ borderColor: 'var(--color-bg-deep)' }}
            >
              <span className="font-[family-name:var(--font-pixel)] text-[9px] tracking-widest uppercase text-[color:var(--color-ink-low)]">
                {source === 'hub' ? 'LIVE' : 'DEMO'}
              </span>
              <span
                className="w-2 h-2"
                style={{
                  backgroundColor:
                    source === 'hub' ? 'var(--color-lime)' : 'var(--color-yellow)',
                  boxShadow:
                    source === 'hub'
                      ? '0 0 4px var(--color-lime)'
                      : '0 0 4px var(--color-yellow)',
                }}
              />
            </div>
          </div>
        )}
      </PixelCard>
    </div>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="font-[family-name:var(--font-pixel)] text-[9px] uppercase tracking-widest text-[color:var(--color-ink-low)] shrink-0">
        {label}
      </span>
      <span
        className="font-[family-name:var(--font-pixel-readable)] text-sm truncate"
        style={{ color: valueColor }}
      >
        {value}
      </span>
    </div>
  )
}

function short(s: string): string {
  if (!s) return '—'
  if (s.length <= 14) return s
  return `${s.slice(0, 6)}…${s.slice(-4)}`
}
