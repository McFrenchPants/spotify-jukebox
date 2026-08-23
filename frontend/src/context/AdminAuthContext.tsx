import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { adminLogin } from '../lib/api'

const TOKEN_KEY = 'jukebox_admin_token'
const EXPIRES_KEY = 'jukebox_admin_token_expires'

export interface AdminAuthContextValue {
  token: string | null
  isAuthenticated: boolean
  login: (pin: string) => Promise<void>
  logout: () => void
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined)

/** Reads the stored token/expiry pair, clearing it (and returning null) if it's already expired. */
function readStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY)
  const expiresAt = localStorage.getItem(EXPIRES_KEY)

  if (!token || !expiresAt) return null

  if (Date.parse(expiresAt) <= Date.now()) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRES_KEY)
    return null
  }

  return token
}

/**
 * Parallel to SessionContext.tsx's guest-token pattern, but for the admin
 * PIN-gated token: login is user-initiated (not bootstrapped on mount), uses
 * a different storage key/header, and has a much shorter (3h) TTL that's
 * checked against `expiresAt` on every mount rather than assumed valid.
 * Scoped locally to the Settings tab (see SettingsPage.tsx) rather than
 * wrapped around the whole app in main.tsx.
 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken())

  const login = useCallback(async (pin: string) => {
    const result = await adminLogin(pin)
    localStorage.setItem(TOKEN_KEY, result.token)
    localStorage.setItem(EXPIRES_KEY, result.expiresAt)
    setToken(result.token)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRES_KEY)
    setToken(null)
  }, [])

  return (
    <AdminAuthContext.Provider value={{ token, isAuthenticated: token !== null, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider')
  }
  return ctx
}
