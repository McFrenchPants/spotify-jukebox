import { getSetting, setSetting } from "../db";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

/** Default refresh interval: 50 minutes (tokens expire at 60 min). */
export const DEFAULT_REFRESH_INTERVAL_MS = 50 * 60 * 1000;

interface SpotifyTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/**
 * Reads the persisted refresh token from app_settings and exchanges it for a
 * fresh access token via Spotify's token endpoint, persisting the result.
 *
 * Always reads spotify_refresh_token fresh from the DB (never relies on
 * in-memory state), so this is safe to call right after a process restart.
 *
 * Throws on failure (missing refresh token, missing client credentials, HTTP
 * error, or network error) — callers that run this on an interval should
 * catch/log rather than let a rejection propagate.
 */
export async function refreshAccessToken(): Promise<void> {
  const refreshToken = getSetting("spotify_refresh_token");
  if (!refreshToken) {
    throw new Error(
      "No spotify_refresh_token stored yet — skip refresh until the one-time Spotify consent flow has been completed."
    );
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in the environment to refresh the access token."
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });

  const tokenData = (await response.json()) as SpotifyTokenResponse;

  if (!response.ok || !tokenData.access_token) {
    throw new Error(
      `Spotify token refresh failed: ${tokenData.error ?? response.status} ${
        tokenData.error_description ?? ""
      }`.trim()
    );
  }

  const expiresAt = Date.now() + (tokenData.expires_in ?? 3600) * 1000;

  setSetting("spotify_access_token", tokenData.access_token);
  setSetting("spotify_token_expires_at", String(expiresAt));

  // Spotify may rotate the refresh token; only overwrite the stored one if a
  // new one was actually returned.
  if (tokenData.refresh_token) {
    setSetting("spotify_refresh_token", tokenData.refresh_token);
  }
}

/**
 * Starts a background interval that refreshes the Spotify access token every
 * `intervalMs` (default 50 minutes). Errors from individual refresh attempts
 * are caught and logged so a single failure (e.g. no token stored yet,
 * transient network error) doesn't crash the process or stop future
 * attempts.
 */
export function startTokenRefreshWorker(
  intervalMs: number = DEFAULT_REFRESH_INTERVAL_MS,
  refreshFn: () => Promise<void> = refreshAccessToken
): NodeJS.Timeout {
  const timer = setInterval(() => {
    refreshFn().catch((err) => {
      console.error(
        "[tokenRefresh] Spotify access token refresh failed:",
        err instanceof Error ? err.message : err
      );
    });
  }, intervalMs);

  // Don't let this interval keep the process alive on its own.
  timer.unref?.();

  return timer;
}

/** Stops a worker previously started with startTokenRefreshWorker. */
export function stopTokenRefreshWorker(timer: NodeJS.Timeout): void {
  clearInterval(timer);
}
