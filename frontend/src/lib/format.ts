/** Human-readable "m:ss" from a millisecond duration. Shared by the
 * now-playing and queue-list track rows (P4.3), matching the format used by
 * search's TrackRow. */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Human-readable relative time ("just now", "5m ago", "3h ago", "2d ago")
 * from an ISO timestamp, for the recently-played list (P4.4). Hand-rolled
 * rather than a library dependency — this scale doesn't need locale-aware
 * formatting.
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime()
  if (Number.isNaN(then)) return ''

  const diffMs = Math.max(0, Date.now() - then)
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) return 'just now'

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
