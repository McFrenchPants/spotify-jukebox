import { useCallback, useRef, useState } from 'react'
import type { ToastProps } from '../components/ui/Toast'

export interface SimpleToastState {
  id: number
  variant: ToastProps['variant']
  title: string
  description?: string
}

const AUTO_DISMISS_MS = 4000

/**
 * Minimal, self-contained "one toast at a time" mechanism. A real
 * stacking/queueing toast host (multiple concurrent toasts, richer timing)
 * is P4.7's job — this just satisfies this task's need to show a success/
 * error toast for queue actions without blocking on that later work.
 */
export function useSimpleToast() {
  const [toast, setToast] = useState<SimpleToastState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextId = useRef(0)

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast(null)
  }, [])

  const showToast = useCallback(
    (variant: ToastProps['variant'], title: string, description?: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      const id = ++nextId.current
      setToast({ id, variant, title, description })
      timerRef.current = setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current))
      }, AUTO_DISMISS_MS)
    },
    []
  )

  return { toast, showToast, dismiss }
}
