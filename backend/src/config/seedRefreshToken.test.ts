import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, getSetting, runMigrations } from "../db";
import { seedRefreshTokenFromEnv } from "./seedRefreshToken";

const ORIGINAL_ENV = process.env.SPOTIFY_REFRESH_TOKEN;

beforeEach(() => {
  runMigrations();
  db.prepare("DELETE FROM app_settings WHERE key = 'spotify_refresh_token'").run();
  delete process.env.SPOTIFY_REFRESH_TOKEN;
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.SPOTIFY_REFRESH_TOKEN;
  } else {
    process.env.SPOTIFY_REFRESH_TOKEN = ORIGINAL_ENV;
  }
});

describe("seedRefreshTokenFromEnv", () => {
  it("no-ops when SPOTIFY_REFRESH_TOKEN is not set", () => {
    seedRefreshTokenFromEnv();
    expect(getSetting("spotify_refresh_token")).toBeUndefined();
  });

  it("seeds spotify_refresh_token from the env var when none is stored yet", () => {
    process.env.SPOTIFY_REFRESH_TOKEN = "seeded-token-value";
    seedRefreshTokenFromEnv();
    expect(getSetting("spotify_refresh_token")).toBe("seeded-token-value");
  });

  it("does not overwrite an already-stored refresh token", () => {
    db.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('spotify_refresh_token', 'already-there')"
    ).run();
    process.env.SPOTIFY_REFRESH_TOKEN = "should-not-be-used";

    seedRefreshTokenFromEnv();

    expect(getSetting("spotify_refresh_token")).toBe("already-there");
  });
});
