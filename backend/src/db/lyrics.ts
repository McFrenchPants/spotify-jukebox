import { db } from "./index";

export interface CachedLyrics {
  spotifyTrackId: string;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  found: boolean;
  fetchedAt: string;
}

export interface SaveLyricsInput {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  found: boolean;
}

interface LyricsRow {
  spotify_track_id: string;
  synced_lyrics: string | null;
  plain_lyrics: string | null;
  found: number;
  fetched_at: string;
}

function toCachedLyrics(row: LyricsRow): CachedLyrics {
  return {
    spotifyTrackId: row.spotify_track_id,
    syncedLyrics: row.synced_lyrics,
    plainLyrics: row.plain_lyrics,
    found: Boolean(row.found),
    fetchedAt: row.fetched_at,
  };
}

/**
 * Looks up a track's cached lyrics lookup result, if one exists. Returns
 * null when this track has never had a lyrics lookup recorded at all —
 * distinct from a recorded lookup that simply found nothing (found: false).
 */
export function getCachedLyrics(spotifyTrackId: string): CachedLyrics | null {
  const row = db
    .prepare<[string], LyricsRow>("SELECT * FROM lyrics WHERE spotify_track_id = ?")
    .get(spotifyTrackId);

  return row ? toCachedLyrics(row) : null;
}

/**
 * Upsert: a track's lyrics lookup result may be recorded more than once over
 * the table's lifetime (e.g. a later LRCLIB lookup superseding an earlier
 * "not found" result), so this INSERTs a new row or overwrites the existing
 * one via ON CONFLICT rather than assuming the row is new.
 */
export function saveLyrics(spotifyTrackId: string, result: SaveLyricsInput): void {
  db.prepare(
    `INSERT INTO lyrics (spotify_track_id, synced_lyrics, plain_lyrics, found, fetched_at)
     VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(spotify_track_id) DO UPDATE SET
       synced_lyrics = excluded.synced_lyrics,
       plain_lyrics = excluded.plain_lyrics,
       found = excluded.found,
       fetched_at = excluded.fetched_at`
  ).run(spotifyTrackId, result.syncedLyrics, result.plainLyrics, result.found ? 1 : 0);
}

/**
 * Evicts a track's cached lyrics row, but only when no guest has favorited
 * that track — a track favorited by ANY guest (not just whoever originally
 * triggered the lookup) is exempt from eviction. Full eviction scheduling
 * (deciding *when* to call this for non-favorited tracks) is handled by a
 * later task (LY0.2); this is just the guarded delete primitive.
 */
export function deleteLyricsIfNotFavorited(spotifyTrackId: string): void {
  db.prepare(
    `DELETE FROM lyrics
     WHERE spotify_track_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM favorites WHERE favorites.spotify_track_id = lyrics.spotify_track_id
       )`
  ).run(spotifyTrackId);
}
