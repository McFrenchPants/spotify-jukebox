import type { ReactNode } from 'react'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface ToastProps {
  variant?: ToastVariant
  title: string
  description?: ReactNode
  onDismiss?: () => void
}

const variantStyles: Record<ToastVariant, { border: string; dot: string }> = {
  success: { border: 'border-l-success', dot: 'bg-success' },
  error: { border: 'border-l-error', dot: 'bg-error' },
  warning: { border: 'border-l-warning', dot: 'bg-warning' },
  info: { border: 'border-l-accent', dot: 'bg-accent' },
}

/**
 * Transient notification. Use `success` for confirmations (track queued),
 * `error` for failures, `warning` for guardrail-rejection messages
 * (explicit content blocked, duplicate track, rate limit), `info` for
 * neutral status. Toasts are presentational here — mounting/auto-dismiss
 * timing is a later-phase concern (a toast host/queue).
 */
export function Toast({ variant = 'info', title, description, onDismiss }: ToastProps) {
  const styles = variantStyles[variant]
  return (
    <div
      role="status"
      className={`flex w-full max-w-sm items-start gap-3 rounded-md border border-border border-l-4 ${styles.border} bg-surface-raised p-4 shadow-lg transition-base`}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-text-primary">{title}</p>
        {description && (
          <p className="mt-1 text-caption text-text-secondary">{description}</p>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-text-muted transition-fast hover:text-text-primary active:scale-90"
        >
          ✕
        </button>
      )}
    </div>
  )
}
