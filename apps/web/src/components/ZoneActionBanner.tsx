'use client'

import { useEffect, useState } from 'react'
import { PixelButton } from './ui'

/**
 * Subset of Phaser.Scene we actually use. Kept loose so this file does not
 * pull Phaser into its own type graph (Phaser is dynamically imported in the
 * World wrapper to keep it out of the SSR build).
 */
interface SceneLike {
  events: {
    on: (event: string, fn: (...args: unknown[]) => void) => void
    off: (event: string, fn: (...args: unknown[]) => void) => void
  }
}

type PartnerKey = 'gensyn-axl' | 'ens' | 'keeperhub' | '0g'

interface PartnerEnterPayload {
  partner: PartnerKey | string
  label: string
  petId?: number
}

/**
 * Action shape rendered by the banner. Either a main-zone action (mailbox /
 * breeding / office / arena) or a partner-zone action (integration check).
 */
type BannerAction = {
  key: string
  title: string
  buttonLabel: string
  onClick: () => void
}

interface ZoneActionBannerProps {
  /**
   * Live Phaser scene reference. We subscribe to `zone-changed` and
   * `partner-enter` events on this scene's emitter. May be null until the
   * scene has finished booting.
   */
  scene: SceneLike | null

  /** Open the MailboxFlow modal (mounted by the page). */
  onOpenMailbox: () => void
  /** Open the BreedingFlow modal (mounted by the page). */
  onOpenBreeding: () => void
  /** Open the SubscriptionPanel modal (mounted by the page). */
  onOpenOffice: () => void
}

/// Zone names that hide the banner — no contextual action available.
const HIDE_ZONES = new Set(['park', 'society', 'pond'])

/**
 * Floating contextual action banner at the bottom of the /world view.
 * Listens to Phaser scene events and surfaces a single primary action for
 * the zone the player is currently standing in. Auto-dismisses when the
 * player walks into a no-action zone (park / society / pond) or away from
 * a partner row.
 */
export function ZoneActionBanner({
  scene,
  onOpenMailbox,
  onOpenBreeding,
  onOpenOffice,
}: ZoneActionBannerProps) {
  const [action, setAction] = useState<BannerAction | null>(null)

  useEffect(() => {
    if (!scene) return

    function handleZoneChanged(...args: unknown[]) {
      const zoneName = args[0] as string
      if (HIDE_ZONES.has(zoneName)) {
        setAction(null)
        return
      }
      switch (zoneName) {
        case 'mailbox':
          setAction({
            key:         'mailbox',
            title:       'MAILBOX',
            buttonLabel: 'OPEN MAILBOX',
            onClick:     onOpenMailbox,
          })
          return
        case 'breeding':
          setAction({
            key:         'breeding',
            title:       'BREEDING ARENA',
            buttonLabel: 'START BREEDING',
            onClick:     onOpenBreeding,
          })
          return
        case 'office':
          setAction({
            key:         'office',
            title:       'MARKETPLACE',
            buttonLabel: 'BROWSE SUBSCRIPTIONS',
            onClick:     onOpenOffice,
          })
          return
        case 'arena':
          setAction({
            key:         'arena',
            title:       'BATTLEFIELD',
            buttonLabel: 'ENTER BATTLE',
            onClick:     () => alert('Battle queue: stub'),
          })
          return
        default:
          // Unknown / unhandled zone — hide.
          setAction(null)
          return
      }
    }

    function handlePartnerEnter(...args: unknown[]) {
      const payload = args[0] as PartnerEnterPayload | undefined
      if (!payload) return
      const partner = payload.partner
      const label   = payload.label || partner
      setAction({
        key:         `partner-${partner}`,
        title:       label.toUpperCase(),
        buttonLabel: 'RUN INTEGRATION CHECK',
        onClick:     () => alert(`healthcheck for ${partner}: stub`),
      })
    }

    scene.events.on('zone-changed',  handleZoneChanged)
    scene.events.on('partner-enter', handlePartnerEnter)

    return () => {
      // Unsubscribe so we never leak listeners across scene swaps / hot
      // reloads. Using the same fn refs registered above.
      scene.events.off('zone-changed',  handleZoneChanged)
      scene.events.off('partner-enter', handlePartnerEnter)
    }
  }, [scene, onOpenMailbox, onOpenBreeding, onOpenOffice])

  // Render container is always mounted so the fade transition can animate
  // both directions. Visibility is driven by the `visible` flag on the
  // wrapper, while content (title/button) is keyed off `action` to avoid
  // flashing the previous label during the fade-out.
  const visible = action !== null

  return (
    <div
      className={[
        'pointer-events-none fixed bottom-32 left-1/2 -translate-x-1/2 z-30',
        'transition-opacity duration-200 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
      aria-hidden={!visible}
    >
      {action !== null && (
        <div
          key={action.key}
          className="pointer-events-auto flex items-center gap-4 border-4 border-[color:var(--color-cyan)] bg-[color:var(--color-bg-mid)] px-5 py-3 shadow-[4px_4px_0_0_var(--color-bg-deep)]"
        >
          <div className="flex flex-col">
            <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-ink-mid)]">
              Zone
            </span>
            <span className="font-[family-name:var(--font-pixel)] text-sm tracking-widest text-[color:var(--color-cyan)]">
              {action.title}
            </span>
          </div>
          <PixelButton variant="primary" size="sm" onClick={action.onClick}>
            {action.buttonLabel}
          </PixelButton>
        </div>
      )}
    </div>
  )
}
