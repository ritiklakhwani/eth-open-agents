// RPG-style segmented stat bar — used for pet mood/energy/hunger.
// Each "segment" is a pixel-style block; filled portion shows current value.

interface StatBarProps {
  label: string
  value: number          // 0-100
  max?: number           // default 100
  /** Color theme — sets the fill color */
  variant?: 'mood' | 'energy' | 'hunger' | 'xp' | 'health'
  /** Total segments (visual blocks). Default 10. */
  segments?: number
  /** Show the numeric value at the right */
  showValue?: boolean
}

const variantColor: Record<Required<StatBarProps>['variant'], string> = {
  mood:    'bg-[color:var(--color-pink)]',
  energy:  'bg-[color:var(--color-cyan)]',
  hunger:  'bg-[color:var(--color-yellow)]',
  xp:      'bg-[color:var(--color-purple)]',
  health:  'bg-[color:var(--color-lime)]',
}

export function StatBar({
  label,
  value,
  max = 100,
  variant = 'mood',
  segments = 10,
  showValue = true,
}: StatBarProps) {
  const pct = Math.max(0, Math.min(1, value / max))
  const filled = Math.round(pct * segments)

  return (
    <div className="flex items-center gap-3">
      <span className="w-16 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-[color:var(--color-ink-mid)]">
        {label}
      </span>
      <div
        className="flex-1 flex gap-0.5 border-2 border-[color:var(--color-border)] bg-[color:var(--color-bg-deep)] p-0.5"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={[
              'h-3 flex-1',
              i < filled ? variantColor[variant] : 'bg-[color:var(--color-bg-mid)]',
            ].join(' ')}
          />
        ))}
      </div>
      {showValue && (
        <span className="w-12 text-right font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-ink)]">
          {Math.round(value)}/{max}
        </span>
      )}
    </div>
  )
}
