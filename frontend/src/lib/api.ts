const GUEST_TOKEN_HEADER = 'x-guest-token'

export interface Track {
  id: string
  name: string
  artist: string
  albumArt: string | null
  durationMs: number
  explicit: boolean
}

export type QueueRejectReason =
  | 'explicit'
  | 'duration_too_short'
  | 'duration_too_long'
  | 'duplicate'
  | 'blacklisted'

/**
 * Thrown by the API helpers below on any non-2xx response. Carries the
 * parsed `{error, message}` body (when present) so callers can branch on
 * `code` for guardrail-specific copy, plus optional extras for the two
 * shapes that need them (429's `retryAfterMs`, 422's `reason` — which is
 * the same value as `code` for queueTrack, kept as a separate field mostly
 * for readability at call sites).
 */
export class ApiError extends Error {
  status: number
  code: string | undefined
  retryAfterMs: number | undefined
  reason: QueueRejectReason | undefined

  constructor(
    status: number,
    code: string | undefined,
    message: string,
    extra?: { retryAfterMs?: number; reason?: QueueRejectReason }
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfterMs = extra?.retryAfterMs
    this.reason = extra?.reason
  }
}

async function parseErrorBody(res: Response): Promise<{ error?: string; message?: string; retryAfterMs?: number }> {
  try {
    return (await res.json()) as { error?: string; message?: string; retryAfterMs?: number }
  } catch {
    return {}
  }
}

/** GET /api/search?q= — no guest token required (open read). */
export async function searchTracks(query: string): Promise<Track[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Search failed: ${res.status}`)
  }

  return (await res.json()) as Track[]
}

/** POST /api/queue — requires the guest token from useSession(). */
export async function queueTrack(trackId: string, guestToken: string): Promise<Track> {
  const res = await fetch('/api/queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [GUEST_TOKEN_HEADER]: guestToken,
    },
    body: JSON.stringify({ trackId }),
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    const message = body.message ?? `Could not add track to queue: ${res.status}`

    if (res.status === 429) {
      throw new ApiError(res.status, body.error, message, { retryAfterMs: body.retryAfterMs })
    }

    if (res.status === 422) {
      throw new ApiError(res.status, body.error, message, {
        reason: body.error as QueueRejectReason | undefined,
      })
    }

    throw new ApiError(res.status, body.error, message)
  }

  return (await res.json()) as Track
}
