import { type HTMLAttributes, type ReactNode } from 'react'

type Variant = 'default' | 'pink' | 'cyan' | 'elevated' | 'warm'

interface PixelCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: Variant
  title?: ReactNode
  /** Extra content for the card header — e.g. icons, tags */
  headerRight?: ReactNode
}

// Two style families:
//   "warm" — minimalistic cozy night-town look. Thin warm-yellow border at low
//            opacity, translucent navy bg, no chunky pixel shadow. Used by all
//            in-game modals (Mailbox / Subscription / Breeding / Battle / etc.)
//            so they integrate with the map instead of fighting it.
//   others — original arcade chunky-border look. Kept for landing page + any
//            place that wants the louder feel.
const variantStyles: Record<Variant, { wrap: string; shadow: string; header: string; headerText: string }> = {
  default:  {
    wrap:       'border-4 border-[color:var(--color-border)] bg-[color:var(--color-bg-mid)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-bg-deep)]',
    header:     'border-b-4 border-[color:var(--color-bg-deep)] bg-[color:var(--color-bg-deep)]',
    headerText: 'text-[color:var(--color-ink)]',
  },
  pink: {
    wrap:       'border-4 border-[color:var(--color-pink)] bg-[color:var(--color-bg-mid)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-bg-deep)]',
    header:     'border-b-4 border-[color:var(--color-bg-deep)] bg-[color:var(--color-bg-deep)]',
    headerText: 'text-[color:var(--color-ink)]',
  },
  cyan: {
    wrap:       'border-4 border-[color:var(--color-cyan)] bg-[color:var(--color-bg-mid)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-bg-deep)]',
    header:     'border-b-4 border-[color:var(--color-bg-deep)] bg-[color:var(--color-bg-deep)]',
    headerText: 'text-[color:var(--color-ink)]',
  },
  elevated: {
    wrap:       'border-4 border-[color:var(--color-border-hi)] bg-[color:var(--color-bg-hi)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-bg-deep)]',
    header:     'border-b-4 border-[color:var(--color-bg-deep)] bg-[color:var(--color-bg-deep)]',
    headerText: 'text-[color:var(--color-ink)]',
  },
  // Cozy night-town variant — used by all in-game modals.
  warm: {
    wrap:       'border border-[color:var(--color-yellow)]/35 bg-[rgba(10,12,46,0.86)] backdrop-blur-sm',
    shadow:     '',
    header:     'border-b border-[color:var(--color-yellow)]/20 bg-[rgba(10,12,46,0.5)]',
    headerText: 'text-[color:var(--color-yellow)]',
  },
}

/// Pixel-style card container. Hard border, optional drop-shadow + title bar.
/// Use as the base for HUD panels, stat displays, modal cards, etc.
export function PixelCard({
  variant = 'default',
  title,
  headerRight,
  className = '',
  children,
  ...rest
}: PixelCardProps) {
  const v = variantStyles[variant]
  return (
    <div className={[v.wrap, v.shadow, className].join(' ')} {...rest}>
      {title !== undefined && (
        <div className={`flex items-center justify-between px-4 py-2 ${v.header}`}>
          <h3 className={`font-[family-name:var(--font-pixel)] text-xs tracking-widest uppercase ${v.headerText}`}>
            {title}
          </h3>
          {headerRight}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
