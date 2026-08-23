import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Toast, type ToastProps } from '../components/ui/Toast'

export interface ToastItem {
  id: number
  variant: ToastProps['variant']
  title: string
  description?: string
}

export interface ToastContextValue {
  showToast: (variant: ToastProps['variant'], title: string, description?: string) => void
}

const AUTO_DISMISS_MS = 4000

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

/**
 * App-wide toast stack (P4.7). Replaces the earlier `useSimpleToast` hook
 * (one toast at a time, instantiated separately per component — see its
 * removed doc comment) with a single shared queue so toasts fired from
 * different screens/components stack instead of overlapping at the same
 * fixed screen position.
 *
 * Each `showToast` call appends a new toast with its own independent
 * auto-dismiss timer (`AUTO_DISMISS_MS`, matching the old hook) rather than
 * canceling/replacing whatever is already showing. The stack is rendered
 * once, at the app root (see RootLayout.tsx), positioned fixed at the
 * bottom with newest toast at the bottom of the stack (closest to the
 * thumb) and older ones pushed up above it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback<ToastContextValue['showToast']>((variant, title, description) => {
    const id = ++nextId.current
    setToasts((prev) => [...prev, { id, variant, title, description }])
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto w-full max-w-sm">
            <Toast variant={t.variant} title={t.title} description={t.description} onDismiss={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
