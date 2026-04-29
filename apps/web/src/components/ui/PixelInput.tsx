'use client'

import { type InputHTMLAttributes, forwardRef } from 'react'

interface PixelInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

/// Pixel-style text input. Hard border, monospace, no rounded corners.
export const PixelInput = forwardRef<HTMLInputElement, PixelInputProps>(
  function PixelInput({ label, error, className = '', ...rest }, ref) {
    return (
      <label className="flex flex-col gap-2">
        {label && (
          <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-ink-mid)]">
            {label}
          </span>
        )}
        <input
          ref={ref}
          className={[
            'w-full border-4 px-3 py-2',
            'bg-[color:var(--color-bg-deep)] text-[color:var(--color-ink)]',
            'font-[family-name:var(--font-pixel-readable)] text-base',
            'placeholder:text-[color:var(--color-ink-low)]',
            error
              ? 'border-[color:var(--color-red)]'
              : 'border-[color:var(--color-border)] focus:border-[color:var(--color-cyan)]',
            'outline-none',
            className,
          ].join(' ')}
          {...rest}
        />
        {error && (
          <span className="text-xs text-[color:var(--color-red)] font-[family-name:var(--font-pixel)]">
            ! {error}
          </span>
        )}
      </label>
    )
  },
)
