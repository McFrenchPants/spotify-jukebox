import { db } from "./index";

export interface PlayHistoryEntry {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  durationMs: number;
  guestSessionId: string | null;
}

/** Inserts a new play_history row recording a successful queue-add. */
export function insertPlayHistory(entry: PlayHistoryEntry): void {
  db.prepare(
    `INSERT INTO play_history
       (spotify_track_id, track_name, artist_name, album_art_url, duration_ms, guest_session_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    entry.spotifyTrackId,
    entry.trackName,
    entry.artistName,
    entry.albumArtUrl,
    entry.durationMs,
    entry.guestSessionId
  );
}

export interface RecentlyPlayedEntry {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  durationMs: number;
  playedAt: string;
  guestSessionId: string | null;
}

interface PlayHistoryRow {
  spotify_track_id: string;
  track_name: string;
  artist_name: string;
  album_art_url: string | null;
  duration_ms: number;
  played_at: string;
  guest_session_id: string | null;
}

/**
 * Returns the most recently played tracks (play_history rows), most recent
 * first. This is a historical log, not a discovery surface, so unlike the
 * leaderboard it is NOT filtered against track_stats.is_blacklisted — a
 * blacklisted track's past plays still show up here.
 */
export function getRecentlyPlayed(limit = 20): RecentlyPlayedEntry[] {
  const rows = db
    .prepare<[number], PlayHistoryRow>(
      `SELECT spotify_track_id, track_name, artist_name, album_art_url, duration_ms, played_at, guest_session_id
       FROM play_history
       ORDER BY played_at DESC
       LIMIT ?`
    )
    .all(limit);

  return rows.map((row) => ({
    spotifyTrackId: row.spotify_track_id,
    trackName: row.track_name,
    artistName: row.artist_name,
    albumArtUrl: row.album_art_url,
    durationMs: row.duration_ms,
    playedAt: row.played_at,
    guestSessionId: row.guest_session_id,
  }));
}
