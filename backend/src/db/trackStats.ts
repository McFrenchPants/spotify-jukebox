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
