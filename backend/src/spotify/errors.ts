/**
 * Thrown by refreshAccessToken() specifically when Spotify's token endpoint
 * reports `invalid_grant` — the stored refresh token itself is no longer
 * valid (the user revoked app access, the refresh token outlived Spotify's
 * lifetime for it, or similar). This is distinct from:
 *  - "no refresh token stored at all" (the one-time consent flow was never
 *    completed) — that's still a plain Error matching /No spotify_refresh_token/.
 *  - a generic/transient refresh failure (network error, unexpected Spotify
 *    error code, HTTP 5xx) — still a plain Error, worth retrying later.
 *
 * An invalid_grant refresh token will never start working again on its own;
 * an admin must redo the one-time consent flow via GET /api/auth/login.
 * Routes should surface that as a distinct, actionable error rather than
 * lumping it in with transient failures.
 */
export class SpotifyReauthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyReauthRequiredError";
  }
}

/**
 * Thrown by refreshAccessToken() when Spotify's *token* endpoint itself
 * (accounts.spotify.com, not the Web API) returns 429. Distinct from a
 * generic transient failure so callers can treat it the same way as the
 * automatic pollers' own rate-limit backoff (see rateLimitBackoff.ts) rather
 * than logging it as a surprising error every retry — this endpoint being
 * rate-limited is just as recoverable as the Web API being rate-limited, it
 * only needs the caller to actually back off instead of retrying immediately.
 */
export class SpotifyRateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyRateLimitedError";
  }
}

const NOT_CONNECTED_PATTERN = /No spotify_refresh_token/;

export interface SpotifyErrorResponse {
  status: number;
  body: { error: string; message: string };
}

/**
 * Classifies a caught error from a Spotify-touching call (search, device
 * lookup, queue, playback, ...) into the standard HTTP shape for the two
 * "Spotify auth is unusable" states every route needs to special-case:
 *  - not connected yet (no refresh token stored)
 *  - reauth required (stored refresh token was rejected as invalid_grant)
 *
 * Returns null when the error is neither of those — callers should fall
 * back to their own generic (usually 502) handling in that case.
 *
 * Centralizes what used to be a duplicated `/No spotify_refresh_token/`
 * regex check across search.ts, device.ts, artist.ts, playback.ts, and
 * queue.ts, and adds the new invalid_grant case in one place.
 */
export function classifySpotifyAuthError(err: unknown): SpotifyErrorResponse | null {
  if (err instanceof SpotifyReauthRequiredError) {
    return {
      status: 503,
      body: {
        error: "spotify_reauth_required",
        message:
          "Spotify's stored refresh token is no longer valid — an admin must redo the one-time consent flow at GET /api/auth/login.",
      },
    };
  }

  if (err instanceof SpotifyRateLimitedError) {
    return {
      status: 503,
      body: {
        error: "spotify_rate_limited",
        message: "Spotify is rate-limiting requests from this app right now — try again in a bit.",
      },
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  if (NOT_CONNECTED_PATTERN.test(message)) {
    return {
      status: 503,
      body: {
        error: "spotify_not_connected",
        message: "Spotify not connected yet — complete /api/auth/login first.",
      },
    };
  }

  return null;
}
