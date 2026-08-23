import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { db, runMigrations } from "../db";
import { insertPlayHistory } from "../db/playHistory";
import { recordTrackPlay } from "../db/trackStats";

let server: Server;
let baseUrl: string;

function seedTrack(id: string, name: string, artist: string, plays: number) {
  for (let i = 0; i < plays; i++) {
    insertPlayHistory({
      spotifyTrackId: id,
      trackName: name,
      artistName: artist,
      albumArtUrl: `https://example.com/${id}.jpg`,
      durationMs: 200_000,
      guestSessionId: null,
    });
    recordTrackPlay(id);
  }
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

describe("GET /api/leaderboard", () => {
  it("returns an empty array when there is no data", async () => {
    const res = await fetch(`${baseUrl}/api/leaderboard`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns tracks ordered by play_count descending, with display metadata from play_history", async () => {
    seedTrack("track-1", "Song One", "Artist A", 1);
    seedTrack("track-2", "Song Two", "Artist B", 3);
    seedTrack("track-3", "Song Three", "Artist C", 2);

    const res = await fetch(`${baseUrl}/api/leaderboard`);
    const body = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(body.map((e) => e.spotifyTrackId)).toEqual(["track-2", "track-3", "track-1"]);
    expect(body[0]).toEqual({
      spotifyTrackId: "track-2",
      trackName: "Song Two",
      artistName: "Artist B",
      albumArtUrl: "https://example.com/track-2.jpg",
      playCount: 3,
      lastPlayedAt: expect.any(String),
    });
  });

  it("excludes blacklisted tracks even with a high play count", async () => {
    seedTrack("track-1", "Song One", "Artist A", 1);
    seedTrack("track-blocked", "Blocked Song", "Artist X", 10);
    db.prepare("UPDATE track_stats SET is_blacklisted = 1 WHERE spotify_track_id = ?").run(
      "track-blocked"
    );

    const res = await fetch(`${baseUrl}/api/leaderboard`);
    const body = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(body.map((e) => e.spotifyTrackId)).toEqual(["track-1"]);
  });

  it("respects ?limit=", async () => {
    seedTrack("track-1", "Song One", "Artist A", 1);
    seedTrack("track-2", "Song Two", "Artist B", 3);
    seedTrack("track-3", "Song Three", "Artist C", 2);

    const res = await fetch(`${baseUrl}/api/leaderboard?limit=2`);
    const body = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body.map((e) => e.spotifyTrackId)).toEqual(["track-2", "track-3"]);
  });

  it("falls back to the default limit for a non-numeric ?limit=", async () => {
    seedTrack("track-1", "Song One", "Artist A", 1);

    const res = await fetch(`${baseUrl}/api/leaderboard?limit=nonsense`);
    const body = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
  });
});
