import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../spotify/client", async () => {
  const actual = await vi.importActual<typeof import("../spotify/client")>("../spotify/client");
  return { ...actual, getTrack: vi.fn() };
});

vi.mock("../spotify/queue", () => ({
  getQueueState: vi.fn(),
  addTrackToQueue: vi.fn(),
}));

vi.mock("../events/bus", async () => {
  const actual = await vi.importActual<typeof import("../events/bus")>("../events/bus");
  return { ...actual, emitEvent: vi.fn() };
});

import { db, runMigrations, setSetting } from "../db";
import { insertQueueEntry } from "../db/queueEntries";
import {
  DEFAULT_EXPLICIT_FILTER_ENABLED,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_MIN_DURATION_MS,
  EXPLICIT_FILTER_ENABLED_KEY,
  MAX_DURATION_MS_KEY,
  MIN_DURATION_MS_KEY,
} from "../guardrails/queueGuardrails";
import { DEFAULT_RATE_LIMIT_WINDOW_MS, RATE_LIMIT_WINDOW_MS_KEY } from "../guardrails/rateLimiter";
import { emitEvent } from "../events/bus";
import { getTrack } from "../spotify/client";
import { addTrackToQueue, getQueueState } from "../spotify/queue";
import { createApp } from "../app";

const DEVICE_ID = "device-under-test";

const TRACK_1 = {
  id: "track-1",
  name: "Song One",
  artist: "Artist A",
  albumArt: "https://example.com/one.jpg",
  durationMs: 200_000,
  explicit: false,
};

const TRACK_2 = {
  id: "track-2",
  name: "Song Two",
  artist: "Artist B",
  albumArt: null,
  durationMs: 210_000,
  explicit: false,
};

const EXPLICIT_TRACK = {
  id: "track-explicit",
  name: "Explicit Song",
  artist: "Artist C",
  albumArt: null,
  durationMs: 200_000,
  explicit: true,
};

const EMPTY_QUEUE_STATE = { currentlyPlayingTrackId: null, queuedTrackIds: [] };

let server: Server;
let baseUrl: string;

function playHistoryRowsFor(spotifyTrackId: string): unknown[] {
  return db
    .prepare("SELECT * FROM play_history WHERE spotify_track_id = ?")
    .all(spotifyTrackId);
}

function playCountFor(spotifyTrackId: string): number | undefined {
  const row = db
    .prepare<[string], { play_count: number }>(
      "SELECT play_count FROM track_stats WHERE spotify_track_id = ?"
    )
    .get(spotifyTrackId);
  return row?.play_count;
}

async function createGuestToken(): Promise<{ token: string; sessionId: string }> {
  const res = await fetch(`${baseUrl}/api/session`, { method: "POST" });
  const body = (await res.json()) as any;
  return { token: body.token, sessionId: body.sessionId };
}

beforeEach(async () => {
  runMigrations();
  // Real shared-file DB with no per-test reset — reset every setting we
  // touch to a known value, following the pattern in rateLimiter.test.ts /
  // queueGuardrails.test.ts.
  setSetting(RATE_LIMIT_WINDOW_MS_KEY, String(DEFAULT_RATE_LIMIT_WINDOW_MS));
  setSetting(EXPLICIT_FILTER_ENABLED_KEY, DEFAULT_EXPLICIT_FILTER_ENABLED);
  setSetting(MIN_DURATION_MS_KEY, String(DEFAULT_MIN_DURATION_MS));
  setSetting(MAX_DURATION_MS_KEY, String(DEFAULT_MAX_DURATION_MS));
  setSetting("spotify_device_id", DEVICE_ID);

  db.prepare("DELETE FROM play_history WHERE spotify_track_id LIKE 'track-%'").run();
  db.prepare("DELETE FROM track_stats WHERE spotify_track_id LIKE 'track-%'").run();
  db.prepare("DELETE FROM queue_entries").run();

  vi.clearAllMocks();
  vi.mocked(getQueueState).mockResolvedValue(EMPTY_QUEUE_STATE);
  vi.mocked(addTrackToQueue).mockResolvedValue(undefined);

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

describe("POST /api/queue", () => {
  it("returns 400 when there is no guest session", async () => {
    const res = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("session_required");
    expect(getTrack).not.toHaveBeenCalled();
  });

  it("returns 400 when trackId is missing", async () => {
    const { token } = await createGuestToken();

    const res = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("missing_track_id");
    expect(getTrack).not.toHaveBeenCalled();
  });

  it("returns 503 when no spotify_device_id is set", async () => {
    db.prepare("DELETE FROM app_settings WHERE key = 'spotify_device_id'").run();
    const { token } = await createGuestToken();

    const res = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("device_not_resolved");
    expect(getTrack).not.toHaveBeenCalled();
  });

  it("happy path: 201, exactly one addTrackToQueue call, one play_history row, play_count = 1 for a fresh track", async () => {
    vi.mocked(getTrack).mockResolvedValue(TRACK_1);
    const { token, sessionId } = await createGuestToken();

    const res = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(201);
    expect(body).toEqual(TRACK_1);

    expect(addTrackToQueue).toHaveBeenCalledTimes(1);
    expect(addTrackToQueue).toHaveBeenCalledWith("track-1", DEVICE_ID);

    const rows = playHistoryRowsFor("track-1") as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].spotify_track_id).toBe("track-1");
    expect(rows[0].guest_session_id).toBe(sessionId);
    expect(rows[0].track_name).toBe(TRACK_1.name);

    expect(playCountFor("track-1")).toBe(1);

    expect(emitEvent).toHaveBeenCalledWith(
      "queue-update",
      expect.objectContaining({ track: TRACK_1, queuedBy: sessionId })
    );
  });

  it("accumulates play_count across two different tracks queued by two different sessions", async () => {
    vi.mocked(getTrack).mockResolvedValueOnce(TRACK_1);
    const session1 = await createGuestToken();
    const res1 = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": session1.token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    expect(res1.status).toBe(201);

    vi.mocked(getTrack).mockResolvedValueOnce(TRACK_2);
    const session2 = await createGuestToken();
    const res2 = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": session2.token },
      body: JSON.stringify({ trackId: "track-2" }),
    });
    expect(res2.status).toBe(201);

    // A different session queues track-1 again — accumulation across sessions.
    vi.mocked(getTrack).mockResolvedValueOnce(TRACK_1);
    const session3 = await createGuestToken();
    const res3 = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": session3.token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    expect(res3.status).toBe(201);

    expect(addTrackToQueue).toHaveBeenCalledTimes(3);
    expect(playCountFor("track-1")).toBe(2);
    expect(playCountFor("track-2")).toBe(1);
    expect(playHistoryRowsFor("track-1")).toHaveLength(2);
    expect(playHistoryRowsFor("track-2")).toHaveLength(1);
  });

  it("rate-limits a second request from the same session and writes no second play_history row", async () => {
    vi.mocked(getTrack).mockResolvedValue(TRACK_1);
    const { token } = await createGuestToken();

    const res1 = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    expect(res1.status).toBe(201);

    const res2 = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    const body2 = (await res2.json()) as any;

    expect(res2.status).toBe(429);
    expect(body2.error).toBe("rate_limited");

    expect(addTrackToQueue).toHaveBeenCalledTimes(1);
    expect(playHistoryRowsFor("track-1")).toHaveLength(1);
  });

  it("returns 422 on a guardrail rejection (explicit filter), does not consume the rate-limit bucket, and writes no play_history row", async () => {
    vi.mocked(getTrack).mockResolvedValueOnce(EXPLICIT_TRACK);
    const { token } = await createGuestToken();

    const rejectedRes = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-explicit" }),
    });
    const rejectedBody = (await rejectedRes.json()) as any;

    expect(rejectedRes.status).toBe(422);
    expect(rejectedBody.error).toBe("explicit");
    expect(addTrackToQueue).not.toHaveBeenCalled();
    expect(playHistoryRowsFor("track-explicit")).toHaveLength(0);

    // The rate-limit bucket must not have been consumed by the rejected
    // request — a subsequent (allowed) request from the same session must
    // still succeed immediately.
    vi.mocked(getTrack).mockResolvedValueOnce(TRACK_1);
    const allowedRes = await fetch(`${baseUrl}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    expect(allowedRes.status).toBe(201);
    expect(addTrackToQueue).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/queue", () => {
  it("returns an empty array when there are no queue entries", async () => {
    const res = await fetch(`${baseUrl}/api/queue`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("reflects existing queue entries", async () => {
    insertQueueEntry({
      spotifyTrackId: "track-1",
      trackName: TRACK_1.name,
      artistName: TRACK_1.artist,
      albumArtUrl: TRACK_1.albumArt,
      durationMs: TRACK_1.durationMs,
      addedBySessionId: null,
    });

    const res = await fetch(`${baseUrl}/api/queue`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      spotifyTrackId: "track-1",
      trackName: TRACK_1.name,
      artistName: TRACK_1.artist,
    });
  });
});
