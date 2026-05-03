'use client'

import { useEffect, useRef, useState } from 'react'
import type { Zone } from 'shared-types'
import { PetInspector } from './PetInspector'

/**
 * Loose Phaser.Scene-shaped object so consumers (e.g. ZoneActionBanner)
 * can subscribe to scene events without importing Phaser into their type
 * graph. Phaser is dynamically imported here to keep it out of SSR.
 */
export interface SceneEventEmitter {
  events: {
    on:   (event: string, fn: (...args: unknown[]) => void) => void
    off:  (event: string, fn: (...args: unknown[]) => void) => void
    emit: (event: string, ...args: unknown[]) => void
  }
}

interface WorldProps {
  petId: number
  /** WebSocket server URL — defaults to localhost for dev */
  socketServerUrl?: string
  /** When true, keyboard input is disabled and modals are suppressed */
  spectator?: boolean
  /** Callback when player enters a zone (for opening modals etc.) */
  onZoneEntered?: (zone: Zone) => void
  /** Callback when user clicks the BREED button on the pet inspector */
  onBreed?: () => void
  /**
   * Surfaces the live Phaser scene up to the page so React components can
   * subscribe to lower-level scene events (`zone-changed`, `partner-enter`)
   * without re-implementing the dynamic-import dance. Called once when the
   * scene boots and again with `null` on teardown.
   */
  onSceneReady?: (scene: SceneEventEmitter | null) => void
}

/**
 * React wrapper around the Phaser game. Mounts WorldScene, handles cleanup,
 * surfaces zone-change events to React (so HUD modals can react).
 *
 * Phaser is dynamically imported because it touches `window` and breaks SSR.
 */
export function World({ petId, socketServerUrl, spectator, onZoneEntered, onBreed, onSceneReady }: WorldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const gameRef = useRef<unknown>(null) // Phaser.Game; typed loosely to avoid SSR import
  const [zone, setZone] = useState<Zone>('park')

  // Latest-ref pattern: keep onZoneEntered out of the Phaser-init useEffect deps
  // so the scene doesn't tear down + restart (which teleports the pet to spawn)
  // every time the parent re-renders (e.g. on modal open/close).
  const onZoneEnteredRef = useRef(onZoneEntered)
  useEffect(() => { onZoneEnteredRef.current = onZoneEntered })
  const onSceneReadyRef = useRef(onSceneReady)
  useEffect(() => { onSceneReadyRef.current = onSceneReady })

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
        // We don't play audio; disable Phaser's WebAudio context to silence
        // the "Cannot suspend/resume a closed AudioContext" hot-reload spam.
        audio: { noAudio: true },
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
      game.scene.add('WorldScene', WorldScene, true, { petId, socketServerUrl, spectator })

      // Listen for zone-change events from the scene (after a tick to ensure it's running)
      setTimeout(() => {
        const scene = game.scene.getScene('WorldScene')
        if (scene) {
          scene.events.on('zone-changed', (newZone: Zone) => {
            setZone(newZone)
            onZoneEnteredRef.current?.(newZone)
          })
          // Surface the scene to consumers (banner, etc.) so they can
          // subscribe to lower-level scene events on their own.
          onSceneReadyRef.current?.(scene as unknown as SceneEventEmitter)
        }
      }, 100)

      cleanup = () => {
        // Tell consumers the scene is gone before we destroy the game so they
        // can drop their listeners cleanly.
        onSceneReadyRef.current?.(null)
        game.destroy(true)
      }
    })()

    return () => {
      canceled = true
      cleanup?.()
    }
  }, [petId, socketServerUrl, spectator])

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top-left HUD: current zone — minimal warm pill matching the map */}
      <div className="pointer-events-none absolute top-4 left-4 z-10">
        <div className="border border-[color:var(--color-yellow)]/40 bg-[rgba(10,12,46,0.7)] backdrop-blur-sm px-3 py-1.5">
          <p className="font-[family-name:var(--font-pixel)] text-[9px] uppercase tracking-widest text-[color:var(--color-ink-low)]">
            Zone
          </p>
          <p className="font-[family-name:var(--font-pixel)] text-xs tracking-wider text-[color:var(--color-yellow)]">
            {zone.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Top-right HUD: pet inspector (stats, ENS, friends) */}
      <div className="pointer-events-none absolute top-4 right-4 z-10">
        <PetInspector petId={petId} onBreed={onBreed} />
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
