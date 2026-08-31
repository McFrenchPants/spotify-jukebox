export interface LrcLine {
  timeMs: number
  text: string
}

// Matches one `[mm:ss.xx]` timestamp tag, capturing minutes/seconds/fraction.
// Fraction digit count varies across LRC producers (2 or 3 are both common
// in the wild), so it's not pinned to a fixed length.
const TIMESTAMP_TAG = /\[(\d{1,3}):(\d{2})(?:\.(\d+))?\]/g

/**
 * Parses LRCLIB-style synced-lyrics text (standard LRC format) into a flat,
 * time-sorted list of lines (LY2.2).
 *
 * Each source line is expected to look like `[mm:ss.xx]lyric text`, optionally
 * with multiple leading timestamp tags for a repeated line (e.g. a chorus
 * repeated at several points in the song) — each tag produces its own
 * {@link LrcLine} sharing that line's text. Metadata lines (`[ar:...]`,
 * `[ti:...]`, `[al:...]`, `[length:...]`, etc.) and any other line that
 * doesn't start with at least one valid timestamp tag are skipped rather
 * than throwing, since LRCLIB's synced-lyrics blob mixes both.
 */
export function parseLrc(syncedLyrics: string): LrcLine[] {
  const lines: LrcLine[] = []
  if (!syncedLyrics) return lines

  for (const rawLine of syncedLyrics.split(/\r\n|\r|\n/)) {
    TIMESTAMP_TAG.lastIndex = 0

    const timestamps: number[] = []
    let lastMatchEnd = 0
    let match: RegExpExecArray | null

    // Consume every leading timestamp tag, tracking where they end so the
    // remaining string (after the last one) is the lyric text.
    while ((match = TIMESTAMP_TAG.exec(rawLine)) !== null) {
      if (match.index !== lastMatchEnd) break // not a contiguous leading tag

      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ?? ''
      const fractionMs = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0

      timestamps.push(minutes * 60_000 + seconds * 1000 + fractionMs)
      lastMatchEnd = TIMESTAMP_TAG.lastIndex
    }

    if (timestamps.length === 0) continue // metadata line or unparseable — skip

    const text = rawLine.slice(lastMatchEnd)
    for (const timeMs of timestamps) {
      lines.push({ timeMs, text })
    }
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs)
}
