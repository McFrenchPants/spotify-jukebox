import { db } from "./index";

export interface AddFavoriteInput {
  guestSessionId: string;
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  durationMs: number;
}

export interface Favorite {
  id: number;
  guestSessionId: string;
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  durationMs: number;
  favoritedAt: string;
}

interface FavoriteRow {
  id: number;
  guest_session_id: string;
  spotify_track_id: string;
  track_name: string;
  artist_name: string;
  album_art_url: string | null;
  duration_ms: number;
  favorited_at: string;
}

function toFavorite(row: FavoriteRow): Favorite {
  return {
    id: row.id,
    guestSessionId: row.guest_session_id,
    spotifyTrackId: row.spotify_track_id,
    trackName: row.track_name,
    artistName: row.artist_name,
    albumArtUrl: row.album_art_url,
    durationMs: row.duration_ms,
    favoritedAt: row.favorited_at,
  };
}

/**
 * Inserts a new favorites row for a guest+track pair. Idempotent: favoriting
 * the same guest_session_id/spotify_track_id combination twice is a no-op
 * (via ON CONFLICT DO NOTHING against the UNIQUE(guest_session_id,
 * spotify_track_id) constraint) rather than throwing a constraint error.
 */
export function addFavorite(params: AddFavoriteInput): void {
  db.prepare(
    `INSERT INTO favorites
       (guest_session_id, spotify_track_id, track_name, artist_name, album_art_url, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guest_session_id, spotify_track_id) DO NOTHING`
  ).run(
    params.guestSessionId,
    params.spotifyTrackId,
    params.trackName,
    params.artistName,
    params.albumArtUrl,
    params.durationMs
  );
}

/**
 * Removes a guest's favorite for a single track, if it exists. DELETE is
 * naturally idempotent, so removing a favorite that doesn't exist (or was
 * already removed) is silently a no-op rather than an error.
 */
export function removeFavorite(guestSessionId: string, spotifyTrackId: string): void {
  db.prepare(
    "DELETE FROM favorites WHERE guest_session_id = ? AND spotify_track_id = ?"
  ).run(guestSessionId, spotifyTrackId);
}

/**
 * Returns all of a guest's favorites, newest-favorited first. Ties on
 * favorited_at (millisecond resolution — two favorites added in quick
 * succession can share a timestamp) are broken by id DESC, so insertion
 * order is preserved even when favorited_at alone is ambiguous.
 */
export function listFavoritesForGuest(guestSessionId: string): Favorite[] {
  const rows = db
    .prepare<[string], FavoriteRow>(
      "SELECT * FROM favorites WHERE guest_session_id = ? ORDER BY favorited_at DESC, id DESC"
    )
    .all(guestSessionId);

  return rows.map(toFavorite);
}

/**
 * Batch favorite-status lookup for a list of track ids, used to annotate
 * search results/queue/leaderboard entries in one query instead of one round
 * trip per track. For every id in `trackIds` the result carries whether
 * `guestSessionId` (if provided) has favorited it, and whether any guest has
 * favorited it at all. Every id passed in is guaranteed a key in the result,
 * defaulting to `{ favoritedByMe: false, favoritedByAnyone: false }` when no
 * favorites row exists for it.
 */
export function getFavoriteStatusForTracks(
  guestSessionId: string | undefined,
  trackIds: string[]
): Record<string, { favoritedByMe: boolean; favoritedByAnyone: boolean }> {
  const result: Record<string, { favoritedByMe: boolean; favoritedByAnyone: boolean }> = {};

  if (trackIds.length === 0) {
    return result;
  }

  for (const trackId of trackIds) {
    result[trackId] = { favoritedByMe: false, favoritedByAnyone: false };
  }

  const placeholders = trackIds.map(() => "?").join(",");
  const rows = db
    .prepare<string[], { spotify_track_id: string; guest_session_id: string }>(
      `SELECT spotify_track_id, guest_session_id FROM favorites WHERE spotify_track_id IN (${placeholders})`
    )
    .all(...trackIds);

  for (const row of rows) {
    const entry = result[row.spotify_track_id];
    if (!entry) {
      continue;
    }
    entry.favoritedByAnyone = true;
    if (guestSessionId !== undefined && row.guest_session_id === guestSessionId) {
      entry.favoritedByMe = true;
    }
  }

  return result;
}
