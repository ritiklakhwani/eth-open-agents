'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantStyles: Record<Variant, string> = {
  // Warm yellow — matches the lamp-glow HUD palette. Used as the dominant
  // call-to-action across modals (Compose, Next, Confirm, etc.).
  primary:   'bg-[color:var(--color-yellow)] text-[color:var(--color-bg-deep)] border-[color:var(--color-bg-deep)] hover:brightness-105',
  secondary: 'bg-[color:var(--color-cyan)]   text-[color:var(--color-bg-deep)] border-[color:var(--color-bg-deep)] hover:bg-[color:var(--color-cyan-hi)]',
  success:   'bg-[color:var(--color-lime)]   text-[color:var(--color-bg-deep)] border-[color:var(--color-bg-deep)] hover:brightness-110',
  danger:    'bg-[color:var(--color-red)]    text-[color:var(--color-ink)]    border-[color:var(--color-bg-deep)] hover:brightness-110',
  ghost:     'bg-[rgba(10,12,46,0.55)]       text-[color:var(--color-ink)]    border-[color:var(--color-yellow)]/40 hover:bg-[rgba(10,12,46,0.75)] hover:border-[color:var(--color-yellow)]/60',
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-8 py-4 text-base',
}

/// Pixel-perfect button. Hard borders, no radius, no soft hover transitions —
/// all interactions are step-based to feel arcade. Includes drop-shadow that
/// "presses" on click (translates by 2px).
export const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(
  function PixelButton(
    { className = '', variant = 'primary', size = 'md', loading, disabled, children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          // base
          'font-[family-name:var(--font-pixel)]',
          'border-4 uppercase tracking-wider',
          'transition-none', // no smooth transitions — arcade feel
          'select-none cursor-pointer',
          'shadow-[4px_4px_0_0_var(--color-bg-deep)]',
          'active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_var(--color-bg-deep)]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0',
          'focus:outline-none focus:ring-2 focus:ring-[color:var(--color-yellow)] focus:ring-offset-2 focus:ring-offset-[color:var(--color-bg-deep)]',
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(' ')}
        {...rest}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="animate-blink">_</span>
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    )
  },
)
