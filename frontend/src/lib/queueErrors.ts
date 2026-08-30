import { ApiError } from './api'

/** Human-readable "Xs" / "Xm Ys" from a millisecond duration, rounded up. */
export function formatRetryAfter(retryAfterMs: number): string {
  const totalSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

/**
 * Maps a queue-add failure to distinct, guest-facing copy. The 422
 * guardrail rejections already carry a complete human-readable sentence
 * from the backend (see backend/src/guardrails/queueGuardrails.ts) — that's
 * reused as-is since each `reason` produces its own distinct message there.
 * Rate limiting (429) has no message from the backend, so it's composed
 * here from `retryAfterMs`. Everything else falls back to a generic message.
 *
 * Shared by every list that offers add-to-queue (Search, Leaderboard,
 * Recently Played, Favorites) so the mapping stays consistent everywhere.
 */
export function describeQueueError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      const wait = err.retryAfterMs !== undefined ? formatRetryAfter(err.retryAfterMs) : 'a moment'
      return `You're queueing too fast — try again in ${wait}.`
    }
    if (err.status === 422) {
      return err.message
    }
    if (err.status === 503) {
      return "Playback isn't ready yet — an admin needs to finish setup. Try again shortly."
    }
    if (err.status === 404) {
      return "That track couldn't be found on Spotify."
    }
    return err.message || 'Could not add that track to the queue.'
  }
  return 'Could not add that track to the queue — check your connection and try again.'
}
