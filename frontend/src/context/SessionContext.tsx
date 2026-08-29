import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { bootstrapSession } from '../lib/session'
import { Skeleton } from '../components/ui/Skeleton'

export interface SessionContextValue {
  token: string | null
  sessionId: string | null
  isLoading: boolean
  error: string | null
  nickname: string | null
  avatar: string | null
  /**
   * Merges the given fields into local state. Plain local setter — does NOT
   * make a network call itself. Callers PATCH via `updateGuestProfile` from
   * api.ts first, then call this with what was actually saved (mirrors the
   * optimistic-update-after-success pattern used elsewhere, e.g.
   * SearchAndQueue.tsx's handleAdd).
   */
  setProfile: (updates: { nickname?: string; avatar?: string }) => void
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
  const [nickname, setNickname] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)

  const setProfile = useCallback((updates: { nickname?: string; avatar?: string }) => {
    if (updates.nickname !== undefined) setNickname(updates.nickname)
    if (updates.avatar !== undefined) setAvatar(updates.avatar)
  }, [])

  useEffect(() => {
    let cancelled = false

    bootstrapSession()
      .then((session) => {
        if (cancelled) return
        setToken(session.token)
        setSessionId(session.sessionId)
        setNickname(session.nickname)
        setAvatar(session.avatar)
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
    <SessionContext.Provider value={{ token, sessionId, isLoading, error, nickname, avatar, setProfile }}>
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
