'use client'

import { useEffect, useState } from 'react'
import type { Zone } from 'shared-types'
import { World } from '@/components/World'
import { MailboxFlow } from '@/components/MailboxFlow'
import { SubscriptionPanel } from '@/components/SubscriptionPanel'
import { BattleArena } from '@/components/BattleArena'

/**
 * Dev: load petId from URL ?pet= query so you can open two windows with different pets:
 *   http://localhost:3000/world         -> pet 1
 *   http://localhost:3000/world?pet=2   -> pet 2
 *
 * Renders a loading state until petId is determined to avoid Phaser boot races.
 *
 * Zone-triggered modals: when the player enters mailbox/office/arena, the
 * matching modal auto-opens. Closing a modal does NOT block re-entry — walking
 * out and back in re-opens it.
 */
type ActiveModal = 'mailbox' | 'office' | 'arena' | null

export default function WorldPage() {
  const [petId, setPetId] = useState<number | null>(null)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = parseInt(params.get('pet') ?? '', 10)
    const id = Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : 1
    console.log(`[WorldPage] using petId=${id}`)
    setPetId(id)
  }, [])

  function onZoneEntered(zone: Zone) {
    if (zone === 'mailbox' || zone === 'office' || zone === 'arena') {
      setActiveModal(zone)
    }
  }

  if (petId === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-cyan)] tracking-widest animate-blink">
          LOADING...
        </p>
      </div>
    )
  }

  return (
    <>
      <World petId={petId} onZoneEntered={onZoneEntered} />

      <MailboxFlow
        open={activeModal === 'mailbox'}
        onClose={() => setActiveModal(null)}
        petId={petId}
      />
      <SubscriptionPanel
        open={activeModal === 'office'}
        onClose={() => setActiveModal(null)}
        petId={petId}
      />
      <BattleArena
        open={activeModal === 'arena'}
        onClose={() => setActiveModal(null)}
        petId={petId}
      />
    </>
  )
}
