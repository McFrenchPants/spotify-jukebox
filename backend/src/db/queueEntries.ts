import { db } from "./index";

export interface QueueEntryInput {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  durationMs: number;
  addedBySessionId: string | null;
}

export interface QueueEntry {
  id: number;
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  durationMs: number;
  addedBySessionId: string | null;
  addedAt: string;
}

/**
 * `listQueueEntries()` widens `QueueEntry` with the adder's profile fields
 * (joined from `guest_sessions`), so the frontend can show who queued a
 * track without a second request. Both are `null` whenever
 * `added_by_session_id` is null (no attributed guest) or the guest never
 * set a nickname/avatar — never a placeholder value.
 */
export interface QueueEntryWithAdder extends QueueEntry {
  adderNickname: string | null;
  adderAvatar: string | null;
}

interface QueueEntryRow {
  id: number;
  spotify_track_id: string;
  track_name: string;
  artist_name: string;
  album_art_url: string | null;
  duration_ms: number;
  added_by_session_id: string | null;
  added_at: string;
}

interface QueueEntryWithAdderRow extends QueueEntryRow {
  adder_nickname: string | null;
  adder_avatar: string | null;
}

function toQueueEntry(row: QueueEntryRow): QueueEntry {
  return {
    id: row.id,
    spotifyTrackId: row.spotify_track_id,
    trackName: row.track_name,
    artistName: row.artist_name,
    albumArtUrl: row.album_art_url,
    durationMs: row.duration_ms,
    addedBySessionId: row.added_by_session_id,
    addedAt: row.added_at,
  };
}

function toQueueEntryWithAdder(row: QueueEntryWithAdderRow): QueueEntryWithAdder {
  return {
    ...toQueueEntry(row),
    adderNickname: row.adder_nickname,
    adderAvatar: row.adder_avatar,
  };
}

/**
 * Inserts a new queue_entries row (the local mirror of Spotify's live
 * queue — see spotify/queueSync.ts docs for why this mirror exists). Returns
 * the new row's autoincrement id, which also doubles as FIFO queue order.
 */
export function insertQueueEntry(entry: QueueEntryInput): number {
  const result = db
    .prepare(
      `INSERT INTO queue_entries
         (spotify_track_id, track_name, artist_name, album_art_url, duration_ms, added_by_session_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.spotifyTrackId,
      entry.trackName,
      entry.artistName,
      entry.albumArtUrl,
      entry.durationMs,
      entry.addedBySessionId
    );

  return Number(result.lastInsertRowid);
}

/**
 * Returns all queue_entries rows in FIFO/queue order (ascending id), each
 * widened with the adder's `adderNickname`/`adderAvatar` (LEFT JOINed from
 * guest_sessions, since added_by_session_id can be null).
 */
export function listQueueEntries(): QueueEntryWithAdder[] {
  const rows = db
    .prepare<[], QueueEntryWithAdderRow>(
      `SELECT queue_entries.*,
              guest_sessions.nickname AS adder_nickname,
              guest_sessions.avatar AS adder_avatar
       FROM queue_entries
       LEFT JOIN guest_sessions ON queue_entries.added_by_session_id = guest_sessions.session_id
       ORDER BY queue_entries.id ASC`
    )
    .all();

  return rows.map(toQueueEntryWithAdder);
}

/** Deletes a single queue_entries row by id. Returns whether a row was actually deleted. */
export function deleteQueueEntry(id: number): boolean {
  const result = db.prepare("DELETE FROM queue_entries WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Deletes the single oldest (lowest id) queue_entries row matching the given
 * Spotify track id, if any. Used by the now-playing poller to dequeue a
 * track from the local mirror once it starts actually playing (it's no
 * longer "pending"), and to attribute the resulting play_history/track_stats
 * write to the guest who queued it (see nowPlaying.ts). Returns the matched
 * row's `added_by_session_id` (which may itself be null for an entry that
 * was inserted with no session), or `null` if no row matched at all — the
 * latter is the "Spotify played this on its own" (organic/autoplay) case.
 */
export function dequeueBySpotifyTrackId(spotifyTrackId: string): string | null {
  const row = db
    .prepare<[string], { id: number; added_by_session_id: string | null }>(
      `SELECT id, added_by_session_id FROM queue_entries
       WHERE id = (SELECT MIN(id) FROM queue_entries WHERE spotify_track_id = ?)`
    )
    .get(spotifyTrackId);

  if (!row) {
    return null;
  }

  db.prepare("DELETE FROM queue_entries WHERE id = ?").run(row.id);
  return row.added_by_session_id;
}

/** Deletes all queue_entries rows. */
export function clearQueueEntries(): void {
  db.prepare("DELETE FROM queue_entries").run();
}
