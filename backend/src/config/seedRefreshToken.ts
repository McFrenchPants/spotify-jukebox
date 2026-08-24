import { getSetting, setSetting } from "../db";

/**
 * Optional convenience for any deployment mode (Home Assistant add-on,
 * standalone Docker, or local dev): if a SPOTIFY_REFRESH_TOKEN env var is
 * provided and no refresh token is stored yet, seed it directly rather than
 * requiring the one-time browser-based PKCE consent flow to be repeated.
 *
 * Intended use case: you already completed the one-time consent once
 * elsewhere (e.g. local dev) and want a new deployment to reuse that same
 * Spotify authorization without another browser round-trip — this matters
 * most for the Home Assistant add-on, where completing the consent flow
 * otherwise requires an SSH tunnel back to the host (Spotify only accepts
 * the literal 127.0.0.1 loopback for plain-HTTP redirects).
 *
 * Never overwrites an existing stored refresh token — this is a first-boot
 * convenience, not a way to force-rotate credentials. Must run after
 * runMigrations() (needs app_settings to exist) and after
 * loadHomeAssistantOptions() (which may have populated
 * process.env.SPOTIFY_REFRESH_TOKEN from /data/options.json).
 */
export function seedRefreshTokenFromEnv(): void {
  const provided = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!provided) {
    return;
  }

  if (getSetting("spotify_refresh_token")) {
    return;
  }

  setSetting("spotify_refresh_token", provided);
  console.log(
    "[seedRefreshToken] Seeded spotify_refresh_token from the SPOTIFY_REFRESH_TOKEN environment variable — skipping the one-time browser consent flow."
  );
}
