import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../events/bus", () => ({
  emitEvent: vi.fn(),
}));

import { runMigrations } from "../db";
import { createApp } from "../app";
import { pollNowPlaying, resetNowPlayingState } from "../spotify/nowPlaying";

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

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  runMigrations();
  resetNowPlayingState();

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
    expect(body).toEqual({ isPlaying: false, trackId: null });
  });

  it("reflects the last-seen state after a poll observes a track playing", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");
    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);

    const res = await fetch(`${baseUrl}/api/now-playing`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ isPlaying: true, trackId: "track-a", name: "Song A" });
  });
});
