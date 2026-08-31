import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../spotify/nowPlaying", () => ({
  getNowPlayingState: vi.fn(),
  getLyricsSnapshot: vi.fn(),
}));

import { getLyricsSnapshot, getNowPlayingState } from "../spotify/nowPlaying";
import { runMigrations } from "../db";
import { createApp } from "../app";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  runMigrations();

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

describe("GET /api/lyrics", () => {
  it("returns the nothing-playing shape when no track is currently playing", async () => {
    vi.mocked(getNowPlayingState).mockReturnValue({ isPlaying: false, trackId: null });

    const res = await fetch(`${baseUrl}/api/lyrics`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ trackId: null, syncedLyrics: null, plainLyrics: null, found: false });
    expect(getLyricsSnapshot).not.toHaveBeenCalled();
  });

  it("returns loading: true when a track is playing but its lyrics lookup hasn't resolved yet", async () => {
    vi.mocked(getNowPlayingState).mockReturnValue({ isPlaying: true, trackId: "track-a" });
    vi.mocked(getLyricsSnapshot).mockReturnValue(null);

    const res = await fetch(`${baseUrl}/api/lyrics`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      trackId: "track-a",
      syncedLyrics: null,
      plainLyrics: null,
      found: false,
      loading: true,
    });
    expect(getLyricsSnapshot).toHaveBeenCalledWith("track-a");
  });

  it("returns the resolved lyrics with no loading field when lyrics are found", async () => {
    vi.mocked(getNowPlayingState).mockReturnValue({ isPlaying: true, trackId: "track-a" });
    vi.mocked(getLyricsSnapshot).mockReturnValue({
      syncedLyrics: "[00:01.00] la la la",
      plainLyrics: "la la la",
      found: true,
    });

    const res = await fetch(`${baseUrl}/api/lyrics`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      trackId: "track-a",
      syncedLyrics: "[00:01.00] la la la",
      plainLyrics: "la la la",
      found: true,
    });
    expect(body.loading).toBeUndefined();
  });

  it("returns found: false with no loading field when lyrics are genuinely not found (distinct from the not-yet-ready case)", async () => {
    vi.mocked(getNowPlayingState).mockReturnValue({ isPlaying: true, trackId: "track-b" });
    vi.mocked(getLyricsSnapshot).mockReturnValue({
      syncedLyrics: null,
      plainLyrics: null,
      found: false,
    });

    const res = await fetch(`${baseUrl}/api/lyrics`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      trackId: "track-b",
      syncedLyrics: null,
      plainLyrics: null,
      found: false,
    });
    expect(body.loading).toBeUndefined();
  });
});
