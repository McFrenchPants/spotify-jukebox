import { beforeEach, describe, expect, it } from "vitest";
import { db, runMigrations } from "./index";
import {
  addFavorite,
  getFavoriteStatusForTracks,
  listFavoritesForGuest,
  removeFavorite,
} from "./favorites";

function favorite(overrides: Partial<Parameters<typeof addFavorite>[0]> = {}) {
  return {
    guestSessionId: "guest-1",
    spotifyTrackId: "track-1",
    trackName: "Song One",
    artistName: "Artist A",
    albumArtUrl: "https://example.com/one.jpg",
    durationMs: 200_000,
    ...overrides,
  };
}

beforeEach(() => {
  runMigrations();
  db.prepare("DELETE FROM favorites").run();
});

describe("addFavorite / listFavoritesForGuest", () => {
  it("inserts a favorite and lists it back", () => {
    addFavorite(favorite());

    const favorites = listFavoritesForGuest("guest-1");
    expect(favorites).toHaveLength(1);
    expect(favorites[0]).toMatchObject({
      guestSessionId: "guest-1",
      spotifyTrackId: "track-1",
      trackName: "Song One",
      artistName: "Artist A",
      albumArtUrl: "https://example.com/one.jpg",
      durationMs: 200_000,
    });
    expect(typeof favorites[0].favoritedAt).toBe("string");
  });

  it("orders results newest-favorited first", () => {
    addFavorite(favorite({ spotifyTrackId: "track-1" }));
    addFavorite(favorite({ spotifyTrackId: "track-2" }));
    addFavorite(favorite({ spotifyTrackId: "track-3" }));

    const favorites = listFavoritesForGuest("guest-1");
    expect(favorites.map((f) => f.spotifyTrackId)).toEqual(["track-3", "track-2", "track-1"]);
  });

  it("adding the same guest+track twice is a no-op (still one row)", () => {
    addFavorite(favorite());
    addFavorite(favorite());

    expect(listFavoritesForGuest("guest-1")).toHaveLength(1);
  });

  it("scopes results to the given guest session", () => {
    addFavorite(favorite({ guestSessionId: "guest-1", spotifyTrackId: "track-1" }));
    addFavorite(favorite({ guestSessionId: "guest-2", spotifyTrackId: "track-2" }));

    expect(listFavoritesForGuest("guest-1").map((f) => f.spotifyTrackId)).toEqual(["track-1"]);
  });

  it("returns [] for a guest with no favorites", () => {
    expect(listFavoritesForGuest("guest-nobody")).toEqual([]);
  });
});

describe("removeFavorite", () => {
  it("removes a matching favorite", () => {
    addFavorite(favorite());
    removeFavorite("guest-1", "track-1");

    expect(listFavoritesForGuest("guest-1")).toEqual([]);
  });

  it("does not throw when removing a nonexistent favorite", () => {
    expect(() => removeFavorite("guest-1", "track-nonexistent")).not.toThrow();
  });
});

describe("getFavoriteStatusForTracks", () => {
  it("distinguishes favorited-by-me, favorited-by-someone-else-only, and favorited-by-nobody", () => {
    addFavorite(favorite({ guestSessionId: "guest-1", spotifyTrackId: "track-mine" }));
    addFavorite(favorite({ guestSessionId: "guest-2", spotifyTrackId: "track-other" }));

    const status = getFavoriteStatusForTracks("guest-1", [
      "track-mine",
      "track-other",
      "track-nobody",
    ]);

    expect(status["track-mine"]).toEqual({ favoritedByMe: true, favoritedByAnyone: true, favoriteCount: 1 });
    expect(status["track-other"]).toEqual({ favoritedByMe: false, favoritedByAnyone: true, favoriteCount: 1 });
    expect(status["track-nobody"]).toEqual({ favoritedByMe: false, favoritedByAnyone: false, favoriteCount: 0 });
  });

  it("treats every track as not-favorited-by-me when no guestSessionId is provided", () => {
    addFavorite(favorite({ guestSessionId: "guest-1", spotifyTrackId: "track-1" }));

    const status = getFavoriteStatusForTracks(undefined, ["track-1"]);

    expect(status["track-1"]).toEqual({ favoritedByMe: false, favoritedByAnyone: true, favoriteCount: 1 });
  });

  it("returns {} for an empty trackIds array without querying", () => {
    expect(getFavoriteStatusForTracks("guest-1", [])).toEqual({});
  });
});
