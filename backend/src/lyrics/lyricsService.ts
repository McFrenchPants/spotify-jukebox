import { deleteLyricsIfNotFavorited, getCachedLyrics, saveLyrics } from "../db/lyrics";
import { fetchLyricsFromLrclib, type FetchLyricsParams } from "./lrclib";

export interface LyricsResult {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  found: boolean;
}

/**
 * Single entry point for getting a track's lyrics, checking the cache first
 * and falling back to an LRCLIB lookup on a miss.
 *
 * - Cache hit (whether found: true or a cached found: false "not found"
 *   result) returns immediately — no LRCLIB call at all.
 * - Cache miss + LRCLIB finds something: cached and returned as found: true.
 * - Cache miss + LRCLIB genuinely finds nothing (returns null): cached as
 *   found: false so this track isn't re-queried on every subsequent play.
 * - Cache miss + LRCLIB throws (a real request failure): nothing is cached
 *   for this track — a transient failure shouldn't be permanently
 *   remembered as "not found" — and the error propagates to the caller.
 */
export async function getLyricsForTrack(
  spotifyTrackId: string,
  trackMeta: FetchLyricsParams
): Promise<LyricsResult> {
  const cached = getCachedLyrics(spotifyTrackId);
  if (cached) {
    return {
      syncedLyrics: cached.syncedLyrics,
      plainLyrics: cached.plainLyrics,
      found: cached.found,
    };
  }

  const fetched = await fetchLyricsFromLrclib(trackMeta);

  if (fetched === null) {
    const notFound: LyricsResult = { syncedLyrics: null, plainLyrics: null, found: false };
    saveLyrics(spotifyTrackId, notFound);
    return notFound;
  }

  const result: LyricsResult = {
    syncedLyrics: fetched.syncedLyrics,
    plainLyrics: fetched.plainLyrics,
    found: true,
  };
  saveLyrics(spotifyTrackId, result);
  return result;
}

/**
 * Evicts the PREVIOUS track's cached lyrics entry (unless favorited) when a
 * new track starts playing. Piggybacks on the "track changed" signal the
 * now-playing poller already has, rather than a separate TTL/cron sweep,
 * keeping the lyrics table bounded to "currently playing + favorited"
 * tracks. Does nothing when there was no previous track (e.g. the very
 * first track since the process started).
 */
export function evictPreviousTrackLyrics(previousTrackId: string | null | undefined): void {
  if (!previousTrackId) {
    return;
  }
  deleteLyricsIfNotFavorited(previousTrackId);
}
