import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../spotify/client", async () => {
  const actual = await vi.importActual<typeof import("../spotify/client")>("../spotify/client");
  return { ...actual, getValidAccessToken: vi.fn() };
});

vi.mock("../spotify/tokenRefresh", async () => {
  const actual = await vi.importActual<typeof import("../spotify/tokenRefresh")>("../spotify/tokenRefresh");
  return { ...actual, validateAndStoreRefreshToken: vi.fn() };
});

vi.mock("../spotify/nowPlaying", () => ({
  triggerImmediateNowPlayingPoll: vi.fn(),
}));

import { runMigrations } from "../db";
import { issueAdminToken } from "../auth/adminToken";
import { ADMIN_TOKEN_HEADER } from "../middleware/adminAuth";
import { getValidAccessToken } from "../spotify/client";
import { validateAndStoreRefreshToken } from "../spotify/tokenRefresh";
import { triggerImmediateNowPlayingPoll } from "../spotify/nowPlaying";
import { SpotifyReauthRequiredError, SpotifyRateLimitedError } from "../spotify/errors";
import { createApp } from "../app";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  runMigrations();

  vi.clearAllMocks();
  vi.mocked(triggerImmediateNowPlayingPoll).mockResolvedValue(undefined);

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("GET /api/spotify-connection/status", () => {
  it("returns connected: true when a valid access token can be obtained", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue("a-fresh-access-token");

    const res = await fetch(`${baseUrl}/api/spotify-connection/status`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ connected: true });
  });

  it("returns connected: false, reason: not_connected when no refresh token is stored", async () => {
    vi.mocked(getValidAccessToken).mockRejectedValue(
      new Error("No spotify_refresh_token stored yet — skip refresh until the one-time Spotify consent flow has been completed.")
    );

    const res = await fetch(`${baseUrl}/api/spotify-connection/status`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ connected: false, reason: "not_connected" });
  });

  it("returns connected: false, reason: reauth_required when the stored refresh token is dead", async () => {
    vi.mocked(getValidAccessToken).mockRejectedValue(new SpotifyReauthRequiredError("invalid_grant"));

    const res = await fetch(`${baseUrl}/api/spotify-connection/status`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ connected: false, reason: "reauth_required" });
  });

  it("returns connected: false, reason: rate_limited when Spotify's token endpoint is rate-limited", async () => {
    vi.mocked(getValidAccessToken).mockRejectedValue(new SpotifyRateLimitedError("429"));

    const res = await fetch(`${baseUrl}/api/spotify-connection/status`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ connected: false, reason: "rate_limited" });
  });
});

describe("POST /api/spotify-connection/connect", () => {
  function adminHeaders() {
    const { token } = issueAdminToken();
    return { "Content-Type": "application/json", [ADMIN_TOKEN_HEADER]: token };
  }

  it("returns 401 without a valid admin token", async () => {
    const res = await fetch(`${baseUrl}/api/spotify-connection/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "some-token" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 when refreshToken is missing or empty", async () => {
    const res = await fetch(`${baseUrl}/api/spotify-connection/connect`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ refreshToken: "" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_refresh_token");
  });

  it("validates and stores the token, then triggers an immediate poll, on success", async () => {
    vi.mocked(validateAndStoreRefreshToken).mockResolvedValue(undefined);

    const res = await fetch(`${baseUrl}/api/spotify-connection/connect`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ refreshToken: "a-real-looking-token" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ connected: true });
    expect(validateAndStoreRefreshToken).toHaveBeenCalledWith("a-real-looking-token");
    expect(triggerImmediateNowPlayingPoll).toHaveBeenCalledTimes(1);
  });

  it("returns 400 with Spotify's rejection reason when the token is invalid, and does not trigger a poll", async () => {
    vi.mocked(validateAndStoreRefreshToken).mockRejectedValue(
      new Error("Spotify rejected this refresh token: invalid_grant")
    );

    const res = await fetch(`${baseUrl}/api/spotify-connection/connect`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ refreshToken: "a-bad-token" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("spotify_connect_failed");
    expect(body.message).toMatch(/invalid_grant/);
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
  });

  it("trims whitespace before validating", async () => {
    vi.mocked(validateAndStoreRefreshToken).mockResolvedValue(undefined);

    await fetch(`${baseUrl}/api/spotify-connection/connect`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ refreshToken: "  a-token-with-space  " }),
    });

    expect(validateAndStoreRefreshToken).toHaveBeenCalledWith("a-token-with-space");
  });
});
