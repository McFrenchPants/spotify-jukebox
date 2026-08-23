/** Human-readable "m:ss" from a millisecond duration. Shared by the
 * now-playing and queue-list track rows (P4.3), matching the format used by
 * search's TrackRow. */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
