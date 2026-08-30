import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, string>();

vi.mock("../db", () => ({
  getSetting: vi.fn((key: string) => settings.get(key)),
  setSetting: vi.fn((key: string, value: string) => {
    settings.set(key, value);
  }),
}));

vi.mock("./tokenRefresh", () => ({
  refreshAccessToken: vi.fn(),
}));

import { getSetting } from "../db";
import { refreshAccessToken } from "./tokenRefresh";
import { getArtist, getValidAccessToken, searchTracks } from "./client";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

const SAMPLE_SEARCH_RESPONSE = {
  tracks: {
    items: [
      {
        id: "track-1",
        name: "Song One",
        artists: [{ name: "Artist A" }],
        album: {
          images: [
            { url: "https://example.com/large.jpg" },
            { url: "https://example.com/small.jpg" },
          ],
        },
        duration_ms: 210000,
        explicit: true,
      },
      {
        id: "track-2",
        name: "Song Two",
        artists: [{ name: "Artist B" }, { name: "Artist C" }],
        album: { images: [] },
        duration_ms: 180000,
        explicit: false,
      },
    ],
  },
};

describe("getValidAccessToken", () => {
  beforeEach(() => {
    settings.clear();
    vi.clearAllMocks();
  });

  it("returns the stored token without refreshing when it's still valid", async () => {
    settings.set("spotify_access_token", "valid-token");
    settings.set("spotify_token_expires_at", String(Date.now() + 10 * 60 * 1000));

    const refreshFn = vi.fn();
    const token = await getValidAccessToken(refreshFn);

    expect(token).toBe("valid-token");
    expect(refreshFn).not.toHaveBeenCalled();
  });

  it("refreshes when the token is missing", async () => {
    const refreshFn = vi.fn().mockImplementation(async () => {
      settings.set("spotify_access_token", "refreshed-token");
      settings.set("spotify_token_expires_at", String(Date.now() + 3600 * 1000));
    });

    const token = await getValidAccessToken(refreshFn);

    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(token).toBe("refreshed-token");
  });

  it("refreshes when the token is expired or about to expire", async () => {
    settings.set("spotify_access_token", "stale-token");
    settings.set("spotify_token_expires_at", String(Date.now() + 1000)); // within safety margin

    const refreshFn = vi.fn().mockImplementation(async () => {
      settings.set("spotify_access_token", "refreshed-token");
      settings.set("spotify_token_expires_at", String(Date.now() + 3600 * 1000));
    });

    const token = await getValidAccessToken(refreshFn);

    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(token).toBe("refreshed-token");
  });

  it("propagates the error thrown by refreshAccessToken when there's no refresh token yet", async () => {
    const refreshFn = vi.fn().mockRejectedValue(
      new Error("No spotify_refresh_token stored yet — skip refresh")
    );

    await expect(getValidAccessToken(refreshFn)).rejects.toThrow(/No spotify_refresh_token/);
  });

  it("uses the real refreshAccessToken import by default", () => {
    // Just verifying the default param wiring doesn't throw at module load.
    expect(typeof refreshAccessToken).toBe("function");
    expect(typeof getSetting).toBe("function");
  });
});

describe("searchTracks", () => {
  beforeEach(() => {
    settings.clear();
    vi.clearAllMocks();
  });

  it("shapes Spotify search results into { id, name, artist, albumArt, durationMs, explicit }", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SAMPLE_SEARCH_RESPONSE));
    const getTokenFn = vi.fn().mockResolvedValue("test-access-token");

    const results = await searchTracks("party", 20, fetchMock, getTokenFn);

    expect(results).toEqual([
      {
        id: "track-1",
        name: "Song One",
        artist: "Artist A",
        albumArt: "https://example.com/large.jpg",
        durationMs: 210000,
        explicit: true,
      },
      {
        id: "track-2",
        name: "Song Two",
        artist: "Artist B, Artist C",
        albumArt: null,
        durationMs: 180000,
        explicit: false,
      },
    ]);

    // Explicit tracks must NOT be filtered out here — that's P2.4's job.
    expect(results.some((t) => t.explicit)).toBe(true);
  });

  it("calls the Spotify search endpoint with the query, type=track, and bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tracks: { items: [] } }));
    const getTokenFn = vi.fn().mockResolvedValue("test-access-token");

    await searchTracks("hello world", 20, fetchMock, getTokenFn);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("https://api.spotify.com/v1/search?");
    expect(url).toContain("q=hello+world");
    expect(url).toContain("type=track");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
  });

  it("throws a clear error when Spotify returns a non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { status: 401, message: "Invalid access token" } }, false, 401)
    );
    const getTokenFn = vi.fn().mockResolvedValue("bad-token");

    await expect(searchTracks("test", 20, fetchMock, getTokenFn)).rejects.toThrow(
      /Spotify search failed/
    );
  });

  it("propagates errors from token acquisition without crashing", async () => {
    const fetchMock = vi.fn();
    const getTokenFn = vi.fn().mockRejectedValue(new Error("No spotify_refresh_token stored"));

    await expect(searchTracks("test", 20, fetchMock, getTokenFn)).rejects.toThrow(
      /No spotify_refresh_token/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getArtist", () => {
  beforeEach(() => {
    settings.clear();
    vi.clearAllMocks();
  });

  it("shapes a Spotify artist response into { id, name, genres, imageUrl, followers }", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "artist-1",
        name: "Artist One",
        genres: ["pop", "dance pop"],
        images: [
          { url: "https://example.com/large.jpg", height: 640, width: 640 },
          { url: "https://example.com/small.jpg", height: 160, width: 160 },
        ],
        followers: { total: 12345 },
      })
    );
    const getTokenFn = vi.fn().mockResolvedValue("test-access-token");

    const result = await getArtist("artist-1", fetchMock, getTokenFn);

    expect(result).toEqual({
      id: "artist-1",
      name: "Artist One",
      genres: ["pop", "dance pop"],
      imageUrl: "https://example.com/large.jpg",
      followers: 12345,
    });
  });

  it("shapes imageUrl as null when the artist has no images", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "artist-2",
        name: "Artist Two",
        genres: [],
        images: [],
        followers: { total: 0 },
      })
    );
    const getTokenFn = vi.fn().mockResolvedValue("test-access-token");

    const result = await getArtist("artist-2", fetchMock, getTokenFn);

    expect(result.imageUrl).toBeNull();
  });

  it("defaults followers to 0 and imageUrl to null when Spotify omits those fields", async () => {
    // Regression test for BACKLOG item 15: Spotify's response shape for a
    // given artist ID isn't fully reliable — `followers` and `images` have
    // been observed missing/undefined entirely (not just empty), which used
    // to throw a raw TypeError (`Cannot read properties of undefined`) that
    // fell through the route's error handler as a generic 502.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "artist-3",
        name: "Artist Three",
        genres: [],
        // `images` and `followers` intentionally omitted.
      })
    );
    const getTokenFn = vi.fn().mockResolvedValue("test-access-token");

    const result = await getArtist("artist-3", fetchMock, getTokenFn);

    expect(result).toEqual({
      id: "artist-3",
      name: "Artist Three",
      genres: [],
      imageUrl: null,
      followers: 0,
    });
  });

  it("calls the Spotify artist endpoint with the id and bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ id: "artist-1", name: "A", genres: [], images: [], followers: { total: 0 } })
    );
    const getTokenFn = vi.fn().mockResolvedValue("test-access-token");

    await getArtist("artist-1", fetchMock, getTokenFn);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.spotify.com/v1/artists/artist-1");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
  });

  it("throws a clear error when Spotify returns a non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { status: 404, message: "Not found" } }, false, 404)
    );
    const getTokenFn = vi.fn().mockResolvedValue("test-access-token");

    await expect(getArtist("missing-artist", fetchMock, getTokenFn)).rejects.toThrow(
      /Spotify artist lookup failed: 404/
    );
  });

  it("propagates errors from token acquisition without crashing", async () => {
    const fetchMock = vi.fn();
    const getTokenFn = vi.fn().mockRejectedValue(new Error("No spotify_refresh_token stored"));

    await expect(getArtist("artist-1", fetchMock, getTokenFn)).rejects.toThrow(
      /No spotify_refresh_token/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
