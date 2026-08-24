import fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadHomeAssistantOptions } from "./homeAssistantOptions";

const OPTION_KEYS = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "SPOTIFY_REDIRECT_URI",
  "ADMIN_PIN",
  "PORT",
  "DB_PATH",
] as const;

const ORIGINAL_ENV: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of OPTION_KEYS) {
    ORIGINAL_ENV[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of OPTION_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
  vi.restoreAllMocks();
});

describe("loadHomeAssistantOptions", () => {
  it("no-ops when /data/options.json does not exist", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const readSpy = vi.spyOn(fs, "readFileSync");

    loadHomeAssistantOptions();

    expect(readSpy).not.toHaveBeenCalled();
    for (const key of OPTION_KEYS) {
      expect(process.env[key]).toBeUndefined();
    }
  });

  it("sets all four options into process.env plus pinned PORT/DB_PATH when the file is present", () => {
    const options = {
      SPOTIFY_CLIENT_ID: "client-id-123",
      SPOTIFY_CLIENT_SECRET: "client-secret-456",
      SPOTIFY_REDIRECT_URI: "http://127.0.0.1:8085/api/auth/callback",
      ADMIN_PIN: "9999",
    };
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(options));

    loadHomeAssistantOptions();

    expect(process.env.SPOTIFY_CLIENT_ID).toBe("client-id-123");
    expect(process.env.SPOTIFY_CLIENT_SECRET).toBe("client-secret-456");
    expect(process.env.SPOTIFY_REDIRECT_URI).toBe(
      "http://127.0.0.1:8085/api/auth/callback"
    );
    expect(process.env.ADMIN_PIN).toBe("9999");
    expect(process.env.PORT).toBe("8085");
    expect(process.env.DB_PATH).toBe("/data/jukebox.db");
  });

  it("does not throw and no-ops (aside from the pinned PORT/DB_PATH) on malformed JSON, and logs a warning", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("{ not valid json");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => loadHomeAssistantOptions()).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    expect(process.env.SPOTIFY_CLIENT_ID).toBeUndefined();
    expect(process.env.SPOTIFY_CLIENT_SECRET).toBeUndefined();
    expect(process.env.SPOTIFY_REDIRECT_URI).toBeUndefined();
    expect(process.env.ADMIN_PIN).toBeUndefined();
  });

  it("does not overwrite an already-set process.env value", () => {
    process.env.ADMIN_PIN = "already-set-pin";
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({ ADMIN_PIN: "from-options-json" })
    );

    loadHomeAssistantOptions();

    expect(process.env.ADMIN_PIN).toBe("already-set-pin");
  });
});
