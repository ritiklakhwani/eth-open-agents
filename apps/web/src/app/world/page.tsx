'use client'

import { useEffect, useState } from 'react'
import type { Zone } from 'shared-types'
import { useAccount } from 'wagmi'
import { World, type SceneEventEmitter } from '@/components/World'
import { MailboxFlow } from '@/components/MailboxFlow'
import { SubscriptionPanel } from '@/components/SubscriptionPanel'
import { BattleArena } from '@/components/BattleArena'
import { BreedingFlow } from '@/components/BreedingFlow'
import { GlobalChat } from '@/components/GlobalChat'
import { ZoneActionBanner } from '@/components/ZoneActionBanner'

/**
 * Dev: load petId from URL ?pet= query so you can open two windows with different pets:
 *   http://localhost:3000/world         -> pet 1
 *   http://localhost:3000/world?pet=2   -> pet 2
 *
 * Zone interactions: when the player enters mailbox/office/arena, a "Press E
 * to interact" prompt appears at the bottom. Pressing E opens the matching
 * modal. Closing the modal restores the prompt as long as the player is still
 * standing in the zone. No auto-open — player keeps control.
 */
type InteractiveZone = 'mailbox' | 'office' | 'arena'
const INTERACTIVE: ReadonlyArray<InteractiveZone> = ['mailbox', 'office', 'arena']

const ZONE_LABEL: Record<InteractiveZone, string> = {
  mailbox: 'OPEN MAILBOX',
  office:  'MANAGE SUBS',
  arena:   'ENTER ARENA',
}

function isInteractive(z: Zone | null): z is InteractiveZone {
  return z !== null && (INTERACTIVE as ReadonlyArray<string>).includes(z)
}

export default function WorldPage() {
  const [petId, setPetId] = useState<number | null>(null)
  const [currentZone, setCurrentZone] = useState<Zone | null>(null)
  const [activeModal, setActiveModal] = useState<InteractiveZone | null>(null)
  const [breedingOpen, setBreedingOpen] = useState(false)
  const [scene, setScene] = useState<SceneEventEmitter | null>(null)
  const { address } = useAccount()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = parseInt(params.get('pet') ?? '', 10)
    const id = Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : 1
    console.log(`[WorldPage] using petId=${id}`)
    setPetId(id)
  }, [])

  // E key opens the modal for the current interactive zone
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'e' && e.key !== 'E') return
      if (activeModal !== null) return                  // already open
      if (!isInteractive(currentZone)) return           // not in an interactive zone
      // Don't capture E if user is typing in an input/textarea
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      setActiveModal(currentZone)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentZone, activeModal])

  if (petId === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-cyan)] tracking-widest animate-blink">
          LOADING...
        </p>
      </div>
    )
  }

  const showPrompt = isInteractive(currentZone) && activeModal === null

  return (
    <>
      <World
        petId={petId}
        onZoneEntered={setCurrentZone}
        onBreed={() => setBreedingOpen(true)}
        onSceneReady={setScene}
      />

      {/* Contextual zone-action banner — listens to scene events and offers
          a single primary action for the zone the player is standing in.
          Auto-dismisses on no-action zones (park / society / pond). */}
      <ZoneActionBanner
        scene={scene}
        onOpenMailbox={() => setActiveModal('mailbox')}
        onOpenOffice={() => setActiveModal('office')}
        onOpenBreeding={() => setBreedingOpen(true)}
      />

      {/* "Press E to interact" prompt — only when in an interactive zone
          and no modal is open. Pet keeps moving freely; player chooses when
          to open the modal. */}
      {showPrompt && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 -translate-x-1/2 z-20">
          <div className="border-4 border-[color:var(--color-yellow)] bg-[color:var(--color-bg-mid)] px-5 py-2.5 shadow-[4px_4px_0_0_var(--color-bg-deep)]">
            <p className="font-[family-name:var(--font-pixel)] text-xs tracking-widest text-[color:var(--color-yellow)] animate-blink">
              [ E ] {ZONE_LABEL[currentZone as InteractiveZone]}
            </p>
          </div>
        </div>
      )}

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
      <BreedingFlow
        open={breedingOpen}
        onClose={() => setBreedingOpen(false)}
        petId={petId}
        ownerAddress={address}
      />

      {/* Global human-owner chat — bottom-right, collapsible */}
      <GlobalChat />
    </>
  )
}
