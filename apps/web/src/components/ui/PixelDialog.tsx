'use client'

import { type ReactNode, useEffect } from 'react'
import { PixelCard } from './PixelCard'

interface PixelDialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** Hide the close button (force user to use action buttons) */
  hideCloseButton?: boolean
  /** Max width — default is 'md' (28rem) */
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap: Record<Required<PixelDialogProps>['size'], string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

/// Modal dialog with pixel-style backdrop + card. Closes on backdrop click or Esc.
export function PixelDialog({
  open,
  onClose,
  title,
  children,
  hideCloseButton,
  size = 'md',
}: PixelDialogProps) {
  // Esc to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop — translucent so the cozy map shows through behind the modal */}
      <div
        className="absolute inset-0 bg-[color:var(--color-bg-deep)]/70 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Card — warm cozy-night variant; matches the HUDs */}
      <div className={`relative w-full ${sizeMap[size]}`}>
        <PixelCard
          variant="warm"
          title={title}
          headerRight={
            !hideCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-ink-low)] hover:text-[color:var(--color-yellow)] cursor-pointer"
              >
                [ X ]
              </button>
            )
          }
        >
          {children}
        </PixelCard>
      </div>
    </div>
  )
}
