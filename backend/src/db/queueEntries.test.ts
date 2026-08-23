import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./index";
import {
  clearQueueEntries,
  deleteQueueEntry,
  dequeueBySpotifyTrackId,
  insertQueueEntry,
  listQueueEntries,
} from "./queueEntries";

function entry(overrides: Partial<Parameters<typeof insertQueueEntry>[0]> = {}) {
  return {
    spotifyTrackId: "track-1",
    trackName: "Song One",
    artistName: "Artist A",
    albumArtUrl: "https://example.com/one.jpg",
    durationMs: 200_000,
    addedBySessionId: "session-1",
    ...overrides,
  };
}

beforeEach(() => {
  runMigrations();
  clearQueueEntries();
});

describe("insertQueueEntry / listQueueEntries", () => {
  it("inserts a row and returns its new id", () => {
    const id = insertQueueEntry(entry());
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("lists entries in FIFO (ascending id) order", () => {
    const id1 = insertQueueEntry(entry({ spotifyTrackId: "track-1" }));
    const id2 = insertQueueEntry(entry({ spotifyTrackId: "track-2" }));
    const id3 = insertQueueEntry(entry({ spotifyTrackId: "track-3" }));

    const entries = listQueueEntries();
    expect(entries.map((e) => e.id)).toEqual([id1, id2, id3]);
    expect(entries.map((e) => e.spotifyTrackId)).toEqual(["track-1", "track-2", "track-3"]);
  });

  it("maps all fields correctly", () => {
    insertQueueEntry(entry({ albumArtUrl: null, addedBySessionId: null }));
    const [row] = listQueueEntries();

    expect(row.spotifyTrackId).toBe("track-1");
    expect(row.trackName).toBe("Song One");
    expect(row.artistName).toBe("Artist A");
    expect(row.albumArtUrl).toBeNull();
    expect(row.durationMs).toBe(200_000);
    expect(row.addedBySessionId).toBeNull();
    expect(typeof row.addedAt).toBe("string");
  });

  it("returns [] when empty", () => {
    expect(listQueueEntries()).toEqual([]);
  });
});

describe("deleteQueueEntry", () => {
  it("deletes a matching row and returns true", () => {
    const id = insertQueueEntry(entry());
    expect(deleteQueueEntry(id)).toBe(true);
    expect(listQueueEntries()).toEqual([]);
  });

  it("returns false for a non-existent id", () => {
    expect(deleteQueueEntry(999_999)).toBe(false);
  });
});

describe("dequeueBySpotifyTrackId", () => {
  it("removes only the oldest matching row", () => {
    const id1 = insertQueueEntry(entry({ spotifyTrackId: "track-dup" }));
    const id2 = insertQueueEntry(entry({ spotifyTrackId: "track-dup" }));

    dequeueBySpotifyTrackId("track-dup");

    const remaining = listQueueEntries();
    expect(remaining.map((e) => e.id)).toEqual([id2]);
    expect(id1).not.toBe(id2);
  });

  it("is a no-op when no row matches", () => {
    insertQueueEntry(entry({ spotifyTrackId: "track-1" }));
    dequeueBySpotifyTrackId("track-nonexistent");
    expect(listQueueEntries()).toHaveLength(1);
  });
});

describe("clearQueueEntries", () => {
  it("removes all rows", () => {
    insertQueueEntry(entry({ spotifyTrackId: "track-1" }));
    insertQueueEntry(entry({ spotifyTrackId: "track-2" }));

    clearQueueEntries();

    expect(listQueueEntries()).toEqual([]);
  });
});
