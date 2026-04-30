'use client'

import { useEffect, useState } from 'react'
import { World } from '@/components/World'

/**
 * Dev: load petId from URL ?pet= query so you can open two windows with different pets:
 *   http://localhost:3000/world         → pet 1
 *   http://localhost:3000/world?pet=2   → pet 2
 *   http://localhost:3000/world?pet=3   → pet 3
 *
 * Renders a loading state until petId is determined to avoid Phaser boot races.
 */
export default function WorldPage() {
  const [petId, setPetId] = useState<number | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = parseInt(params.get('pet') ?? '', 10)
    const id = Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : 1
    console.log(`[WorldPage] using petId=${id} (search="${window.location.search}")`)
    setPetId(id)
  }, [])

  if (petId === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-cyan)] tracking-widest animate-blink">
          LOADING...
        </p>
      </div>
    )
  }

  return <World petId={petId} />
}
