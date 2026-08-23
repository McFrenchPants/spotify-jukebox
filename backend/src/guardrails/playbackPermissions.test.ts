import { beforeEach, describe, expect, it } from "vitest";
import { db, runMigrations, setSetting } from "../db";
import {
  ACTIVE_MODE_KEY,
  ALLOW_PAUSE_RESUME_KEY,
  ALLOW_SKIP_KEY,
  ALLOW_VOLUME_KEY,
} from "../db/appSettings";
import { resolveEffectivePermission } from "./playbackPermissions";

beforeEach(() => {
  runMigrations();
  // The backing DB is a real shared file with no per-test reset, so
  // explicitly clear every setting used here to a known ("unset") state.
  db.prepare(
    `DELETE FROM app_settings WHERE key IN (?, ?, ?, ?)`
  ).run(ACTIVE_MODE_KEY, ALLOW_PAUSE_RESUME_KEY, ALLOW_SKIP_KEY, ALLOW_VOLUME_KEY);
});

describe("resolveEffectivePermission", () => {
  it("defaults to restricted (false) when nothing is set", () => {
    expect(resolveEffectivePermission("pause_resume")).toBe(false);
    expect(resolveEffectivePermission("skip")).toBe(false);
    expect(resolveEffectivePermission("volume")).toBe(false);
  });

  it("an explicit 'true' override wins even in restricted mode", () => {
    setSetting(ACTIVE_MODE_KEY, "restricted");
    setSetting(ALLOW_SKIP_KEY, "true");
    expect(resolveEffectivePermission("skip")).toBe(true);
    // Untouched capabilities still inherit restricted -> false.
    expect(resolveEffectivePermission("pause_resume")).toBe(false);
  });

  it("an explicit 'false' override wins even in trusted mode", () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    setSetting(ALLOW_VOLUME_KEY, "false");
    expect(resolveEffectivePermission("volume")).toBe(false);
    // Untouched capabilities still inherit trusted -> true.
    expect(resolveEffectivePermission("pause_resume")).toBe(true);
  });

  it("trusted mode with no override resolves to true", () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    expect(resolveEffectivePermission("pause_resume")).toBe(true);
    expect(resolveEffectivePermission("skip")).toBe(true);
    expect(resolveEffectivePermission("volume")).toBe(true);
  });
});
