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
