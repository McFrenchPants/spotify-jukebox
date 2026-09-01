import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../events/bus", () => ({
  emitEvent: vi.fn(),
}));

vi.mock("./device", () => ({
  listDevices: vi.fn(),
}));

vi.mock("../lyrics/lyricsService", () => ({
  getLyricsForTrack: vi.fn(),
  evictPreviousTrackLyrics: vi.fn(),
}));

import { emitEvent } from "../events/bus";
import { db, runMigrations, setSetting, deleteSetting } from "../db";
import { listQueueEntries } from "../db/queueEntries";
import { listDevices } from "./device";
import { evictPreviousTrackLyrics, getLyricsForTrack } from "../lyrics/lyricsService";
import {
  SAFETY_INTERVAL_MS,
  getLastPolledAt,
  getLyricsSnapshot,
  pollNowPlaying,
  resetNowPlayingState,
  startNowPlayingPoller,
  stopNowPlayingPoller,
  triggerImmediateNowPlayingPoll,
} from "./nowPlaying";
import { isRateLimited, resetRateLimitForTests } from "./rateLimitBackoff";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

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

/**
 * Counts only "now-playing" emitEvent calls — pollNowPlaying now also emits
 * "leaderboard-update" whenever it records an actual play, so raw
 * emitEvent-call-count assertions from before that behavior existed need to
 * filter to the specific event they care about.
 */
function nowPlayingEmitCount(): number {
  return vi.mocked(emitEvent).mock.calls.filter((call) => call[0] === "now-playing").length;
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
    db.prepare("DELETE FROM play_history").run();
    db.prepare("DELETE FROM track_stats").run();
    deleteSetting("spotify_device_id");
    resetNowPlayingState();
    resetRateLimitForTests();
    vi.clearAllMocks();
    vi.mocked(listDevices).mockResolvedValue([]);
    vi.mocked(getLyricsForTrack).mockResolvedValue({
      syncedLyrics: null,
      plainLyrics: null,
      found: false,
    });
    vi.mocked(evictPreviousTrackLyrics).mockReset();
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

  it("records play_history/track_stats and emits leaderboard-update for a new track with a matching queue_entries row, using its added_by_session_id", async () => {
    db.prepare(
      `INSERT INTO queue_entries (spotify_track_id, track_name, artist_name, duration_ms, added_by_session_id)
       VALUES ('track-a', 'Song A', 'Artist A', 200000, 'session-guest-1')`
    ).run();
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);

    const historyRow = db
      .prepare("SELECT * FROM play_history WHERE spotify_track_id = 'track-a'")
      .get() as any;
    expect(historyRow).toBeDefined();
    expect(historyRow.guest_session_id).toBe("session-guest-1");
    expect(historyRow.track_name).toBe("Song A");

    const statsRow = db
      .prepare("SELECT * FROM track_stats WHERE spotify_track_id = 'track-a'")
      .get() as any;
    expect(statsRow.play_count).toBe(1);

    expect(listQueueEntries().find((e) => e.spotifyTrackId === "track-a")).toBeUndefined();

    expect(emitEvent).toHaveBeenCalledWith("leaderboard-update", { trackId: "track-a" });
  });

  it("records play_history/track_stats with guestSessionId: null for an organic/autoplay track with no matching queue_entries row", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);

    const historyRow = db
      .prepare("SELECT * FROM play_history WHERE spotify_track_id = 'track-a'")
      .get() as any;
    expect(historyRow).toBeDefined();
    expect(historyRow.guest_session_id).toBeNull();

    expect(emitEvent).toHaveBeenCalledWith("leaderboard-update", { trackId: "track-a" });
  });

  it("does not record a play when the track pauses (not a new track starting)", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    const countAfterPlay = (
      db.prepare("SELECT COUNT(*) AS c FROM play_history WHERE spotify_track_id = 'track-a'").get() as any
    ).c;
    expect(countAfterPlay).toBe(1);

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A_PAUSED)), getTokenFn);
    const countAfterPause = (
      db.prepare("SELECT COUNT(*) AS c FROM play_history WHERE spotify_track_id = 'track-a'").get() as any
    ).c;
    expect(countAfterPause).toBe(1);
    expect(emitEvent).not.toHaveBeenLastCalledWith("leaderboard-update", expect.anything());
  });

  it("does not record a play on an unchanged poll (progress ticking, same track/state)", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A_PROGRESSED)), getTokenFn);

    const count = (
      db.prepare("SELECT COUNT(*) AS c FROM play_history WHERE spotify_track_id = 'track-a'").get() as any
    ).c;
    expect(count).toBe(1);
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
    expect(nowPlayingEmitCount()).toBe(1);

    await pollNowPlaying(fetchMock, getTokenFn);
    expect(nowPlayingEmitCount()).toBe(1);
  });

  it("does not re-emit for progress-only changes on the same track", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    expect(nowPlayingEmitCount()).toBe(1);

    await pollNowPlaying(
      vi.fn().mockResolvedValue(jsonResponse(TRACK_A_PROGRESSED)),
      getTokenFn
    );
    expect(nowPlayingEmitCount()).toBe(1);
  });

  it("emits when play/pause state flips on the same track", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    expect(nowPlayingEmitCount()).toBe(1);

    await pollNowPlaying(
      vi.fn().mockResolvedValue(jsonResponse(TRACK_A_PAUSED)),
      getTokenFn
    );
    expect(nowPlayingEmitCount()).toBe(2);
    expect(emitEvent).toHaveBeenLastCalledWith(
      "now-playing",
      expect.objectContaining({ trackId: "track-a", isPlaying: false })
    );
  });

  it("emits when the track changes", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_B)), getTokenFn);

    expect(nowPlayingEmitCount()).toBe(2);
    // Use toHaveBeenCalledWith rather than toHaveBeenLastCalledWith here:
    // the fire-and-forget lyrics lookup's default mock resolves as a
    // microtask that can flush before this assertion runs, so a
    // "lyrics-update" call may legitimately land after this "now-playing"
    // call in the mock's call history.
    expect(emitEvent).toHaveBeenCalledWith(
      "now-playing",
      expect.objectContaining({ trackId: "track-b" })
    );
  });

  it("handles 204 No Content without erroring, and emits isPlaying:false once", async () => {
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
    expect(nowPlayingEmitCount()).toBe(1);

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

  it("skips silently when the stored refresh token is dead (SpotifyReauthRequiredError)", async () => {
    const { SpotifyReauthRequiredError } = await import("./errors");
    const fetchMock = vi.fn();
    const getTokenFn = vi
      .fn()
      .mockRejectedValue(new SpotifyReauthRequiredError("invalid_grant"));

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

  describe("device-status detection", () => {
    const DEVICE_A = {
      id: "device-a",
      name: "Kitchen Phone",
      type: "Smartphone",
      is_active: true,
      volume_percent: 80,
      supports_volume: true,
    };
    const FIVE_MIN_MS = 5 * 60 * 1000;

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not call listDevices when no device is resolved yet", async () => {
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(noContentResponse()), getTokenFn);

      expect(listDevices).not.toHaveBeenCalled();
      expect(emitEvent).not.toHaveBeenCalledWith("device-status", expect.anything());
    });

    it("updates status for free from the currently-playing response's device field, never calling listDevices", async () => {
      setSetting("spotify_device_id", "device-a");
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      // Baseline (online) — no emit yet, and no listDevices call needed.
      await pollNowPlaying(
        vi.fn().mockResolvedValue(jsonResponse({ ...TRACK_A, device: { id: "device-a", name: "Kitchen Phone" } })),
        getTokenFn
      );
      expect(listDevices).not.toHaveBeenCalled();
      expect(emitEvent).not.toHaveBeenCalledWith("device-status", expect.anything());

      // Device field now shows a different device -> real change, still no listDevices call.
      await pollNowPlaying(
        vi.fn().mockResolvedValue(
          jsonResponse({ ...TRACK_B, device: { id: "some-other-device", name: "Other" } })
        ),
        getTokenFn
      );
      expect(listDevices).not.toHaveBeenCalled();
      expect(emitEvent).toHaveBeenCalledWith("device-status", {
        online: false,
        deviceId: "device-a",
        deviceName: undefined,
      });
    });

    it("falls back to a throttled real device-list check only when the response has no device field (204)", async () => {
      vi.useFakeTimers();
      setSetting("spotify_device_id", "device-a");
      vi.mocked(listDevices).mockResolvedValueOnce([DEVICE_A]).mockResolvedValue([]);
      const getTokenFn = vi.fn().mockResolvedValue("access-token");
      const fetchMock = vi.fn().mockResolvedValue(noContentResponse());

      // First 204 establishes baseline (online) via the fallback.
      await pollNowPlaying(fetchMock, getTokenFn);
      expect(listDevices).toHaveBeenCalledTimes(1);

      // Repeated 204s within the 5-minute throttle window don't re-check.
      await pollNowPlaying(fetchMock, getTokenFn);
      await pollNowPlaying(fetchMock, getTokenFn);
      expect(listDevices).toHaveBeenCalledTimes(1);
      expect(emitEvent).not.toHaveBeenCalledWith("device-status", expect.anything());

      // Once the window passes, the next 204 tick checks again — device is
      // now missing, a real change from the established baseline.
      vi.advanceTimersByTime(FIVE_MIN_MS + 1000);
      await pollNowPlaying(fetchMock, getTokenFn);

      expect(listDevices).toHaveBeenCalledTimes(2);
      expect(emitEvent).toHaveBeenCalledWith("device-status", {
        online: false,
        deviceId: "device-a",
        deviceName: undefined,
      });
    });

    it("does not re-check via the fallback while something is actively playing (device field keeps refreshing the throttle window)", async () => {
      setSetting("spotify_device_id", "device-a");
      const getTokenFn = vi.fn().mockResolvedValue("access-token");
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ ...TRACK_A, device: { id: "device-a", name: "Kitchen Phone" } }));

      for (let i = 0; i < 5; i += 1) {
        await pollNowPlaying(fetchMock, getTokenFn);
      }

      expect(listDevices).not.toHaveBeenCalled();
      expect(emitEvent).not.toHaveBeenCalledWith("device-status", expect.anything());
    });

    it("emits online:true when the device comes back after being offline (fallback path)", async () => {
      vi.useFakeTimers();
      setSetting("spotify_device_id", "device-a");
      vi.mocked(listDevices)
        .mockResolvedValueOnce([DEVICE_A]) // baseline online
        .mockResolvedValueOnce([]) // goes offline -> emits
        .mockResolvedValueOnce([DEVICE_A]); // back online -> emits
      const getTokenFn = vi.fn().mockResolvedValue("access-token");
      const fetchMock = vi.fn().mockResolvedValue(noContentResponse());

      await pollNowPlaying(fetchMock, getTokenFn); // baseline
      vi.advanceTimersByTime(FIVE_MIN_MS + 1000);
      await pollNowPlaying(fetchMock, getTokenFn); // offline
      vi.advanceTimersByTime(FIVE_MIN_MS + 1000);
      await pollNowPlaying(fetchMock, getTokenFn); // online again

      expect(emitEvent).toHaveBeenCalledWith(
        "device-status",
        expect.objectContaining({ online: false })
      );
      expect(emitEvent).toHaveBeenCalledWith(
        "device-status",
        expect.objectContaining({ online: true, deviceName: "Kitchen Phone" })
      );
    });

    it("does not abort the poll when the device-list fetch itself fails", async () => {
      setSetting("spotify_device_id", "device-a");
      vi.mocked(listDevices).mockRejectedValue(new Error("Spotify device list failed: 500"));
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await expect(
        pollNowPlaying(vi.fn().mockResolvedValue(noContentResponse()), getTokenFn)
      ).resolves.toBeUndefined();
    });
  });

  describe("rate-limit backoff (real-world 429 incident)", () => {
    it("arms the backoff window on a 429 from currently-playing, without throwing", async () => {
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await expect(
        pollNowPlaying(vi.fn().mockResolvedValue(rateLimitedResponse(45)), getTokenFn)
      ).resolves.toBeUndefined();

      expect(isRateLimited()).toBe(true);
    });

    it("skips the entire next tick (no token fetch, no Spotify calls) while backed off", async () => {
      const getTokenFn = vi.fn().mockResolvedValue("access-token");
      const fetchFn = vi.fn().mockResolvedValue(rateLimitedResponse(45));

      await pollNowPlaying(fetchFn, getTokenFn); // arms backoff
      getTokenFn.mockClear();
      fetchFn.mockClear();

      await pollNowPlaying(fetchFn, getTokenFn);

      expect(getTokenFn).not.toHaveBeenCalled();
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("falls back to a default backoff when Spotify doesn't send a Retry-After header", async () => {
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(rateLimitedResponse()), getTokenFn);

      expect(isRateLimited()).toBe(true);
    });

    it("resumes polling normally once the backoff window has passed", async () => {
      vi.useFakeTimers();
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(rateLimitedResponse(1)), getTokenFn);
      expect(isRateLimited()).toBe(true);

      vi.advanceTimersByTime(1100);
      expect(isRateLimited()).toBe(false);

      const fetchFn = vi.fn().mockResolvedValue(jsonResponse(TRACK_A));
      await pollNowPlaying(fetchFn, getTokenFn);
      expect(fetchFn).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("threads a QUOTA_EXCEEDED 429 body through to the shared backoff as a long window, not the ordinary short one", async () => {
      vi.useFakeTimers();
      const getTokenFn = vi.fn().mockResolvedValue("access-token");
      const quotaResponse = {
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "quota exceeded", reason: "QUOTA_EXCEEDED" } }),
        headers: {
          get: (name: string) => (name.toLowerCase() === "retry-after" ? "5" : null),
        },
      } as unknown as Response;

      await pollNowPlaying(vi.fn().mockResolvedValue(quotaResponse), getTokenFn);
      expect(isRateLimited()).toBe(true);

      // The 5s Retry-After the ordinary path would have used is long past —
      // the QUOTA_EXCEEDED window should still be active.
      vi.advanceTimersByTime(60_000);
      expect(isRateLimited()).toBe(true);

      vi.useRealTimers();
    });
  });

  describe("lyrics lookup on track change (LY1.1)", () => {
    it("emits lyrics-update once the lookup resolves for a new track", async () => {
      vi.mocked(getLyricsForTrack).mockResolvedValue({
        syncedLyrics: "[00:01.00] la la",
        plainLyrics: "la la",
        found: true,
      });
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);

      expect(getLyricsForTrack).toHaveBeenCalledWith("track-a", {
        trackName: "Song A",
        artistName: "Artist A",
        durationMs: 200000,
      });
      expect(emitEvent).toHaveBeenCalledWith("lyrics-update", {
        trackId: "track-a",
        syncedLyrics: "[00:01.00] la la",
        plainLyrics: "la la",
        found: true,
      });
    });

    it("does not delay the now-playing emit while the lyrics lookup is still pending", async () => {
      let resolveLyrics: (v: { syncedLyrics: string | null; plainLyrics: string | null; found: boolean }) => void;
      const pending = new Promise<{ syncedLyrics: string | null; plainLyrics: string | null; found: boolean }>(
        (resolve) => {
          resolveLyrics = resolve;
        }
      );
      vi.mocked(getLyricsForTrack).mockReturnValue(pending);
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);

      // now-playing already fired even though the lyrics lookup hasn't
      // resolved yet — pollNowPlaying's own promise resolved without
      // awaiting it.
      expect(emitEvent).toHaveBeenCalledWith(
        "now-playing",
        expect.objectContaining({ trackId: "track-a" })
      );
      expect(emitEvent).not.toHaveBeenCalledWith("lyrics-update", expect.anything());

      resolveLyrics!({ syncedLyrics: null, plainLyrics: "la", found: true });
      await new Promise((r) => setImmediate(r));

      expect(emitEvent).toHaveBeenCalledWith(
        "lyrics-update",
        expect.objectContaining({ trackId: "track-a" })
      );
    });

    it("catches a lyrics lookup rejection, logs it, and does not emit lyrics-update or throw", async () => {
      vi.mocked(getLyricsForTrack).mockRejectedValue(new Error("LRCLIB unreachable"));
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await expect(
        pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn)
      ).resolves.toBeUndefined();

      // Let the rejected lookup's .catch() handler run.
      await new Promise((r) => setImmediate(r));

      expect(emitEvent).not.toHaveBeenCalledWith("lyrics-update", expect.anything());
    });

    it("does not trigger a lyrics lookup or eviction on a play/pause toggle of the same track", async () => {
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
      vi.mocked(getLyricsForTrack).mockClear();
      vi.mocked(evictPreviousTrackLyrics).mockClear();

      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A_PAUSED)), getTokenFn);

      expect(getLyricsForTrack).not.toHaveBeenCalled();
      expect(evictPreviousTrackLyrics).not.toHaveBeenCalled();
    });

    it("evicts the previous track's lyrics when the track actually changes", async () => {
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
      vi.mocked(evictPreviousTrackLyrics).mockClear();

      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_B)), getTokenFn);

      expect(evictPreviousTrackLyrics).toHaveBeenCalledWith("track-a");
    });

    it("evicts the previous track's lyrics (but doesn't look up new lyrics) when playback stops", async () => {
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
      vi.mocked(getLyricsForTrack).mockClear();
      vi.mocked(evictPreviousTrackLyrics).mockClear();

      await pollNowPlaying(vi.fn().mockResolvedValue(noContentResponse()), getTokenFn);

      expect(evictPreviousTrackLyrics).toHaveBeenCalledWith("track-a");
      expect(getLyricsForTrack).not.toHaveBeenCalled();
    });

    it("getLyricsSnapshot returns the resolved result for the current track, and null for a mismatched trackId", async () => {
      vi.mocked(getLyricsForTrack).mockResolvedValue({
        syncedLyrics: "[00:01.00] la la",
        plainLyrics: "la la",
        found: true,
      });
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
      await new Promise((r) => setImmediate(r));

      expect(getLyricsSnapshot("track-a")).toEqual({
        syncedLyrics: "[00:01.00] la la",
        plainLyrics: "la la",
        found: true,
      });
      expect(getLyricsSnapshot("track-b")).toBeNull();
    });
  });

  describe("lastPolledAt staleness tracking (BACKLOG item 9, Bug A)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("starts at 0 (no poll has completed yet)", () => {
      expect(getLastPolledAt()).toBe(0);
    });

    it("is set on a normal successful poll", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);

      expect(getLastPolledAt()).toBe(1_000_000);
    });

    it("is updated again on a subsequent unchanged poll (still a completed attempt)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
      expect(getLastPolledAt()).toBe(1_000_000);

      vi.setSystemTime(1_004_000);
      await pollNowPlaying(
        vi.fn().mockResolvedValue(jsonResponse(TRACK_A_PROGRESSED)),
        getTokenFn
      );
      expect(getLastPolledAt()).toBe(1_004_000);
    });

    it("is NOT updated by the 429 poll that arms the backoff window, nor by the skipped tick that follows", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      const getTokenFn = vi.fn().mockResolvedValue("access-token");
      const fetchFn = vi.fn().mockResolvedValue(rateLimitedResponse(45));

      // The 429 itself short-circuits (arms the backoff window and returns)
      // before ever reaching the lastState/lastPolledAt assignment — so this
      // poll attempt does not count as "completed" either.
      await pollNowPlaying(fetchFn, getTokenFn);
      expect(getLastPolledAt()).toBe(0);
      expect(isRateLimited()).toBe(true);

      // Next tick is skipped outright while backed off — lastPolledAt must
      // not advance, since nothing was actually polled (that's the whole
      // point: the route needs to see this snapshot as stale).
      vi.setSystemTime(1_010_000);
      await pollNowPlaying(fetchFn, getTokenFn);
      expect(getLastPolledAt()).toBe(0);
    });

    it("is NOT updated while isRateLimited() causes a tick to be skipped, but resumes updating once the window passes", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      const getTokenFn = vi.fn().mockResolvedValue("access-token");

      // Establish a baseline successful poll.
      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
      expect(getLastPolledAt()).toBe(1_000_000);

      // Arm the backoff window directly (independent of the poll that arms
      // it in real usage) so this test isolates just the isRateLimited()
      // early-return guard at the top of pollNowPlaying.
      vi.setSystemTime(1_005_000);
      await pollNowPlaying(vi.fn().mockResolvedValue(rateLimitedResponse(30)), getTokenFn);
      expect(getLastPolledAt()).toBe(1_000_000); // unchanged — the 429 poll itself doesn't update it

      vi.setSystemTime(1_010_000);
      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_B)), getTokenFn);
      expect(getLastPolledAt()).toBe(1_000_000); // still frozen — this tick was skipped outright

      // Once the backoff window passes (armed for 30s at 1_005_000, so it
      // expires at 1_035_000), polling resumes and updates again.
      vi.setSystemTime(1_036_000);
      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_B)), getTokenFn);
      expect(getLastPolledAt()).toBe(1_036_000);
    });

    it("resets to 0 via resetNowPlayingState (test helper)", async () => {
      const getTokenFn = vi.fn().mockResolvedValue("access-token");
      await pollNowPlaying(vi.fn().mockResolvedValue(jsonResponse(TRACK_A)), getTokenFn);
      expect(getLastPolledAt()).not.toBe(0);

      resetNowPlayingState();
      expect(getLastPolledAt()).toBe(0);
    });
  });
});

describe("startNowPlayingPoller (event-scheduled polling, BACKLOG #24)", () => {
  beforeEach(() => {
    runMigrations();
    resetNowPlayingState();
    resetRateLimitForTests();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function playingResponse(progressMs: number, durationMs: number): Response {
    return jsonResponse({
      is_playing: true,
      progress_ms: progressMs,
      item: {
        id: "track-x",
        name: "Song X",
        artists: [{ name: "Artist X" }],
        album: { images: [{ url: "https://example.com/x.jpg" }] },
        duration_ms: durationMs,
      },
    });
  }

  function rateLimitedShortResponse(): Response {
    return {
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Too many requests" } }),
      headers: {
        get: (name: string) => (name.toLowerCase() === "retry-after" ? "1" : null),
      },
    } as unknown as Response;
  }

  it("does not poll on a fixed cadence before anything triggers it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(TRACK_A));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    const poller = startNowPlayingPoller(fetchMock, getTokenFn);
    expect(fetchMock).not.toHaveBeenCalled();
    // Nothing is known to be playing yet, so the only pending timer is the
    // safety net (15s) -- not some other fixed cadence.
    await vi.advanceTimersByTimeAsync(SAFETY_INTERVAL_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stopNowPlayingPoller(poller);
  });

  it("schedules the next poll at end-of-track-delay + buffer when a track is ending sooner than the safety interval", async () => {
    const fetchMock = vi.fn().mockResolvedValue(playingResponse(197000, 200000)); // 3s remaining
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    const poller = startNowPlayingPoller(fetchMock, getTokenFn);
    await triggerImmediateNowPlayingPoll();
    fetchMock.mockClear();

    // 3s remaining + ~750ms buffer = ~3.75s, well under the 15s safety net.
    await vi.advanceTimersByTimeAsync(3749);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stopNowPlayingPoller(poller);
  });

  it("caps the next poll at the 15s safety interval when a track has much longer left to play", async () => {
    const fetchMock = vi.fn().mockResolvedValue(playingResponse(1000, 61000)); // 60s remaining
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    const poller = startNowPlayingPoller(fetchMock, getTokenFn);
    await triggerImmediateNowPlayingPoll();
    fetchMock.mockClear();

    await vi.advanceTimersByTimeAsync(SAFETY_INTERVAL_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stopNowPlayingPoller(poller);
  });

  it("uses the 15s safety interval alone when nothing is playing (no end-of-track timer to schedule)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(noContentResponse());
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    const poller = startNowPlayingPoller(fetchMock, getTokenFn);
    await triggerImmediateNowPlayingPoll();
    fetchMock.mockClear();

    await vi.advanceTimersByTimeAsync(SAFETY_INTERVAL_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stopNowPlayingPoller(poller);
  });

  it("triggerImmediateNowPlayingPoll polls immediately and reschedules without leaving a stale/duplicate timer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(playingResponse(1000, 61000)); // 60s remaining
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    const poller = startNowPlayingPoller(fetchMock, getTokenFn);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    await triggerImmediateNowPlayingPoll();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Exactly one pending timer after the trigger -- the pre-trigger timer
    // was cancelled, and rescheduling created exactly one new one.
    expect(vi.getTimerCount()).toBe(1);

    // The rescheduled timer reflects the freshly polled state (60s
    // remaining -> capped at the 15s safety interval), not a stale timer
    // left over from before the trigger.
    await vi.advanceTimersByTimeAsync(SAFETY_INTERVAL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    stopNowPlayingPoller(poller);
  });

  it("triggerImmediateNowPlayingPoll is a no-op when no poller is currently running", async () => {
    await expect(triggerImmediateNowPlayingPoll()).resolves.toBeUndefined();
  });

  it("stopNowPlayingPoller cancels all pending timers, leaving nothing running", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(TRACK_A));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    const poller = startNowPlayingPoller(fetchMock, getTokenFn);
    expect(vi.getTimerCount()).toBe(1);

    stopNowPlayingPoller(poller);
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(SAFETY_INTERVAL_MS + 5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not schedule another poll after a stop, even if a trigger poll was already in flight", async () => {
    let resolveFetch: (v: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(jsonResponse(TRACK_A));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    const poller = startNowPlayingPoller(fetchMock, getTokenFn);
    const triggerPromise = triggerImmediateNowPlayingPoll();
    stopNowPlayingPoller(poller);
    resolveFetch(jsonResponse(TRACK_A));
    await triggerPromise;

    expect(vi.getTimerCount()).toBe(0);
  });

  it("a single failing poll does not stop future scheduled polls, and still reschedules at the safety interval", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const poller = startNowPlayingPoller(fetchMock, getTokenFn);
    await triggerImmediateNowPlayingPoll();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SAFETY_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    stopNowPlayingPoller(poller);
    consoleErrorSpy.mockRestore();
  });

  it("the isRateLimited() backoff still gates every poll regardless of trigger, and scheduling does not get stuck", async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimitedShortResponse());
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    const poller = startNowPlayingPoller(fetchMock, getTokenFn);
    await triggerImmediateNowPlayingPoll(); // hits 429, arms a 1s backoff, returns early
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isRateLimited()).toBe(true);

    // A next attempt is still scheduled (falls back to the safety interval,
    // since no playing-state info was available) -- the backoff doesn't
    // leave the scheduler stuck with nothing pending.
    await vi.advanceTimersByTimeAsync(SAFETY_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    stopNowPlayingPoller(poller);
  });
});
