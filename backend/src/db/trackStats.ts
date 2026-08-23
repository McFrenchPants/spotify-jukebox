import { db } from "./index";

interface TrackStatsRow {
  spotify_track_id: string;
  play_count: number;
  last_played_at: string | null;
  is_blacklisted: number;
}

/**
 * Returns true if the given Spotify track id has been explicitly
 * blacklisted by an admin (track_stats.is_blacklisted = 1). Tracks with no
 * row at all are treated as not blacklisted.
 */
export function isTrackBlacklisted(spotifyTrackId: string): boolean {
  const row = db
    .prepare<[string], TrackStatsRow>(
      "SELECT * FROM track_stats WHERE spotify_track_id = ?"
    )
    .get(spotifyTrackId);

  return row ? row.is_blacklisted !== 0 : false;
}

/**
 * Records a successful queue-add for analytics: upserts the track_stats row,
 * incrementing play_count and stamping last_played_at to now. Creates the
 * row (with play_count starting at 1) if this is the track's first play.
 */
export function recordTrackPlay(spotifyTrackId: string): void {
  db.prepare(
    `INSERT INTO track_stats (spotify_track_id, play_count, last_played_at)
     VALUES (?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(spotify_track_id) DO UPDATE SET
       play_count = play_count + 1,
       last_played_at = excluded.last_played_at`
  ).run(spotifyTrackId);
}
