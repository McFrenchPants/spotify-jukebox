import { listQueueEntries } from "../db/queueEntries";
import { getValidAccessToken } from "./client";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

interface SpotifyCurrentlyPlayingResponse {
  progress_ms?: number | null;
  item?: { id: string } | null;
}

/**
 * Shapes a non-2xx Spotify response into a thrown Error, reading its error
 * body when possible. Duplicated from ./queue.ts / ./playback.ts (not
 * exported there) to keep this module self-contained.
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
 * Resyncs Spotify's live device queue to match the local `queue_entries`
 * mirror. Spotify's Web API has no "remove one track" or "clear queue"
 * endpoint, so any moderation action is performed by mutating the local
 * mirror first, then calling this function to replace Spotify's live queue
 * wholesale via PUT /me/player/play with an explicit `uris` list: the
 * currently-playing track (its live progress re-fetched fresh, so playback
 * position is preserved) followed by the remaining local queue entries in
 * order.
 *
 * If there is neither a currently-playing track nor any local queue
 * entries, there is nothing meaningful to resync (an empty `uris` array
 * would be an invalid/meaningless call to Spotify), so this returns early
 * without making the PUT call.
 *
 * `fetchFn` and `getTokenFn` are injectable for testing, following the same
 * pattern as ./queue.ts / ./playback.ts.
 */
export async function resyncSpotifyQueue(
  deviceId: string,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<void> {
  const accessToken = await getTokenFn();

  const currentResponse = await fetchFn(`${SPOTIFY_API_BASE}/me/player/currently-playing`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let currentTrackId: string | null = null;
  let progressMs = 0;

  if (currentResponse.status === 204) {
    // Nothing currently playing.
  } else if (!currentResponse.ok) {
    await throwSpotifyError(currentResponse, "Spotify currently-playing lookup failed");
  } else {
    const data = (await currentResponse.json()) as SpotifyCurrentlyPlayingResponse;
    if (data.item) {
      currentTrackId = data.item.id;
      progressMs = data.progress_ms ?? 0;
    }
  }

  const queueEntries = listQueueEntries();

  if (!currentTrackId && queueEntries.length === 0) {
    // Nothing to resync.
    return;
  }

  const uris: string[] = [];
  if (currentTrackId) {
    uris.push(`spotify:track:${currentTrackId}`);
  }
  for (const entry of queueEntries) {
    uris.push(`spotify:track:${entry.spotifyTrackId}`);
  }

  const params = new URLSearchParams({ device_id: deviceId });
  const playResponse = await fetchFn(`${SPOTIFY_API_BASE}/me/player/play?${params.toString()}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris, position_ms: progressMs }),
  });

  if (!playResponse.ok) {
    await throwSpotifyError(playResponse, "Spotify queue resync failed");
  }
}
