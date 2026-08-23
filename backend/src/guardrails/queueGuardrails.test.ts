import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, runMigrations, setSetting } from "../db";
import {
  DEFAULT_EXPLICIT_FILTER_ENABLED,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_MIN_DURATION_MS,
  EXPLICIT_FILTER_ENABLED_KEY,
  MAX_DURATION_MS_KEY,
  MIN_DURATION_MS_KEY,
  checkBlacklist,
  checkDuplicate,
  checkDurationBounds,
  checkExplicitFilter,
  runQueueGuardrails,
} from "./queueGuardrails";

const testTrackIds: string[] = [];

function trackStatsRow(id: string, isBlacklisted: 0 | 1): void {
  db.prepare(
    `INSERT INTO track_stats (spotify_track_id, is_blacklisted) VALUES (?, ?)
     ON CONFLICT(spotify_track_id) DO UPDATE SET is_blacklisted = excluded.is_blacklisted`
  ).run(id, isBlacklisted);
  testTrackIds.push(id);
}

beforeEach(() => {
  runMigrations();
  // The backing DB is a real shared file with no per-test reset, so
  // explicitly reset every setting we use to its documented default.
  setSetting(EXPLICIT_FILTER_ENABLED_KEY, DEFAULT_EXPLICIT_FILTER_ENABLED);
  setSetting(MIN_DURATION_MS_KEY, String(DEFAULT_MIN_DURATION_MS));
  setSetting(MAX_DURATION_MS_KEY, String(DEFAULT_MAX_DURATION_MS));
});

afterEach(() => {
  while (testTrackIds.length > 0) {
    const id = testTrackIds.pop()!;
    db.prepare("DELETE FROM track_stats WHERE spotify_track_id = ?").run(id);
  }
});

describe("checkExplicitFilter", () => {
  it("blocks an explicit track when the filter is enabled", () => {
    setSetting(EXPLICIT_FILTER_ENABLED_KEY, "true");
    const result = checkExplicitFilter({ explicit: true });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("explicit");
  });

  it("allows a non-explicit track when the filter is enabled", () => {
    setSetting(EXPLICIT_FILTER_ENABLED_KEY, "true");
    expect(checkExplicitFilter({ explicit: false }).allowed).toBe(true);
  });

  it("allows an explicit track when the filter is disabled", () => {
    setSetting(EXPLICIT_FILTER_ENABLED_KEY, "false");
    expect(checkExplicitFilter({ explicit: true }).allowed).toBe(true);
  });

  it("allows a non-explicit track by default (setting unset)", () => {
    db.prepare("DELETE FROM app_settings WHERE key = ?").run(EXPLICIT_FILTER_ENABLED_KEY);
    expect(checkExplicitFilter({ explicit: false }).allowed).toBe(true);
  });

  it("blocks an explicit track by default (setting unset) -- fail restrictive", () => {
    db.prepare("DELETE FROM app_settings WHERE key = ?").run(EXPLICIT_FILTER_ENABLED_KEY);
    const result = checkExplicitFilter({ explicit: true });
    expect(result.allowed).toBe(false);
  });
});

describe("checkDurationBounds", () => {
  it("blocks a track below the default minimum duration", () => {
    const result = checkDurationBounds({ durationMs: 30_000 });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("duration_too_short");
  });

  it("blocks a track above the default maximum duration", () => {
    const result = checkDurationBounds({ durationMs: 600_000 });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("duration_too_long");
  });

  it("allows a track within the default bounds", () => {
    expect(checkDurationBounds({ durationMs: 180_000 }).allowed).toBe(true);
  });

  it("reads overridden min/max settings live", () => {
    setSetting(MIN_DURATION_MS_KEY, "100000");
    setSetting(MAX_DURATION_MS_KEY, "200000");

    expect(checkDurationBounds({ durationMs: 90_000 }).allowed).toBe(false);
    expect(checkDurationBounds({ durationMs: 250_000 }).allowed).toBe(false);
    expect(checkDurationBounds({ durationMs: 150_000 }).allowed).toBe(true);
  });
});

describe("checkDuplicate", () => {
  it("blocks when the track matches the currently playing track", () => {
    const result = checkDuplicate("track-1", "track-1", []);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("duplicate");
  });

  it("blocks when the track is already in the queue", () => {
    const result = checkDuplicate("track-2", null, ["track-a", "track-2"]);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("duplicate");
  });

  it("allows when the track is neither playing nor queued", () => {
    expect(checkDuplicate("track-3", "track-other", ["track-a", "track-b"]).allowed).toBe(true);
  });
});

describe("checkBlacklist", () => {
  it("blocks a track with is_blacklisted = 1", () => {
    trackStatsRow("bl-track-1", 1);
    const result = checkBlacklist("bl-track-1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("blacklisted");
  });

  it("allows a track with is_blacklisted = 0", () => {
    trackStatsRow("bl-track-2", 0);
    expect(checkBlacklist("bl-track-2").allowed).toBe(true);
  });

  it("allows a track with no track_stats row at all", () => {
    expect(checkBlacklist("bl-track-nonexistent").allowed).toBe(true);
  });
});

describe("runQueueGuardrails", () => {
  it("short-circuits on the first failing guardrail (explicit filter before duration)", () => {
    setSetting(EXPLICIT_FILTER_ENABLED_KEY, "true");
    // Both explicit filter AND duration bounds would fail here; explicit
    // filter runs first per the documented order, so its reason should win.
    const result = runQueueGuardrails(
      { id: "combo-track-1", explicit: true, durationMs: 10_000 },
      { currentlyPlayingTrackId: null, queuedTrackIds: [] }
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("explicit");
  });

  it("returns allowed: true when a track passes everything", () => {
    setSetting(EXPLICIT_FILTER_ENABLED_KEY, "true");
    const result = runQueueGuardrails(
      { id: "combo-track-2", explicit: false, durationMs: 180_000 },
      { currentlyPlayingTrackId: "some-other-track", queuedTrackIds: ["yet-another-track"] }
    );
    expect(result).toEqual({ allowed: true });
  });
});
