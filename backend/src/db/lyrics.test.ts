import { beforeEach, describe, expect, it } from "vitest";
import { db, runMigrations } from "./index";
import { addFavorite } from "./favorites";
import { deleteLyricsIfNotFavorited, getCachedLyrics, saveLyrics } from "./lyrics";

beforeEach(() => {
  runMigrations();
  db.prepare("DELETE FROM lyrics").run();
  db.prepare("DELETE FROM favorites").run();
});

describe("saveLyrics / getCachedLyrics", () => {
  it("returns null for a track with no recorded lookup", () => {
    expect(getCachedLyrics("track-unknown")).toBeNull();
  });

  it("saves and round-trips a found lyrics result", () => {
    saveLyrics("track-1", {
      syncedLyrics: "[00:01.00] la la la",
      plainLyrics: "la la la",
      found: true,
    });

    const cached = getCachedLyrics("track-1");
    expect(cached).toMatchObject({
      spotifyTrackId: "track-1",
      syncedLyrics: "[00:01.00] la la la",
      plainLyrics: "la la la",
      found: true,
    });
    expect(typeof cached?.fetchedAt).toBe("string");
  });

  it("saves and round-trips a not-found result distinctly from no row at all", () => {
    saveLyrics("track-2", { syncedLyrics: null, plainLyrics: null, found: false });

    const cached = getCachedLyrics("track-2");
    expect(cached).toMatchObject({
      spotifyTrackId: "track-2",
      syncedLyrics: null,
      plainLyrics: null,
      found: false,
    });
  });

  it("upserts on conflict: saving twice for the same track updates rather than erroring", () => {
    saveLyrics("track-3", { syncedLyrics: null, plainLyrics: null, found: false });
    saveLyrics("track-3", {
      syncedLyrics: "[00:01.00] hi",
      plainLyrics: "hi",
      found: true,
    });

    const cached = getCachedLyrics("track-3");
    expect(cached).toMatchObject({
      syncedLyrics: "[00:01.00] hi",
      plainLyrics: "hi",
      found: true,
    });

    const rows = db.prepare("SELECT * FROM lyrics WHERE spotify_track_id = ?").all("track-3");
    expect(rows).toHaveLength(1);
  });
});

describe("deleteLyricsIfNotFavorited", () => {
  it("does not evict a lyrics row for a track favorited by any guest", () => {
    saveLyrics("track-fav", { syncedLyrics: null, plainLyrics: "lyrics", found: true });
    addFavorite({
      guestSessionId: "guest-1",
      spotifyTrackId: "track-fav",
      trackName: "Song",
      artistName: "Artist",
      albumArtUrl: null,
      durationMs: 100_000,
    });

    deleteLyricsIfNotFavorited("track-fav");

    expect(getCachedLyrics("track-fav")).not.toBeNull();
  });

  it("evicts a lyrics row for a track not favorited by anyone", () => {
    saveLyrics("track-unfav", { syncedLyrics: null, plainLyrics: "lyrics", found: true });

    deleteLyricsIfNotFavorited("track-unfav");

    expect(getCachedLyrics("track-unfav")).toBeNull();
  });

  it("does not throw when called for a track with no lyrics row at all", () => {
    expect(() => deleteLyricsIfNotFavorited("track-nonexistent")).not.toThrow();
  });
});
