import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../db";
import { clearQueueEntries, insertQueueEntry } from "../db/queueEntries";
import { resyncSpotifyQueue } from "./queueSync";

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

const DEVICE_ID = "device-under-test";

beforeEach(() => {
  runMigrations();
  clearQueueEntries();
});

describe("resyncSpotifyQueue", () => {
  it("returns early without calling Spotify's play endpoint when nothing is playing and the local queue is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(noContentResponse());
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await resyncSpotifyQueue(DEVICE_ID, fetchMock, getTokenFn);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers: { Authorization: "Bearer access-token" } }
    );
  });

  it("builds uris as [currently-playing, ...queue] with fresh progress_ms, and PUTs to /me/player/play", async () => {
    insertQueueEntry({
      spotifyTrackId: "track-2",
      trackName: "Song Two",
      artistName: "Artist B",
      albumArtUrl: null,
      durationMs: 200_000,
      addedBySessionId: null,
    });
    insertQueueEntry({
      spotifyTrackId: "track-3",
      trackName: "Song Three",
      artistName: "Artist C",
      albumArtUrl: null,
      durationMs: 200_000,
      addedBySessionId: null,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ progress_ms: 42_000, item: { id: "track-1" } })
      )
      .mockResolvedValueOnce(jsonResponse({}, 200));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await resyncSpotifyQueue(DEVICE_ID, fetchMock, getTokenFn);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`https://api.spotify.com/v1/me/player/play?device_id=${DEVICE_ID}`);
    expect(options.method).toBe("PUT");
    expect(options.headers.Authorization).toBe("Bearer access-token");
    expect(JSON.parse(options.body)).toEqual({
      uris: ["spotify:track:track-1", "spotify:track:track-2", "spotify:track:track-3"],
      position_ms: 42_000,
    });
  });

  it("uses position_ms 0 and omits the current track from uris when nothing is playing but the queue has entries", async () => {
    insertQueueEntry({
      spotifyTrackId: "track-a",
      trackName: "Song A",
      artistName: "Artist A",
      albumArtUrl: null,
      durationMs: 200_000,
      addedBySessionId: null,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(jsonResponse({}, 200));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await resyncSpotifyQueue(DEVICE_ID, fetchMock, getTokenFn);

    const options = fetchMock.mock.calls[1][1];
    expect(JSON.parse(options.body)).toEqual({
      uris: ["spotify:track:track-a"],
      position_ms: 0,
    });
  });

  it("resyncs with just the currently-playing track when the local queue is empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ progress_ms: 1000, item: { id: "track-1" } }))
      .mockResolvedValueOnce(jsonResponse({}, 200));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await resyncSpotifyQueue(DEVICE_ID, fetchMock, getTokenFn);

    const options = fetchMock.mock.calls[1][1];
    expect(JSON.parse(options.body)).toEqual({
      uris: ["spotify:track:track-1"],
      position_ms: 1000,
    });
  });

  it("throws when the currently-playing lookup fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await expect(resyncSpotifyQueue(DEVICE_ID, fetchMock, getTokenFn)).rejects.toThrow(
      /currently-playing lookup failed/
    );
  });

  it("throws when the play call fails", async () => {
    insertQueueEntry({
      spotifyTrackId: "track-a",
      trackName: "Song A",
      artistName: "Artist A",
      albumArtUrl: null,
      durationMs: 200_000,
      addedBySessionId: null,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(jsonResponse({ error: { message: "bad request" } }, 400));
    const getTokenFn = vi.fn().mockResolvedValue("access-token");

    await expect(resyncSpotifyQueue(DEVICE_ID, fetchMock, getTokenFn)).rejects.toThrow(
      /queue resync failed/
    );
  });
});
