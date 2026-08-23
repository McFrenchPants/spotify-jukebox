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

/** Returns all queue_entries rows in FIFO/queue order (ascending id). */
export function listQueueEntries(): QueueEntry[] {
  const rows = db
    .prepare<[], QueueEntryRow>("SELECT * FROM queue_entries ORDER BY id ASC")
    .all();

  return rows.map(toQueueEntry);
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
 * longer "pending"). No-op if no matching row exists.
 */
export function dequeueBySpotifyTrackId(spotifyTrackId: string): void {
  db.prepare(
    `DELETE FROM queue_entries
     WHERE id = (SELECT MIN(id) FROM queue_entries WHERE spotify_track_id = ?)`
  ).run(spotifyTrackId);
}

/** Deletes all queue_entries rows. */
export function clearQueueEntries(): void {
  db.prepare("DELETE FROM queue_entries").run();
}
