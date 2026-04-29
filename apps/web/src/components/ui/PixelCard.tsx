import { type HTMLAttributes, type ReactNode } from 'react'

type Variant = 'default' | 'pink' | 'cyan' | 'elevated'

interface PixelCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: Variant
  title?: ReactNode
  /** Extra content for the card header — e.g. icons, tags */
  headerRight?: ReactNode
}

const variantBorder: Record<Variant, string> = {
  default:  'border-[color:var(--color-border)]    bg-[color:var(--color-bg-mid)]',
  pink:     'border-[color:var(--color-pink)]       bg-[color:var(--color-bg-mid)]',
  cyan:     'border-[color:var(--color-cyan)]       bg-[color:var(--color-bg-mid)]',
  elevated: 'border-[color:var(--color-border-hi)]  bg-[color:var(--color-bg-hi)]',
}

/// Pixel-style card container. Hard border, drop-shadow, optional title bar.
/// Use as the base for HUD panels, stat displays, modal cards, etc.
export function PixelCard({
  variant = 'default',
  title,
  headerRight,
  className = '',
  children,
  ...rest
}: PixelCardProps) {
  return (
    <div
      className={[
        'border-4 shadow-[4px_4px_0_0_var(--color-bg-deep)]',
        variantBorder[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {title !== undefined && (
        <div className="flex items-center justify-between border-b-4 border-[color:var(--color-bg-deep)] bg-[color:var(--color-bg-deep)] px-4 py-2">
          <h3 className="font-[family-name:var(--font-pixel)] text-xs tracking-widest uppercase text-[color:var(--color-ink)]">
            {title}
          </h3>
          {headerRight}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
