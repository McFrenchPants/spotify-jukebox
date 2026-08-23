import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { bootstrapSession } from '../lib/session'
import { Skeleton } from '../components/ui/Skeleton'

export interface SessionContextValue {
  token: string | null
  sessionId: string | null
  isLoading: boolean
  error: string | null
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

/**
 * Bootstraps the guest session once on mount and makes the result
 * available to the rest of the app via `useSession()`. Renders a minimal
 * loading state while the session call is in flight, and a token-styled
 * error message if it fails (e.g. backend unreachable) instead of
 * silently rendering a broken app underneath.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    bootstrapSession()
      .then((session) => {
        if (cancelled) return
        setToken(session.token)
        setSessionId(session.sessionId)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to start session')
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6">
        <Skeleton variant="circle" />
        <p className="text-caption text-text-muted">Starting your session…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-bg px-6 text-center">
        <p className="text-title text-error">Could not connect</p>
        <p className="text-body text-text-secondary">{error}</p>
      </div>
    )
  }

  return (
    <SessionContext.Provider value={{ token, sessionId, isLoading, error }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return ctx
}
