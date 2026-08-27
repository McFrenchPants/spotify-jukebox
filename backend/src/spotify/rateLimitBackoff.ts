/**
 * Shared rate-limit backoff state for the automatic background pollers
 * (nowPlaying.ts's now-playing poll and device-status check). When Spotify
 * returns a 429, its own client-side rate limiting is already the real
 * constraint — our job is just to stop our own recurring polls from
 * compounding it (or from repeatedly re-triggering it right as the window
 * resets), not to prevent every Spotify call app-wide. On-demand,
 * user-triggered calls (search, an admin manually retrying the device list,
 * queueing a track) are NOT gated by this — they should still attempt a real
 * call and surface a real error, since silently blocking a human-initiated
 * action based on our own guess would be more confusing than a clear 429.
 *
 * This exists because a real production incident showed why it matters: two
 * independent instances of this app's backend (local dev + a Home Assistant
 * OS Add-on deployment) were both polling the same Spotify account
 * simultaneously, roughly doubling background request volume and tripping
 * Spotify's rate limit — which then didn't recover on page reload, because
 * both pollers kept re-triggering it every ~4s regardless.
 */

const DEFAULT_BACKOFF_SECONDS = 30;

let blockedUntil = 0;

/** True while an active backoff window (from a recent 429) is in effect. */
export function isRateLimited(): boolean {
  return Date.now() < blockedUntil;
}

/**
 * Inspects a fetch Response for a 429 and, if found, arms the backoff window
 * — using Spotify's `Retry-After` header (seconds) when present, or a
 * default otherwise. No-ops (returns false) for any other status. Safe to
 * call on every Spotify response; only actually does anything on a 429.
 */
export function recordRateLimitFromResponse(response: {
  status: number;
  headers: { get(name: string): string | null };
}): boolean {
  if (response.status !== 429) {
    return false;
  }

  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  const seconds =
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds
      : DEFAULT_BACKOFF_SECONDS;

  blockedUntil = Date.now() + seconds * 1000;
  return true;
}

/** Test-only: clears any active backoff window. */
export function resetRateLimitForTests(): void {
  blockedUntil = 0;
}
