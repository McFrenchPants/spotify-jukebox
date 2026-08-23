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

/**
 * Sets (or clears) the is_blacklisted flag on a track_stats row, creating
 * the row (with play_count starting at 0, unlike recordTrackPlay which
 * starts at 1) if this track has no row yet. Unlike recordTrackPlay, this
 * never increments play_count on conflict.
 */
export function setTrackBlacklisted(spotifyTrackId: string, blacklisted: boolean): void {
  db.prepare(
    `INSERT INTO track_stats (spotify_track_id, play_count, is_blacklisted)
     VALUES (?, 0, ?)
     ON CONFLICT(spotify_track_id) DO UPDATE SET is_blacklisted = excluded.is_blacklisted`
  ).run(spotifyTrackId, blacklisted ? 1 : 0);
}

export interface LeaderboardEntry {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  playCount: number;
  lastPlayedAt: string | null;
}

interface LeaderboardRow {
  spotify_track_id: string;
  track_name: string;
  artist_name: string;
  album_art_url: string | null;
  play_count: number;
  last_played_at: string | null;
}

/**
 * Returns the top tracks by play_count (descending, tie-broken by
 * last_played_at descending — most recently played wins ties), excluding
 * any track_stats row with is_blacklisted = 1.
 *
 * track_stats has no display metadata of its own (name/artist/art), so each
 * row is joined against its most recent matching play_history row to get
 * that metadata. "Most recent" is picked via a MAX(id) grouped subquery
 * rather than MAX(played_at): play_history.played_at has only millisecond
 * resolution, so two rows for the same track can tie on played_at when
 * written in quick succession, which would make a played_at-based join
 * match more than one row and duplicate the track in the results. id is an
 * autoincrement primary key, so it is always unique and increases in
 * insertion order, giving a deterministic single match. This is an INNER
 * JOIN: a track_stats row with play_count > 0 always has at least one
 * matching play_history row, because recordTrackPlay() is only ever called
 * alongside insertPlayHistory() (see routes/queue.ts) — there is no code
 * path that creates a track_stats row without a corresponding play_history
 * row, so the "no match" case cannot occur given the current write path.
 */
export function getLeaderboard(limit = 10): LeaderboardEntry[] {
  const rows = db
    .prepare<[number], LeaderboardRow>(
      `SELECT
         ts.spotify_track_id AS spotify_track_id,
         ph.track_name       AS track_name,
         ph.artist_name      AS artist_name,
         ph.album_art_url    AS album_art_url,
         ts.play_count       AS play_count,
         ts.last_played_at   AS last_played_at
       FROM track_stats ts
       INNER JOIN play_history ph
         ON ph.id = (
           SELECT id FROM play_history
           WHERE spotify_track_id = ts.spotify_track_id
           ORDER BY id DESC
           LIMIT 1
         )
       WHERE ts.is_blacklisted = 0
       ORDER BY ts.play_count DESC, ts.last_played_at DESC
       LIMIT ?`
    )
    .all(limit);

  return rows.map((row) => ({
    spotifyTrackId: row.spotify_track_id,
    trackName: row.track_name,
    artistName: row.artist_name,
    albumArtUrl: row.album_art_url,
    playCount: row.play_count,
    lastPlayedAt: row.last_played_at,
  }));
}
