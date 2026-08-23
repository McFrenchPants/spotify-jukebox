import { getValidAccessToken } from "./client";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/**
 * Shapes a non-2xx Spotify response into a thrown Error, reading its error
 * body when possible. Duplicated from ./queue.ts (not exported there) to
 * keep this task's diff scoped to new/playback files only.
 */
async function throwSpotifyError(response: Response, label: string): Promise<never> {
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
  throw new Error(`${label}: ${message}`);
}

/**
 * Issues a Spotify playback-control call (pause/resume/skip/volume) — all
 * four share the same shape: no request body, device_id (and, for volume,
 * volume_percent) as query params, 204 No Content on success.
 *
 * `fetchFn` and `getTokenFn` are injectable for testing, following the same
 * pattern as ./queue.ts.
 */
async function callPlaybackEndpoint(
  method: "PUT" | "POST",
  path: string,
  params: Record<string, string>,
  label: string,
  fetchFn: typeof fetch,
  getTokenFn: () => Promise<string>
): Promise<void> {
  const accessToken = await getTokenFn();

  const query = new URLSearchParams(params);
  const response = await fetchFn(`${SPOTIFY_API_BASE}${path}?${query.toString()}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    await throwSpotifyError(response, label);
  }
}

export async function pausePlayback(
  deviceId: string,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<void> {
  await callPlaybackEndpoint(
    "PUT",
    "/me/player/pause",
    { device_id: deviceId },
    "Spotify pause failed",
    fetchFn,
    getTokenFn
  );
}

export async function resumePlayback(
  deviceId: string,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<void> {
  await callPlaybackEndpoint(
    "PUT",
    "/me/player/play",
    { device_id: deviceId },
    "Spotify resume failed",
    fetchFn,
    getTokenFn
  );
}

export async function skipToNext(
  deviceId: string,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<void> {
  await callPlaybackEndpoint(
    "POST",
    "/me/player/next",
    { device_id: deviceId },
    "Spotify skip failed",
    fetchFn,
    getTokenFn
  );
}

export async function skipToPrevious(
  deviceId: string,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<void> {
  await callPlaybackEndpoint(
    "POST",
    "/me/player/previous",
    { device_id: deviceId },
    "Spotify previous-track failed",
    fetchFn,
    getTokenFn
  );
}

export async function setVolume(
  volumePercent: number,
  deviceId: string,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<void> {
  await callPlaybackEndpoint(
    "PUT",
    "/me/player/volume",
    { volume_percent: String(volumePercent), device_id: deviceId },
    "Spotify volume change failed",
    fetchFn,
    getTokenFn
  );
}
