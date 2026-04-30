'use client'

import { useEffect, useRef, useState } from 'react'
import type { Zone } from 'shared-types'

interface WorldProps {
  petId: number
  /** WebSocket server URL — defaults to localhost for dev */
  socketServerUrl?: string
  /** Callback when player enters a zone (for opening modals etc.) */
  onZoneEntered?: (zone: Zone) => void
}

/**
 * React wrapper around the Phaser game. Mounts WorldScene, handles cleanup,
 * surfaces zone-change events to React (so HUD modals can react).
 *
 * Phaser is dynamically imported because it touches `window` and breaks SSR.
 */
export function World({ petId, socketServerUrl, onZoneEntered }: WorldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const gameRef = useRef<unknown>(null) // Phaser.Game; typed loosely to avoid SSR import
  const [zone, setZone] = useState<Zone>('park')

  useEffect(() => {
    if (!containerRef.current) return

    let canceled = false
    let cleanup: (() => void) | undefined

    ;(async () => {
      const Phaser = await import('phaser')
      const { WorldScene } = await import('./phaser/WorldScene')

      if (canceled) return

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width: window.innerWidth,
        height: window.innerHeight,
        parent: containerRef.current!,
        pixelArt: true,
        backgroundColor: '#0a0c2e',
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false,
          },
        },
        // No scene array here — we register WorldScene manually with init data
        // so petId/socketServerUrl actually arrive in scene.init().
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      })
      gameRef.current = game

      // Register + auto-start the scene WITH init data
      game.scene.add('WorldScene', WorldScene, true, { petId, socketServerUrl })

      // Listen for zone-change events from the scene (after a tick to ensure it's running)
      setTimeout(() => {
        const scene = game.scene.getScene('WorldScene')
        if (scene) {
          scene.events.on('zone-changed', (newZone: Zone) => {
            setZone(newZone)
            onZoneEntered?.(newZone)
          })
        }
      }, 100)

      cleanup = () => game.destroy(true)
    })()

    return () => {
      canceled = true
      cleanup?.()
    }
  }, [petId, socketServerUrl, onZoneEntered])

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top-left HUD: current zone + controls hint */}
      <div className="pointer-events-none absolute top-4 left-4 z-10">
        <div className="border-4 border-[color:var(--color-pink)] bg-[color:var(--color-bg-mid)] px-4 py-2 shadow-[4px_4px_0_0_var(--color-bg-deep)]">
          <p className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-ink-mid)]">
            Zone
          </p>
          <p className="font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-pink)]">
            {zone.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Bottom-center: controls hint */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <div className="border-2 border-[color:var(--color-border)] bg-[color:var(--color-bg-mid)] px-4 py-1.5">
          <p className="font-[family-name:var(--font-pixel)] text-[10px] tracking-widest text-[color:var(--color-ink-mid)]">
            ← ↑ ↓ → / WASD TO MOVE
          </p>
        </div>
      </div>
    </div>
  )
}
