'use client'

import { useEffect, useRef } from 'react'

/// Background music — always on. No toggle UI.
///
/// Browsers block audio autoplay until a user gesture, so we attempt to
/// play on mount and if the browser refuses, attach a one-time pointerdown
/// listener that starts playback on the very first user interaction. The
/// audio element lives in the root layout, so a single track persists
/// across navigation (landing → /world → back) without restarting.
const TRACK_SRC      = '/audio/businessstar-sky-warriors-by-businessstar-386551.mp3'
const DEFAULT_VOLUME = 0.32

export function BgMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.volume = DEFAULT_VOLUME

    let started = false
    const tryPlay = () => {
      if (started) return
      const p = a.play()
      if (p && typeof p.then === 'function') {
        p.then(() => { started = true }).catch(() => { /* will retry on gesture */ })
      } else {
        started = true
      }
    }

    // Optimistic first attempt — works on browsers that allow autoplay
    // (e.g. when the user has previously enabled audio on this origin).
    tryPlay()

    // Fallback: any user gesture (click, tap, key) unlocks audio. We
    // listen once and self-clean.
    const onGesture = () => {
      tryPlay()
      if (started) cleanup()
    }
    function cleanup() {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown',     onGesture)
    }
    window.addEventListener('pointerdown', onGesture, { once: false })
    window.addEventListener('keydown',     onGesture, { once: false })

    return cleanup
  }, [])

  return (
    <audio
      ref={audioRef}
      src={TRACK_SRC}
      loop
      preload="auto"
      autoPlay
    />
  )
}
