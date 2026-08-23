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

/** Shape shared by GET /api/now-playing and the `now-playing` SSE event payload. */
export interface NowPlayingState {
  isPlaying: boolean
  trackId: string | null
  name?: string
  artist?: string
  albumArt?: string | null
  durationMs?: number
  progressMs?: number
}

/** One entry in the pending-queue mirror returned by GET /api/queue. */
export interface QueueEntry {
  id: number
  spotifyTrackId: string
  trackName: string
  artistName: string
  albumArtUrl: string | null
  durationMs: number
  addedBySessionId: string | null
  addedAt: string
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

/**
 * GET /api/now-playing — no guest token required (open read). Snapshot of
 * the current playback state; used for the initial paint before the first
 * `now-playing` SSE event arrives (P4.3).
 */
export async function getNowPlaying(): Promise<NowPlayingState> {
  const res = await fetch('/api/now-playing')

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load now playing: ${res.status}`)
  }

  return (await res.json()) as NowPlayingState
}

/**
 * GET /api/queue — no guest token required (open read). Authoritative
 * pending-queue list, oldest/next-up first; re-fetched on every
 * `queue-update` SSE event rather than reconstructed from deltas (P4.3).
 */
export async function getQueue(): Promise<QueueEntry[]> {
  const res = await fetch('/api/queue')

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load queue: ${res.status}`)
  }

  return (await res.json()) as QueueEntry[]
}

/** One entry in the leaderboard returned by GET /api/leaderboard. */
export interface LeaderboardEntry {
  spotifyTrackId: string
  trackName: string
  artistName: string
  albumArtUrl: string | null
  playCount: number
  lastPlayedAt: string | null
}

/** One entry in the play history returned by GET /api/recent. */
export interface RecentlyPlayedEntry {
  spotifyTrackId: string
  trackName: string
  artistName: string
  albumArtUrl: string | null
  durationMs: number
  playedAt: string
  guestSessionId: string | null
}

/**
 * GET /api/leaderboard?limit= — no guest token required (open read). Sorted
 * by play count descending (ties by most-recent play); blacklisted tracks
 * excluded. Re-fetched on every `leaderboard-update` SSE event (P4.4).
 */
export async function getLeaderboard(limit?: number): Promise<LeaderboardEntry[]> {
  const qs = limit !== undefined ? `?limit=${encodeURIComponent(limit)}` : ''
  const res = await fetch(`/api/leaderboard${qs}`)

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load leaderboard: ${res.status}`)
  }

  return (await res.json()) as LeaderboardEntry[]
}

/**
 * GET /api/recent?limit= — no guest token required (open read). Most-recent
 * first, not blacklist-filtered (it's a historical log).
 */
export async function getRecentlyPlayed(limit?: number): Promise<RecentlyPlayedEntry[]> {
  const qs = limit !== undefined ? `?limit=${encodeURIComponent(limit)}` : ''
  const res = await fetch(`/api/recent${qs}`)

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load recently played: ${res.status}`)
  }

  return (await res.json()) as RecentlyPlayedEntry[]
}

/** Resolved effective permissions returned by GET /api/trust-mode. */
export interface TrustModeState {
  pauseResume: boolean
  skip: boolean
  volume: boolean
}

/**
 * GET /api/trust-mode — no guest token required (public/no-auth). A
 * public-safe subset of admin settings: the already-resolved
 * mode+override booleans for each playback capability, used purely as a UI
 * hint for show/enable state. The actual enforcement happens again
 * server-side on every playback call below (P3.3), so this is fetched once
 * on mount rather than polled/pushed — there's no live-update event for it
 * yet (known gap, see PlaybackControls.tsx).
 */
export async function getTrustMode(): Promise<TrustModeState> {
  const res = await fetch('/api/trust-mode')

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load trust mode: ${res.status}`)
  }

  return (await res.json()) as TrustModeState
}

/**
 * Shared by the four playback control endpoints below. No guest-session
 * header — the gate is the global trust mode, not per-guest identity.
 */
async function postPlaybackAction(path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const errBody = await parseErrorBody(res)
    throw new ApiError(res.status, errBody.error, errBody.message ?? `Playback action failed: ${res.status}`)
  }
}

/** POST /api/playback/pause (P3.3). */
export function pausePlayback(): Promise<void> {
  return postPlaybackAction('/api/playback/pause')
}

/** POST /api/playback/resume (P3.3). */
export function resumePlayback(): Promise<void> {
  return postPlaybackAction('/api/playback/resume')
}

/** POST /api/playback/skip (P3.3). */
export function skipPlayback(): Promise<void> {
  return postPlaybackAction('/api/playback/skip')
}

/** POST /api/playback/volume (P3.3) — volumePercent is an integer 0-100. */
export function setVolume(volumePercent: number): Promise<void> {
  return postPlaybackAction('/api/playback/volume', { volumePercent })
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
