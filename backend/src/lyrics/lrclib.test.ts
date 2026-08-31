import { describe, expect, it, vi } from "vitest";
import { fetchLyricsFromLrclib } from "./lrclib";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("fetchLyricsFromLrclib", () => {
  it("returns lyrics when /api/get finds an exact match", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ syncedLyrics: "[00:01.00] hi", plainLyrics: "hi" })
    );

    const result = await fetchLyricsFromLrclib(
      { trackName: "Song", artistName: "Artist" },
      fetchFn
    );

    expect(result).toEqual({ syncedLyrics: "[00:01.00] hi", plainLyrics: "hi" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toContain("/api/get?");
  });

  it("falls back to /api/search when /api/get 404s, using the first result", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "not found" }, 404))
      .mockResolvedValueOnce(
        jsonResponse([
          { syncedLyrics: null, plainLyrics: "search result lyrics" },
          { syncedLyrics: null, plainLyrics: "second result" },
        ])
      );

    const result = await fetchLyricsFromLrclib(
      { trackName: "Song", artistName: "Artist" },
      fetchFn
    );

    expect(result).toEqual({ syncedLyrics: null, plainLyrics: "search result lyrics" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][0]).toContain("/api/search?");
  });

  it("returns null when /api/get 404s and /api/search returns an empty array", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "not found" }, 404))
      .mockResolvedValueOnce(jsonResponse([]));

    const result = await fetchLyricsFromLrclib(
      { trackName: "Song", artistName: "Artist" },
      fetchFn
    );

    expect(result).toBeNull();
  });

  it("throws when /api/get returns a 500", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "server error" }, 500));

    await expect(
      fetchLyricsFromLrclib({ trackName: "Song", artistName: "Artist" }, fetchFn)
    ).rejects.toThrow();
  });

  it("throws when /api/search (after a /api/get 404) returns a non-2xx response", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "not found" }, 404))
      .mockResolvedValueOnce(jsonResponse({ error: "server error" }, 500));

    await expect(
      fetchLyricsFromLrclib({ trackName: "Song", artistName: "Artist" }, fetchFn)
    ).rejects.toThrow();
  });

  it("includes album_name and duration (converted to seconds) in the /api/get query when provided", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ syncedLyrics: null, plainLyrics: "hi" })
    );

    await fetchLyricsFromLrclib(
      { trackName: "Song", artistName: "Artist", albumName: "Album", durationMs: 245_000 },
      fetchFn
    );

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("album_name=Album");
    expect(url).toContain("duration=245");
  });
});
