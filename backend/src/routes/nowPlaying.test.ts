import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../events/bus", () => ({
  emitEvent: vi.fn(),
}));

import { runMigrations } from "../db";
import { createApp } from "../app";
import { pollNowPlaying, resetNowPlayingState } from "../spotify/nowPlaying";
import { resetRateLimitForTests } from "../spotify/rateLimitBackoff";

function rateLimitedResponse(retryAfterSeconds?: number): Response {
  return {
    ok: false,
    status: 429,
    json: async () => ({ error: { message: "Too many requests" } }),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "retry-after" && retryAfterSeconds !== undefined
          ? String(retryAfterSeconds)
          : null,
    },
  } as unknown as Response;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const TRACK_A = {
  is_playing: true,
  progress_ms: 1000,
  item: {
    id: "track-a",
    name: "Song A",
    artists: [{ name: "Artist A" }],
    album: { images: [{ url: "https://example.com/a.jpg" }] },
    duration_ms: 200000,
  },
};

const TRACK_B = {
  is_playing: true,
  progress_ms: 500,
  item: {
    id: "track-b",
    name: "Song B",
    artists: [{ name: "Artist B" }],
    album: { images: [{ url: "https://example.com/b.jpg" }] },
    duration_ms: 180000,
  },
};

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  runMigrations();
  resetNowPlayingState();
  resetRateLimitForTests();

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

describe("GET /api/now-playing", () => {
  it("returns the nothing-playing state when nothing has been polled yet", async () => {
    const res = await fetch(`${baseUrl}/api/now-playing`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ isPlaying: false, trackId: null });
  });

  it("reflects the last-seen state after a poll observes a track playing", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");
    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);

    const res = await fetch(`${baseUrl}/api/now-playing`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ isPlaying: true, trackId: "track-a", name: "Song A" });
  });

  it("includes polledAt and rateLimited fields, additive to the existing response shape (BACKLOG item 9, Bug A)", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");
    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);

    const res = await fetch(`${baseUrl}/api/now-playing`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(typeof body.polledAt).toBe("number");
    expect(body.polledAt).toBeGreaterThan(0);
    expect(body.rateLimited).toBe(false);
  });

  it("reports rateLimited: true and a frozen polledAt while an active backoff window is in effect", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    // First poll succeeds, establishing a baseline polledAt.
    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    const firstRes = await fetch(`${baseUrl}/api/now-playing`);
    const firstBody = (await firstRes.json()) as any;
    const polledAtBeforeRateLimit = firstBody.polledAt;

    // A 429 arms the backoff window; the very next poll attempt is then
    // skipped early (isRateLimited() short-circuits pollNowPlaying), so
    // lastState/lastPolledAt stay frozen exactly as Bug A describes.
    await pollNowPlaying(vi.fn().mockResolvedValue(rateLimitedResponse(30)), getTokenFn);
    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_B)), getTokenFn);

    const res = await fetch(`${baseUrl}/api/now-playing`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.rateLimited).toBe(true);
    expect(body.polledAt).toBe(polledAtBeforeRateLimit);
    // The frozen snapshot itself is unchanged too — still track-a, not track-b.
    expect(body.trackId).toBe("track-a");
  });
});
