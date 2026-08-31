import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/lyrics", () => ({
  getCachedLyrics: vi.fn(),
  saveLyrics: vi.fn(),
  deleteLyricsIfNotFavorited: vi.fn(),
}));

vi.mock("./lrclib", () => ({
  fetchLyricsFromLrclib: vi.fn(),
}));

import { deleteLyricsIfNotFavorited, getCachedLyrics, saveLyrics } from "../db/lyrics";
import { fetchLyricsFromLrclib } from "./lrclib";
import { evictPreviousTrackLyrics, getLyricsForTrack } from "./lyricsService";

const trackMeta = { trackName: "Song", artistName: "Artist" };

describe("getLyricsForTrack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the cached result on a cache hit (found: true) without calling LRCLIB", async () => {
    vi.mocked(getCachedLyrics).mockReturnValue({
      spotifyTrackId: "track1",
      syncedLyrics: "[00:01.00] hi",
      plainLyrics: "hi",
      found: true,
      fetchedAt: "2026-08-30T00:00:00.000Z",
    });

    const result = await getLyricsForTrack("track1", trackMeta);

    expect(result).toEqual({ syncedLyrics: "[00:01.00] hi", plainLyrics: "hi", found: true });
    expect(fetchLyricsFromLrclib).not.toHaveBeenCalled();
    expect(saveLyrics).not.toHaveBeenCalled();
  });

  it("returns the cached not-found result on a cache hit (found: false) without calling LRCLIB", async () => {
    vi.mocked(getCachedLyrics).mockReturnValue({
      spotifyTrackId: "track1",
      syncedLyrics: null,
      plainLyrics: null,
      found: false,
      fetchedAt: "2026-08-30T00:00:00.000Z",
    });

    const result = await getLyricsForTrack("track1", trackMeta);

    expect(result).toEqual({ syncedLyrics: null, plainLyrics: null, found: false });
    expect(fetchLyricsFromLrclib).not.toHaveBeenCalled();
    expect(saveLyrics).not.toHaveBeenCalled();
  });

  it("on a cache miss, fetches from LRCLIB and saves+returns a found result", async () => {
    vi.mocked(getCachedLyrics).mockReturnValue(null);
    vi.mocked(fetchLyricsFromLrclib).mockResolvedValue({
      syncedLyrics: "[00:01.00] hi",
      plainLyrics: "hi",
    });

    const result = await getLyricsForTrack("track1", trackMeta);

    expect(fetchLyricsFromLrclib).toHaveBeenCalledWith(trackMeta);
    expect(saveLyrics).toHaveBeenCalledWith("track1", {
      syncedLyrics: "[00:01.00] hi",
      plainLyrics: "hi",
      found: true,
    });
    expect(result).toEqual({ syncedLyrics: "[00:01.00] hi", plainLyrics: "hi", found: true });
  });

  it("on a cache miss, when LRCLIB returns null, saves and returns a not-found result", async () => {
    vi.mocked(getCachedLyrics).mockReturnValue(null);
    vi.mocked(fetchLyricsFromLrclib).mockResolvedValue(null);

    const result = await getLyricsForTrack("track1", trackMeta);

    expect(saveLyrics).toHaveBeenCalledWith("track1", {
      syncedLyrics: null,
      plainLyrics: null,
      found: false,
    });
    expect(result).toEqual({ syncedLyrics: null, plainLyrics: null, found: false });
  });

  it("propagates the error and does not cache anything when LRCLIB throws", async () => {
    vi.mocked(getCachedLyrics).mockReturnValue(null);
    const error = new Error("LRCLIB get request failed: 500");
    vi.mocked(fetchLyricsFromLrclib).mockRejectedValue(error);

    await expect(getLyricsForTrack("track1", trackMeta)).rejects.toThrow(
      "LRCLIB get request failed: 500"
    );
    expect(saveLyrics).not.toHaveBeenCalled();
  });
});

describe("evictPreviousTrackLyrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls deleteLyricsIfNotFavorited when given a truthy previous track id", () => {
    evictPreviousTrackLyrics("previousTrack");

    expect(deleteLyricsIfNotFavorited).toHaveBeenCalledWith("previousTrack");
  });

  it("does nothing when given null", () => {
    evictPreviousTrackLyrics(null);

    expect(deleteLyricsIfNotFavorited).not.toHaveBeenCalled();
  });

  it("does nothing when given undefined", () => {
    evictPreviousTrackLyrics(undefined);

    expect(deleteLyricsIfNotFavorited).not.toHaveBeenCalled();
  });
});
