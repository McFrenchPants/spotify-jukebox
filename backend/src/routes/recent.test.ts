import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { db, runMigrations } from "../db";
import { recordTrackPlay } from "../db/trackStats";

let server: Server;
let baseUrl: string;

// Inserts a play_history row with an explicit played_at so ordering across
// rows is unambiguous, rather than relying on real-clock timing between
// fast successive inserts (which could collide at millisecond precision).
function seedPlayHistoryAt(id: string, name: string, artist: string, playedAt: string) {
  db.prepare(
    `INSERT INTO play_history
       (spotify_track_id, track_name, artist_name, album_art_url, duration_ms, played_at, guest_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, artist, `https://example.com/${id}.jpg`, 200_000, playedAt, null);
}

beforeEach(async () => {
  runMigrations();
  db.prepare("DELETE FROM play_history").run();
  db.prepare("DELETE FROM track_stats").run();
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("GET /api/recent", () => {
  it("returns an empty array when there is no data", async () => {
    const res = await fetch(`${baseUrl}/api/recent`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns play_history rows ordered by played_at descending (most recent first)", async () => {
    seedPlayHistoryAt("track-1", "Song One", "Artist A", "2026-08-23T10:00:00.000Z");
    seedPlayHistoryAt("track-2", "Song Two", "Artist B", "2026-08-23T12:00:00.000Z");
    seedPlayHistoryAt("track-3", "Song Three", "Artist C", "2026-08-23T11:00:00.000Z");

    const res = await fetch(`${baseUrl}/api/recent`);
    const body = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(body.map((e) => e.spotifyTrackId)).toEqual(["track-2", "track-3", "track-1"]);
    expect(body[0]).toEqual({
      spotifyTrackId: "track-2",
      trackName: "Song Two",
      artistName: "Artist B",
      albumArtUrl: "https://example.com/track-2.jpg",
      durationMs: 200_000,
      playedAt: "2026-08-23T12:00:00.000Z",
      guestSessionId: null,
    });
  });

  it("respects ?limit=", async () => {
    seedPlayHistoryAt("track-1", "Song One", "Artist A", "2026-08-23T10:00:00.000Z");
    seedPlayHistoryAt("track-2", "Song Two", "Artist B", "2026-08-23T12:00:00.000Z");
    seedPlayHistoryAt("track-3", "Song Three", "Artist C", "2026-08-23T11:00:00.000Z");

    const res = await fetch(`${baseUrl}/api/recent?limit=2`);
    const body = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body.map((e) => e.spotifyTrackId)).toEqual(["track-2", "track-3"]);
  });

  it("falls back to the default limit for a non-numeric ?limit=", async () => {
    seedPlayHistoryAt("track-1", "Song One", "Artist A", "2026-08-23T10:00:00.000Z");

    const res = await fetch(`${baseUrl}/api/recent?limit=nonsense`);
    const body = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
  });

  it("is not blacklist-filtered — a blacklisted track's play_history row still appears", async () => {
    seedPlayHistoryAt("track-blocked", "Blocked Song", "Artist X", "2026-08-23T13:00:00.000Z");
    recordTrackPlay("track-blocked");
    db.prepare("UPDATE track_stats SET is_blacklisted = 1 WHERE spotify_track_id = ?").run(
      "track-blocked"
    );

    const res = await fetch(`${baseUrl}/api/recent`);
    const body = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(body.map((e) => e.spotifyTrackId)).toContain("track-blocked");
  });
});
