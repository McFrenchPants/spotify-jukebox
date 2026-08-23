import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../events/bus", () => ({
  emitEvent: vi.fn(),
}));

import { emitEvent } from "../events/bus";
import { db, runMigrations } from "../db";
import { listQueueEntries } from "../db/queueEntries";
import {
  DEFAULT_POLL_INTERVAL_MS,
  pollNowPlaying,
  resetNowPlayingState,
  startNowPlayingPoller,
  stopNowPlayingPoller,
} from "./nowPlaying";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    json: async (): Promise<unknown> => {
      throw new Error("should not be called for 204");
    },
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

const TRACK_A_PAUSED = { ...TRACK_A, is_playing: false };

const TRACK_A_PROGRESSED = { ...TRACK_A, progress_ms: 5000 };

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

describe("pollNowPlaying", () => {
  beforeEach(() => {
    runMigrations();
    db.prepare("DELETE FROM queue_entries").run();
    resetNowPlayingState();
    vi.clearAllMocks();
  });

  it("dequeues the local queue mirror entry for a track that just started playing, but not on an unchanged poll", async () => {
    db.prepare(
      `INSERT INTO queue_entries (spotify_track_id, track_name, artist_name, duration_ms)
       VALUES ('track-a', 'Song A', 'Artist A', 200000)`
    ).run();

    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    // Track change -> should dequeue.
    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    expect(listQueueEntries().find((e) => e.spotifyTrackId === "track-a")).toBeUndefined();

    // Re-insert and poll again with no change -> should NOT dequeue.
    db.prepare(
      `INSERT INTO queue_entries (spotify_track_id, track_name, artist_name, duration_ms)
       VALUES ('track-a', 'Song A', 'Artist A', 200000)`
    ).run();
    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    expect(listQueueEntries().find((e) => e.spotifyTrackId === "track-a")).toBeDefined();
  });

  it("emits now-playing when the track id changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(TRACK_A));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(fetchMock, getTokenFn);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers: { Authorization: "Bearer access-token" } }
    );
    expect(emitEvent).toHaveBeenCalledWith(
      "now-playing",
      expect.objectContaining({ trackId: "track-a", isPlaying: true })
    );
  });

  it("does not re-emit when polled again with no change", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(TRACK_A));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(fetchMock, getTokenFn);
    expect(emitEvent).toHaveBeenCalledTimes(1);

    await pollNowPlaying(fetchMock, getTokenFn);
    expect(emitEvent).toHaveBeenCalledTimes(1);
  });

  it("does not re-emit for progress-only changes on the same track", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    expect(emitEvent).toHaveBeenCalledTimes(1);

    await pollNowPlaying(
      vi.fn().mockResolvedValue(jsonResponse(TRACK_A_PROGRESSED)),
      getTokenFn
    );
    expect(emitEvent).toHaveBeenCalledTimes(1);
  });

  it("emits when play/pause state flips on the same track", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    expect(emitEvent).toHaveBeenCalledTimes(1);

    await pollNowPlaying(
      vi.fn().mockResolvedValue(jsonResponse(TRACK_A_PAUSED)),
      getTokenFn
    );
    expect(emitEvent).toHaveBeenCalledTimes(2);
    expect(emitEvent).toHaveBeenLastCalledWith(
      "now-playing",
      expect.objectContaining({ trackId: "track-a", isPlaying: false })
    );
  });

  it("emits when the track changes", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_B)), getTokenFn);

    expect(emitEvent).toHaveBeenCalledTimes(2);
    expect(emitEvent).toHaveBeenLastCalledWith(
      "now-playing",
      expect.objectContaining({ trackId: "track-b" })
    );
  });

  it("handles 204 No Content without erroring, and emits isPlaying:false once", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    expect(emitEvent).toHaveBeenCalledTimes(1);

    await expect(
      pollNowPlaying(vi.fn().mockResolvedValue(noContentResponse()), getTokenFn)
    ).resolves.toBeUndefined();

    expect(emitEvent).toHaveBeenLastCalledWith(
      "now-playing",
      expect.objectContaining({ isPlaying: false, trackId: null })
    );
  });

  it("skips silently when Spotify hasn't been connected yet (no refresh token)", async () => {
    const fetchMock = vi.fn();
    const getTokenFn = vi
      .fn()
      .mockRejectedValue(new Error("No spotify_refresh_token stored yet"));

    await expect(pollNowPlaying(fetchMock, getTokenFn)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it("throws on other fetch errors so the caller can log them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await expect(pollNowPlaying(fetchMock, getTokenFn)).rejects.toThrow(
      /currently-playing request failed/
    );
  });
});

describe("startNowPlayingPoller", () => {
  beforeEach(() => {
    resetNowPlayingState();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls on the configured interval and survives rejections", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(TRACK_A));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    const timer = startNowPlayingPoller(1000, fetchMock, getTokenFn);

    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    stopNowPlayingPoller(timer);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a single failing poll does not stop future polls", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const timer = startNowPlayingPoller(1000, fetchMock, getTokenFn);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalled();

    stopNowPlayingPoller(timer);
    consoleErrorSpy.mockRestore();
  });

  it("defaults to a 4 second interval", () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(4000);
  });
});
