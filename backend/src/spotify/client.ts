import { getSetting } from "../db";
import { refreshAccessToken } from "./tokenRefresh";
import { withCache } from "./cache";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/** Refresh proactively if the token expires within this many ms. */
const EXPIRY_SAFETY_MARGIN_MS = 60 * 1000;

/**
 * How long search results stay cached (keyed by exact query+limit). Short
 * enough that a guest still sees fresh-feeling results, long enough to
 * absorb the common multi-guest case of several people searching the same
 * popular track within a few seconds of each other — see cache.ts's docs.
 */
const SEARCH_CACHE_TTL_MS = 30 * 1000;

/**
 * How long a single track/artist lookup stays cached. Track/artist metadata
 * (name, art, duration, explicit flag, genres, follower count) doesn't
 * meaningfully change minute to minute, so this can be far longer-lived than
 * search — the main value here is collapsing repeated lookups of the same
 * currently-playing or frequently-queued track/artist across guests.
 */
const ENTITY_CACHE_TTL_MS = 10 * 60 * 1000;

export interface ShapedTrack {
  id: string;
  name: string;
  artist: string;
  albumArt: string | null;
  durationMs: number;
  explicit: boolean;
}

interface SpotifySearchResponse {
  tracks?: {
    items?: Array<{
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      album: { images: Array<{ url: string }> };
      duration_ms: number;
      explicit: boolean;
    }>;
  };
}

interface SpotifyTrackResponse {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { images: Array<{ url: string }> };
  duration_ms: number;
  explicit: boolean;
}

export interface ShapedArtist {
  id: string;
  name: string;
  genres: string[];
  imageUrl: string | null;
  followers: number;
}

interface SpotifyArtistResponse {
  id: string;
  name: string;
  // Observed missing/undefined for some real artist IDs despite Spotify's
  // documented schema marking these required; typed optional to match
  // reality and force callers to guard rather than assume.
  genres?: string[];
  images?: Array<{ url: string; height: number | null; width: number | null }>;
  followers?: { total: number };
}

/**
 * Returns a valid Spotify access token, refreshing it first if it's missing
 * or about to expire. Always re-reads the token from app_settings after a
 * refresh rather than relying on any in-memory state.
 *
 * Throws (propagating refreshAccessToken's error) if there's no refresh
 * token stored yet — i.e. the one-time PKCE consent flow hasn't been
 * completed. Callers should let that propagate as a clear error to the
 * caller rather than crashing the process.
 */
export async function getValidAccessToken(
  refreshFn: () => Promise<void> = refreshAccessToken
): Promise<string> {
  const accessToken = getSetting("spotify_access_token");
  const expiresAt = Number(getSetting("spotify_token_expires_at") ?? 0);

  const needsRefresh = !accessToken || Date.now() >= expiresAt - EXPIRY_SAFETY_MARGIN_MS;

  if (needsRefresh) {
    await refreshFn();
  }

  const freshToken = getSetting("spotify_access_token");
  if (!freshToken) {
    throw new Error("Failed to obtain a Spotify access token after refresh.");
  }

  return freshToken;
}

/**
 * Spotify's documented max for /v1/search's `limit` is 50, but as of testing
 * against the live API in 2026 it now rejects anything above 10 with a
 * generic "400 Invalid limit" (no docs update found for this — discovered
 * empirically while testing real search after completing the one-time OAuth
 * consent). Clamped here rather than trusting the historical docs.
 */
const MAX_SEARCH_LIMIT = 10;

/**
 * Searches Spotify for tracks matching `query` and shapes the results into
 * a simplified array of { id, name, artist, albumArt, durationMs, explicit }.
 *
 * This is a raw, unfiltered proxy — explicit-content and blacklist filtering
 * are out of scope here (see P2.4). Does not drop any tracks.
 *
 * `fetchFn` and `getTokenFn` are injectable for testing.
 */
export async function searchTracks(
  query: string,
  limit = MAX_SEARCH_LIMIT,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<ShapedTrack[]> {
  const cappedLimit = Math.min(limit, MAX_SEARCH_LIMIT);

  return withCache(`search:${query}:${cappedLimit}`, SEARCH_CACHE_TTL_MS, async () => {
    const accessToken = await getTokenFn();

    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(cappedLimit),
    });

    const response = await fetchFn(`${SPOTIFY_API_BASE}/search?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      let message = `${response.status}`;
      try {
        const errBody = (await response.json()) as {
          error?: { message?: string };
        };
        if (errBody.error?.message) {
          message = `${response.status} ${errBody.error.message}`;
        }
      } catch {
        // Ignore JSON parse failures on the error body; fall back to status.
      }
      throw new Error(`Spotify search failed: ${message}`);
    }

    const data = (await response.json()) as SpotifySearchResponse;
    const items = data.tracks?.items ?? [];

    return items.map((track) => ({
      id: track.id,
      name: track.name,
      artist: track.artists.map((a) => a.name).join(", "),
      // Spotify returns album images sorted largest-first; use the first one.
      albumArt: track.album.images[0]?.url ?? null,
      durationMs: track.duration_ms,
      explicit: track.explicit,
    }));
  });
}

/**
 * Fetches a single track by id from Spotify and shapes it identically to
 * how `searchTracks` shapes each item.
 *
 * Used by the queue route (P2.5) to re-fetch authoritative track metadata
 * server-side rather than trusting anything a client might also send in the
 * request body — that metadata feeds the content guardrails, so trusting a
 * client-supplied value would let a guest bypass them.
 *
 * `fetchFn` and `getTokenFn` are injectable for testing, following the same
 * pattern as `searchTracks`.
 */
export async function getTrack(
  trackId: string,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<ShapedTrack> {
  return withCache(`track:${trackId}`, ENTITY_CACHE_TTL_MS, async () => {
    const accessToken = await getTokenFn();

    const response = await fetchFn(`${SPOTIFY_API_BASE}/tracks/${encodeURIComponent(trackId)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      let message = `${response.status}`;
      try {
        const errBody = (await response.json()) as {
          error?: { message?: string };
        };
        if (errBody.error?.message) {
          message = `${response.status} ${errBody.error.message}`;
        }
      } catch {
        // Ignore JSON parse failures on the error body; fall back to status.
      }
      throw new Error(`Spotify track lookup failed: ${message}`);
    }

    const track = (await response.json()) as SpotifyTrackResponse;

    return {
      id: track.id,
      name: track.name,
      artist: track.artists.map((a) => a.name).join(", "),
      albumArt: track.album.images[0]?.url ?? null,
      durationMs: track.duration_ms,
      explicit: track.explicit,
    };
  });
}

/**
 * Fetches a single artist by id from Spotify and shapes it into
 * { id, name, genres, imageUrl, followers }.
 *
 * Used by the public artist-info endpoint (P4.8) to power an "About the
 * artist" panel on the Now Playing screen.
 *
 * `fetchFn` and `getTokenFn` are injectable for testing, following the same
 * pattern as `searchTracks`/`getTrack`.
 */
export async function getArtist(
  artistId: string,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<ShapedArtist> {
  return withCache(`artist:${artistId}`, ENTITY_CACHE_TTL_MS, async () => {
    const accessToken = await getTokenFn();

    const response = await fetchFn(`${SPOTIFY_API_BASE}/artists/${encodeURIComponent(artistId)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      let message = `${response.status}`;
      try {
        const errBody = (await response.json()) as {
          error?: { message?: string };
        };
        if (errBody.error?.message) {
          message = `${response.status} ${errBody.error.message}`;
        }
      } catch {
        // Ignore JSON parse failures on the error body; fall back to status.
      }
      throw new Error(`Spotify artist lookup failed: ${message}`);
    }

    const artist = (await response.json()) as SpotifyArtistResponse;

    return {
      id: artist.id,
      name: artist.name,
      genres: artist.genres ?? [],
      // Spotify returns artist images sorted largest-first; use the first one.
      // Spotify's response shape for a given artist ID isn't fully reliable —
      // `genres`, `images`, and `followers` have been observed missing/undefined
      // for some artist IDs, so all three are guarded rather than trusted as
      // always-present.
      imageUrl: artist.images?.[0]?.url ?? null,
      followers: artist.followers?.total ?? 0,
    };
  });
}
