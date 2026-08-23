import { beforeEach, describe, expect, it } from "vitest";
import { db, runMigrations } from "./index";
import { addBlacklistedArtist, getBlacklistedArtists, isArtistBlacklisted } from "./artistBlacklist";

beforeEach(() => {
  runMigrations();
  // Real shared-file-per-test-file DB with no per-test reset — clear the
  // setting this suite touches to a known state before each test.
  db.prepare("DELETE FROM app_settings WHERE key = 'blacklisted_artists'").run();
});

describe("getBlacklistedArtists", () => {
  it("returns [] when unset", () => {
    expect(getBlacklistedArtists()).toEqual([]);
  });
});

describe("addBlacklistedArtist / getBlacklistedArtists", () => {
  it("adds a trimmed artist name", () => {
    addBlacklistedArtist("  Some Artist  ");
    expect(getBlacklistedArtists()).toEqual(["Some Artist"]);
  });

  it("does not add a duplicate, case-insensitively", () => {
    addBlacklistedArtist("Some Artist");
    addBlacklistedArtist("some artist");
    expect(getBlacklistedArtists()).toEqual(["Some Artist"]);
  });

  it("accumulates distinct artists", () => {
    addBlacklistedArtist("Artist A");
    addBlacklistedArtist("Artist B");
    expect(getBlacklistedArtists()).toEqual(["Artist A", "Artist B"]);
  });
});

describe("isArtistBlacklisted", () => {
  it("is case-insensitive", () => {
    addBlacklistedArtist("Blocked Artist");
    expect(isArtistBlacklisted("blocked artist")).toBe(true);
    expect(isArtistBlacklisted("BLOCKED ARTIST")).toBe(true);
  });

  it("returns false for a non-blacklisted artist", () => {
    addBlacklistedArtist("Blocked Artist");
    expect(isArtistBlacklisted("Someone Else")).toBe(false);
  });

  it("returns false when nothing is blacklisted", () => {
    expect(isArtistBlacklisted("Anyone")).toBe(false);
  });
});
