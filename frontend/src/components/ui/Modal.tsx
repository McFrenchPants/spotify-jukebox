import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type ModalLayout = 'modal' | 'sheet'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** "modal" centers as a dialog card; "sheet" docks to the bottom of the screen (better for one-handed phone use). */
  layout?: ModalLayout
}

/**
 * Shared overlay primitive for the admin panel and track-detail views.
 * `sheet` layout is the usual choice on this phone-first app; `modal` is
 * for short confirmations. Closes on backdrop click or Escape.
 */
export function Modal({ open, onClose, title, children, layout = 'sheet' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isSheet = layout === 'sheet'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 transition-base"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full max-w-md border border-border bg-surface-raised p-5 shadow-lg transition-base ${
          isSheet ? 'rounded-t-xl' : 'mx-4 mb-4 rounded-lg sm:mb-0'
        }`}
      >
        {title && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-title text-text-primary">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-sm text-text-muted transition-fast hover:text-text-primary active:scale-90"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
