import { getValidAccessToken } from "./client";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export interface QueueState {
  currentlyPlayingTrackId: string | null;
  queuedTrackIds: string[];
}

interface SpotifyQueueResponse {
  currently_playing?: { id: string } | null;
  queue?: Array<{ id: string }>;
}

/** Shapes a non-2xx Spotify response into a thrown Error, reading its error body when possible. */
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
 * Fetches the current Spotify playback queue state and shapes it down to
 * just the ids needed by the duplicate-prevention guardrail
 * (`checkDuplicate` in ../guardrails/queueGuardrails.ts).
 *
 * `fetchFn` and `getTokenFn` are injectable for testing, following the same
 * pattern as the functions in ./client.ts and ./device.ts.
 */
export async function getQueueState(
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<QueueState> {
  const accessToken = await getTokenFn();

  const response = await fetchFn(`${SPOTIFY_API_BASE}/me/player/queue`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    await throwSpotifyError(response, "Spotify queue state lookup failed");
  }

  const data = (await response.json()) as SpotifyQueueResponse;

  return {
    currentlyPlayingTrackId: data.currently_playing?.id ?? null,
    queuedTrackIds: (data.queue ?? []).map((t) => t.id),
  };
}

/**
 * Adds a track to the Spotify playback queue on the given device.
 *
 * Spotify's queue-add endpoint (POST /v1/me/player/queue) takes the track
 * URI and target device id as query parameters, not a JSON body — this is
 * Spotify API's actual contract, not a project convention.
 *
 * `fetchFn` and `getTokenFn` are injectable for testing.
 */
export async function addTrackToQueue(
  trackId: string,
  deviceId: string,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<void> {
  const accessToken = await getTokenFn();

  const params = new URLSearchParams({
    uri: `spotify:track:${trackId}`,
    device_id: deviceId,
  });

  const response = await fetchFn(`${SPOTIFY_API_BASE}/me/player/queue?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    await throwSpotifyError(response, "Spotify queue add failed");
  }
}
