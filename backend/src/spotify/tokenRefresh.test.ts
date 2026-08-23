import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, string>();

vi.mock("../db", () => ({
  getSetting: vi.fn((key: string) => settings.get(key)),
  setSetting: vi.fn((key: string, value: string) => {
    settings.set(key, value);
  }),
}));

import { getSetting, setSetting } from "../db";
import {
  DEFAULT_REFRESH_INTERVAL_MS,
  refreshAccessToken,
  startTokenRefreshWorker,
  stopTokenRefreshWorker,
} from "./tokenRefresh";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("refreshAccessToken", () => {
  beforeEach(() => {
    settings.clear();
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    vi.restoreAllMocks();
  });

  it("calls Spotify's token endpoint with the stored refresh token and persists the result", async () => {
    settings.set("spotify_refresh_token", "stored-refresh-token");

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        access_token: "new-access-token",
        expires_in: 3600,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await refreshAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://accounts.spotify.com/api/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("test-client-id:test-client-secret").toString("base64")}`
    );
    expect(init.body).toBe(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "stored-refresh-token",
      }).toString()
    );

    expect(setSetting).toHaveBeenCalledWith("spotify_access_token", "new-access-token");
    expect(getSetting("spotify_access_token")).toBe("new-access-token");
    // Refresh token wasn't rotated, so it should remain unchanged.
    expect(getSetting("spotify_refresh_token")).toBe("stored-refresh-token");

    const expiresAt = Number(getSetting("spotify_token_expires_at"));
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it("persists a rotated refresh token when Spotify returns one", async () => {
    settings.set("spotify_refresh_token", "old-refresh-token");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          access_token: "new-access-token",
          refresh_token: "rotated-refresh-token",
          expires_in: 3600,
        })
      )
    );

    await refreshAccessToken();

    expect(getSetting("spotify_refresh_token")).toBe("rotated-refresh-token");
  });

  it("throws without an unhandled rejection when no refresh token is stored yet", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshAccessToken()).rejects.toThrow(/No spotify_refresh_token/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on an HTTP error from Spotify", async () => {
    settings.set("spotify_refresh_token", "stored-refresh-token");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: "invalid_grant", error_description: "Refresh token revoked" },
          false,
          400
        )
      )
    );

    await expect(refreshAccessToken()).rejects.toThrow(/Spotify token refresh failed/);
    expect(getSetting("spotify_access_token")).toBeUndefined();
  });
});

describe("startTokenRefreshWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the refresh function on the configured interval and survives rejections", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);

    const timer = startTokenRefreshWorker(1000, spy);

    expect(spy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(spy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(spy).toHaveBeenCalledTimes(3);

    stopTokenRefreshWorker(timer);
    await vi.advanceTimersByTimeAsync(5000);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("defaults to a 50 minute interval", () => {
    expect(DEFAULT_REFRESH_INTERVAL_MS).toBe(50 * 60 * 1000);
  });
});
