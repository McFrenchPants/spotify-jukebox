import { Router } from "express";
import { getValidAccessToken } from "../spotify/client";
import { SpotifyReauthRequiredError, SpotifyRateLimitedError } from "../spotify/errors";
import { requireAdminAuth } from "../middleware/adminAuth";
import { validateAndStoreRefreshToken } from "../spotify/tokenRefresh";
import { triggerImmediateNowPlayingPoll } from "../spotify/nowPlaying";

export const spotifyConnectionRouter = Router();

/**
 * Public, unauthenticated — same trust tier as GET /api/device/GET
 * /api/now-playing (no guest-sensitive data, just a status flag). Lets the
 * Settings page show "Spotify isn't connected yet" or "reconnection needed"
 * automatically on load, instead of a guest/admin only discovering this from
 * a blank Now Playing card with no explanation (see BACKLOG.md's Spotify
 * auth UX item).
 *
 * Reuses getValidAccessToken()'s own cached-access-token check — this only
 * actually calls Spotify's token endpoint when the cached access token is
 * missing or near-expiry, which in steady state (the background refresh
 * worker already runs every 50 minutes) is rare, so this doesn't add
 * meaningful new Spotify API load just by being polled on every Settings
 * page load.
 */
spotifyConnectionRouter.get("/status", async (_req, res) => {
  try {
    await getValidAccessToken();
    res.status(200).json({ connected: true });
  } catch (err) {
    if (err instanceof SpotifyReauthRequiredError) {
      res.status(200).json({ connected: false, reason: "reauth_required" });
      return;
    }
    if (err instanceof SpotifyRateLimitedError) {
      // Can't confirm either way right now — distinct from both "never
      // connected" and "needs reauth" so the Settings page doesn't show a
      // misleading "connect Spotify" prompt for what's actually just a
      // transient rate limit.
      res.status(200).json({ connected: false, reason: "rate_limited" });
      return;
    }
    // Covers "No spotify_refresh_token stored yet" (never connected) and any
    // other unexpected failure — both read the same to the Settings page:
    // show the "connect Spotify" prompt.
    res.status(200).json({ connected: false, reason: "not_connected" });
  }
});

/**
 * Admin-only. Accepts a refresh token pasted in from the browser-based PKCE
 * auth page (docs/oauth-callback/index.html) and applies it live — no HA
 * Supervisor restart needed, unlike the SPOTIFY_REFRESH_TOKEN config-option
 * path. validateAndStoreRefreshToken() only persists on a confirmed-working
 * Spotify exchange, so a bad paste can't clobber a previously-working token.
 */
spotifyConnectionRouter.post("/connect", requireAdminAuth, async (req, res) => {
  const { refreshToken } = req.body ?? {};

  if (typeof refreshToken !== "string" || refreshToken.trim() === "") {
    res.status(400).json({
      error: "invalid_refresh_token",
      message: "refreshToken is required and must be a non-empty string.",
    });
    return;
  }

  try {
    await validateAndStoreRefreshToken(refreshToken.trim());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: "spotify_connect_failed", message });
    return;
  }

  // Fire-and-forget, mirrors playback.ts's own defensive pattern (NP1.2) —
  // refreshes the Now Playing card immediately instead of waiting for the
  // next scheduled poll, now that a working connection actually exists.
  void triggerImmediateNowPlayingPoll().catch(() => {
    // Defensive only — not expected to reject; a real failure here (e.g. no
    // device resolved yet) will simply be caught on the next scheduled poll.
  });

  res.status(200).json({ connected: true });
});
