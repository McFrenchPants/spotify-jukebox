const GUEST_TOKEN_HEADER = 'x-guest-token'
const STORAGE_KEY = 'jukebox_guest_token'

export interface SessionResponse {
  token: string
  sessionId: string
  createdAt: string
  nickname: string | null
  avatar: string | null
}

/**
 * Bootstraps (or resumes) the guest session with the backend.
 *
 * Reads any previously-stored guest token from localStorage and sends it
 * along on `POST /api/session` so an existing session gets reused/touched
 * instead of a fresh one being created every load. Always writes the
 * returned token back to localStorage (even if unchanged) so the two stay
 * in sync. Throws on a non-ok HTTP response — caller decides how to
 * surface that (see SessionContext).
 */
export async function bootstrapSession(): Promise<SessionResponse> {
  const existingToken = localStorage.getItem(STORAGE_KEY)

  const headers: Record<string, string> = {}
  if (existingToken) {
    headers[GUEST_TOKEN_HEADER] = existingToken
  }

  const res = await fetch('/api/session', {
    method: 'POST',
    headers,
  })

  if (!res.ok) {
    throw new Error(`Session bootstrap failed: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as SessionResponse
  localStorage.setItem(STORAGE_KEY, data.token)
  return data
}
