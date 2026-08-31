const LRCLIB_BASE = "https://lrclib.net/api";

export interface FetchLyricsParams {
  trackName: string;
  artistName: string;
  albumName?: string;
  durationMs?: number;
}

export interface LrclibLyricsResult {
  syncedLyrics: string | null;
  plainLyrics: string | null;
}

interface LrclibGetResponse {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

function toResult(data: LrclibGetResponse): LrclibLyricsResult {
  return {
    syncedLyrics: data.syncedLyrics ?? null,
    plainLyrics: data.plainLyrics ?? null,
  };
}

/**
 * Looks up lyrics for a track from LRCLIB (https://lrclib.net), a free,
 * unauthenticated lyrics API — no API key/auth header needed or wanted.
 *
 * Tries the exact-match `/api/get` endpoint first, and falls back to the
 * fuzzier `/api/search` endpoint (taking its first result, if any) when
 * `/api/get` 404s. Returns null for a genuine "no lyrics found anywhere"
 * result — that's an expected outcome, not an error. Throws a real Error for
 * actual request failures (network errors, timeouts, non-404 non-2xx
 * responses) so callers can tell "nothing found" apart from "the lookup
 * itself failed."
 *
 * `fetchFn` is injectable for testing, matching the convention used by
 * spotify/nowPlaying.ts's `fetchFn` parameter.
 */
export async function fetchLyricsFromLrclib(
  params: FetchLyricsParams,
  fetchFn: typeof fetch = fetch
): Promise<LrclibLyricsResult | null> {
  const getParams = new URLSearchParams({
    track_name: params.trackName,
    artist_name: params.artistName,
  });
  if (params.albumName !== undefined) {
    getParams.set("album_name", params.albumName);
  }
  if (params.durationMs !== undefined) {
    getParams.set("duration", String(Math.round(params.durationMs / 1000)));
  }

  const getResponse = await fetchFn(`${LRCLIB_BASE}/get?${getParams.toString()}`);

  if (getResponse.status === 404) {
    const searchParams = new URLSearchParams({
      track_name: params.trackName,
      artist_name: params.artistName,
    });

    const searchResponse = await fetchFn(`${LRCLIB_BASE}/search?${searchParams.toString()}`);

    if (!searchResponse.ok) {
      throw new Error(`LRCLIB search request failed: ${searchResponse.status}`);
    }

    const results = (await searchResponse.json()) as LrclibGetResponse[];
    if (results.length === 0) {
      return null;
    }

    return toResult(results[0]);
  }

  if (!getResponse.ok) {
    throw new Error(`LRCLIB get request failed: ${getResponse.status}`);
  }

  const data = (await getResponse.json()) as LrclibGetResponse;
  return toResult(data);
}
