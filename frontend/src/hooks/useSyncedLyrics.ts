import { useMemo } from 'react'
import type { LrcLine } from '../lib/lrc'

/**
 * Derives the index of the currently-active synced-lyrics line for a given
 * playback position (LY2.2) — the last line whose `timeMs <= progressMs`,
 * or `-1` if `lines` is empty or playback hasn't reached the first line yet.
 *
 * Pure derivation only: no internal timer/interval. `progressMs` is expected
 * to come from the caller's own already-ticking now-playing progress value
 * (NowPlaying.tsx) — this hook must not start a second clock, since that
 * would drift out of sync with the one already driving the progress bar.
 * A plain linear scan is used (typical lyrics are well under a few hundred
 * lines); the `useMemo` just avoids re-scanning on unrelated re-renders.
 */
export function useSyncedLyrics(lines: LrcLine[], progressMs: number): number {
  return useMemo(() => {
    let activeIndex = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].timeMs <= progressMs) {
        activeIndex = i
      } else {
        break
      }
    }
    return activeIndex
  }, [lines, progressMs])
}
