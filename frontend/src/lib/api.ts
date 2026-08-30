import { getApiBaseUrl } from './backendUrl'

const GUEST_TOKEN_HEADER = 'x-guest-token'
const ADMIN_TOKEN_HEADER = 'x-admin-token'

/**
 * Prefixes `path` with the configured backend base URL. On a plain
 * web/browser deployment `getApiBaseUrl()` is `''`, so this returns `path`
 * unchanged — byte-identical to every fetch call before this helper existed.
 * On the native Android build it resolves against the user-configured LAN
 * backend URL (see lib/backendUrl.ts) since there's no same-origin backend
 * for a relative path to resolve against there.
 */
function apiUrl(path: string): string {
  return `${getApiBaseUrl()}${path}`
}

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
  /** Primary/first artist's Spotify id — empty/absent when nothing is playing (P4.8). */
  artistId?: string
  /**
   * Epoch ms of the last poll attempt that actually completed (backend
   * BACKLOG.md item 9 "Bug A"). Only present on the REST GET /api/now-playing
   * response, not the `now-playing` SSE event payload — optional here so
   * both shapes still satisfy this interface without another type change.
   */
  polledAt?: number
  /**
   * Whether the backend's Spotify poller is currently in an active
   * rate-limit backoff window (i.e. this snapshot may be stale). Same
   * REST-only caveat as polledAt above.
   */
  rateLimited?: boolean
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
  adderNickname: string | null
  adderAvatar: string | null
}

/** GET /api/search?q= — no guest token required (open read). */
export async function searchTracks(query: string): Promise<Track[]> {
  const res = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(query)}`))

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
  const res = await fetch(apiUrl('/api/now-playing'))

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
  const res = await fetch(apiUrl('/api/queue'))

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
  const res = await fetch(apiUrl(`/api/leaderboard${qs}`))

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load leaderboard: ${res.status}`)
  }

  return (await res.json()) as LeaderboardEntry[]
}

/**
 * GET /api/leaderboard/track/:trackId — a single track's full all-time play
 * count, independent of leaderboard ranking (unlike getLeaderboard(), this
 * never misses a track just because it isn't in the top N).
 */
export async function getTrackPlayCount(trackId: string): Promise<number> {
  const res = await fetch(apiUrl(`/api/leaderboard/track/${encodeURIComponent(trackId)}`))

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load play count: ${res.status}`)
  }

  const body = (await res.json()) as { playCount: number }
  return body.playCount
}

/**
 * GET /api/recent?limit= — no guest token required (open read). Most-recent
 * first, not blacklist-filtered (it's a historical log).
 */
export async function getRecentlyPlayed(limit?: number): Promise<RecentlyPlayedEntry[]> {
  const qs = limit !== undefined ? `?limit=${encodeURIComponent(limit)}` : ''
  const res = await fetch(apiUrl(`/api/recent${qs}`))

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
  /**
   * Whether a native "Jukebox device" (Android build with local
   * system-volume control) is registered and currently connected. When both
   * are true, volume commands get routed by the backend to that device over
   * SSE instead of Spotify's Volume API, so the guest-facing volume control
   * should be treated as available even if the resolved Spotify device
   * itself reports supports_volume: false. See PlaybackControls.tsx.
   */
  jukeboxDevice: {
    registered: boolean
    online: boolean
  }
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
  const res = await fetch(apiUrl('/api/trust-mode'))

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
  const res = await fetch(apiUrl(path), {
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

/** POST /api/playback/previous (P4.8) — identical contract to skip, gated by the same `skip` trust-mode capability. */
export function previousPlayback(): Promise<void> {
  return postPlaybackAction('/api/playback/previous')
}

/** POST /api/playback/volume (P3.3) — volumePercent is an integer 0-100. */
export function setVolume(volumePercent: number): Promise<void> {
  return postPlaybackAction('/api/playback/volume', { volumePercent })
}

/** POST /api/queue — requires the guest token from useSession(). */
export async function queueTrack(trackId: string, guestToken: string): Promise<Track> {
  const res = await fetch(apiUrl('/api/queue'), {
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

/** GET /api/artist/:id response shape (P4.8). */
export interface ArtistInfo {
  id: string
  name: string
  genres: string[]
  imageUrl: string | null
  followers: number
}

/** GET /api/artist/:id — public, unauthenticated. */
export async function getArtist(artistId: string): Promise<ArtistInfo> {
  const res = await fetch(apiUrl(`/api/artist/${encodeURIComponent(artistId)}`))

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load artist: ${res.status}`)
  }

  return (await res.json()) as ArtistInfo
}

/* -------------------------------------------------------------------- */
/* P4.6 — Admin panel: PIN login, settings, queue moderation, devices.  */
/* -------------------------------------------------------------------- */

/** POST /api/admin/login response shape. */
export interface AdminLoginResult {
  token: string
  expiresAt: string
}

/** POST /api/admin/login — public (this is the auth entry point itself). */
export async function adminLogin(pin: string): Promise<AdminLoginResult> {
  const res = await fetch(apiUrl('/api/admin/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Login failed: ${res.status}`)
  }

  return (await res.json()) as AdminLoginResult
}

/** GET/PUT /api/admin/settings response shape. */
export interface AdminSettings {
  rateLimitWindowMs: number
  explicitFilterEnabled: boolean
  minDurationMs: number
  maxDurationMs: number
  activeMode: 'restricted' | 'trusted'
  allowPauseResume: boolean | null
  allowSkip: boolean | null
  allowVolume: boolean | null
  allowReorder: boolean | null
  spotifyDeviceId: string | null
}

/** Editable subset accepted by PUT /api/admin/settings (spotifyDeviceId is read-only via this endpoint). */
export type AdminSettingsUpdate = Omit<AdminSettings, 'spotifyDeviceId'>

/** GET /api/admin/settings — requires the admin token from adminLogin(). */
export async function getAdminSettings(token: string): Promise<AdminSettings> {
  const res = await fetch(apiUrl('/api/admin/settings'), {
    headers: { [ADMIN_TOKEN_HEADER]: token },
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load settings: ${res.status}`)
  }

  return (await res.json()) as AdminSettings
}

/**
 * Thrown by updateAdminSettings on a 400 validation failure, whose body
 * carries `{error: "invalid_settings", details: string[]}` — the `details`
 * list of human-readable messages doesn't fit ApiError's generic shape, so
 * it's exposed via this dedicated field for SettingsForm to render.
 */
export class AdminSettingsValidationError extends ApiError {
  details: string[]
  constructor(details: string[]) {
    super(400, 'invalid_settings', details.join(' '))
    this.name = 'AdminSettingsValidationError'
    this.details = details
  }
}

export async function updateAdminSettings(
  token: string,
  partial: Partial<AdminSettingsUpdate>
): Promise<AdminSettings> {
  const res = await fetch(apiUrl('/api/admin/settings'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      [ADMIN_TOKEN_HEADER]: token,
    },
    body: JSON.stringify(partial),
  })

  if (!res.ok) {
    const body = (await parseErrorBody(res)) as { error?: string; message?: string; details?: string[] }
    if (res.status === 400 && Array.isArray(body.details)) {
      throw new AdminSettingsValidationError(body.details)
    }
    throw new ApiError(res.status, body.error, body.message ?? `Failed to update settings: ${res.status}`)
  }

  return (await res.json()) as AdminSettings
}

/** GET /api/admin/queue — requires the admin token. Same entry shape as GET /api/queue. */
export async function getAdminQueue(token: string): Promise<QueueEntry[]> {
  const res = await fetch(apiUrl('/api/admin/queue'), {
    headers: { [ADMIN_TOKEN_HEADER]: token },
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load queue: ${res.status}`)
  }

  return (await res.json()) as QueueEntry[]
}

/** DELETE /api/admin/queue/:id — requires the admin token. */
export async function deleteAdminQueueEntry(token: string, id: number): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/queue/${id}`), {
    method: 'DELETE',
    headers: { [ADMIN_TOKEN_HEADER]: token },
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to remove queue entry: ${res.status}`)
  }
}

/** POST /api/admin/queue/clear — requires the admin token. */
export async function clearAdminQueue(token: string): Promise<void> {
  const res = await fetch(apiUrl('/api/admin/queue/clear'), {
    method: 'POST',
    headers: { [ADMIN_TOKEN_HEADER]: token },
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to clear queue: ${res.status}`)
  }
}

export type BlacklistType = 'track' | 'artist'

/** POST /api/admin/blacklist — requires the admin token. */
export async function postBlacklist(
  token: string,
  body: { type: BlacklistType; value: string }
): Promise<void> {
  const res = await fetch(apiUrl('/api/admin/blacklist'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [ADMIN_TOKEN_HEADER]: token,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await parseErrorBody(res)
    throw new ApiError(res.status, errBody.error, errBody.message ?? `Failed to blacklist: ${res.status}`)
  }
}

/** Spotify playback device, as returned by GET /api/device and POST /api/device/select. */
export interface Device {
  id: string
  name: string
  type: string
  is_active: boolean
  volume_percent: number | null
  /** Whether Spotify's remote volume-control command works on this device (e.g. false for
   *  phones outputting audio via Bluetooth) — a well-known Spotify Connect limitation. */
  supports_volume: boolean
}

/** GET /api/device — public, no admin token needed. */
export async function getDevice(): Promise<{ resolved: Device | null; devices: Device[] }> {
  const res = await fetch(apiUrl('/api/device'))

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load devices: ${res.status}`)
  }

  return (await res.json()) as { resolved: Device | null; devices: Device[] }
}

/** POST /api/device/select — requires the admin token. */
export async function selectDevice(token: string, deviceId: string): Promise<Device> {
  const res = await fetch(apiUrl('/api/device/select'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [ADMIN_TOKEN_HEADER]: token,
    },
    body: JSON.stringify({ deviceId }),
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to select device: ${res.status}`)
  }

  return (await res.json()) as Device
}

/* -------------------------------------------------------------------- */
/* M3.2 — Jukebox device (native Android bridge) registration.          */
/* -------------------------------------------------------------------- */

/** GET /api/admin/jukebox-device — requires the admin token. */
export async function getJukeboxDevice(token: string): Promise<{ clientId: string | null }> {
  const res = await fetch(apiUrl('/api/admin/jukebox-device'), {
    headers: { [ADMIN_TOKEN_HEADER]: token },
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load Jukebox device: ${res.status}`)
  }

  return (await res.json()) as { clientId: string | null }
}

/** POST /api/admin/jukebox-device/register — requires the admin token. */
export async function registerJukeboxDevice(token: string, clientId: string): Promise<{ clientId: string }> {
  const res = await fetch(apiUrl('/api/admin/jukebox-device/register'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [ADMIN_TOKEN_HEADER]: token,
    },
    body: JSON.stringify({ clientId }),
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to register Jukebox device: ${res.status}`)
  }

  return (await res.json()) as { clientId: string }
}

/**
 * GET /api/jukebox-device/mine?clientId= — public, no auth headers needed.
 * Lets any client (guest browser) check whether ITS OWN clientId is the
 * currently-registered "Jukebox device" (Master Device Mode), distinct from
 * the admin-gated getJukeboxDevice()/registerJukeboxDevice() pair above.
 * Backed by GET backend/src/routes/jukeboxDeviceStatus.ts (C1).
 */
export async function getJukeboxDeviceMine(clientId: string): Promise<{ isRegistered: boolean }> {
  const res = await fetch(apiUrl(`/api/jukebox-device/mine?clientId=${encodeURIComponent(clientId)}`))

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load Jukebox device status: ${res.status}`)
  }

  return (await res.json()) as { isRegistered: boolean }
}

/* -------------------------------------------------------------------- */
/* F2 — Favorites + guest profile.                                      */
/* -------------------------------------------------------------------- */

/** One entry in the favorites list returned by GET /api/favorites. */
export interface FavoriteTrack {
  id: number
  guestSessionId: string
  spotifyTrackId: string
  trackName: string
  artistName: string
  albumArtUrl: string | null
  durationMs: number
  favoritedAt: string
}

/** GET /api/favorites — requires the guest token from useSession(). */
export async function getFavorites(guestToken: string): Promise<FavoriteTrack[]> {
  const res = await fetch(apiUrl('/api/favorites'), {
    headers: { [GUEST_TOKEN_HEADER]: guestToken },
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load favorites: ${res.status}`)
  }

  return (await res.json()) as FavoriteTrack[]
}

/** POST /api/favorites — requires the guest token from useSession(). */
export async function addFavorite(trackId: string, guestToken: string): Promise<Track> {
  const res = await fetch(apiUrl('/api/favorites'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [GUEST_TOKEN_HEADER]: guestToken,
    },
    body: JSON.stringify({ trackId }),
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Could not add favorite: ${res.status}`)
  }

  return (await res.json()) as Track
}

/** DELETE /api/favorites/:trackId — requires the guest token from useSession(). Expects 204, no body to parse. */
export async function removeFavorite(trackId: string, guestToken: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/favorites/${encodeURIComponent(trackId)}`), {
    method: 'DELETE',
    headers: { [GUEST_TOKEN_HEADER]: guestToken },
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Could not remove favorite: ${res.status}`)
  }
}

/**
 * GET /api/favorites/status?trackIds=a,b,c — the guest token is optional
 * (the backend returns favoritedByMe: false for every id without one), but
 * must be sent whenever available or favoritedByMe can never come back true
 * for the calling guest. Empty input short-circuits to `{}` without a
 * network round-trip.
 */
export async function getFavoritesStatus(
  trackIds: string[],
  guestToken?: string | null
): Promise<Record<string, { favoritedByMe: boolean; favoritedByAnyone: boolean }>> {
  if (trackIds.length === 0) return {}

  const res = await fetch(apiUrl(`/api/favorites/status?trackIds=${trackIds.map(encodeURIComponent).join(',')}`), {
    headers: guestToken ? { [GUEST_TOKEN_HEADER]: guestToken } : undefined,
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Failed to load favorite status: ${res.status}`)
  }

  return (await res.json()) as Record<string, { favoritedByMe: boolean; favoritedByAnyone: boolean }>
}

/** PATCH /api/session/me — requires the guest token from useSession(). Response mirrors POST /api/session's shape. */
export async function updateGuestProfile(
  updates: { nickname?: string; avatar?: string },
  guestToken: string
): Promise<{ token: string; sessionId: string; createdAt: string; nickname: string | null; avatar: string | null }> {
  const res = await fetch(apiUrl('/api/session/me'), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      [GUEST_TOKEN_HEADER]: guestToken,
    },
    body: JSON.stringify(updates),
  })

  if (!res.ok) {
    const body = await parseErrorBody(res)
    throw new ApiError(res.status, body.error, body.message ?? `Could not update profile: ${res.status}`)
  }

  return (await res.json()) as {
    token: string
    sessionId: string
    createdAt: string
    nickname: string | null
    avatar: string | null
  }
}
