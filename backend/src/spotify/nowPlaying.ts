import { emitEvent } from "../events/bus";
import { getValidAccessToken } from "./client";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/** Default poll interval: 4 seconds (within the 3-5s target range). */
export const DEFAULT_POLL_INTERVAL_MS = 4000;

export interface NowPlayingState {
  isPlaying: boolean;
  trackId: string | null;
  name?: string;
  artist?: string;
  albumArt?: string | null;
  durationMs?: number;
  progressMs?: number;
}

interface SpotifyCurrentlyPlayingResponse {
  is_playing?: boolean;
  progress_ms?: number | null;
  item?: {
    id: string;
    name: string;
    artists: Array<{ name: string }>;
    album: { images: Array<{ url: string }> };
    duration_ms: number;
  } | null;
}

const NOTHING_PLAYING_STATE: NowPlayingState = {
  isPlaying: false,
  trackId: null,
};

/** Last-seen state, module-level so repeated polls can diff against it. */
let lastState: NowPlayingState = NOTHING_PLAYING_STATE;

/** Resets the last-seen state — primarily useful for tests. */
export function resetNowPlayingState(): void {
  lastState = NOTHING_PLAYING_STATE;
}

function shapeResponse(data: SpotifyCurrentlyPlayingResponse | null): NowPlayingState {
  if (!data || !data.item) {
    return NOTHING_PLAYING_STATE;
  }

  return {
    isPlaying: Boolean(data.is_playing),
    trackId: data.item.id,
    name: data.item.name,
    artist: data.item.artists.map((a) => a.name).join(", "),
    albumArt: data.item.album.images[0]?.url ?? null,
    durationMs: data.item.duration_ms,
    progressMs: data.progress_ms ?? 0,
  };
}

/**
 * Considers the state "changed" when the playing track id changes or the
 * play/pause state flips. Progress alone (i.e. normal playback ticking
 * forward) does not count as a change — that would make this far too
 * chatty for a 3-5s poll.
 */
function hasChanged(prev: NowPlayingState, next: NowPlayingState): boolean {
  return prev.trackId !== next.trackId || prev.isPlaying !== next.isPlaying;
}

/**
 * Polls Spotify's currently-playing endpoint once, diffs against the
 * last-seen state, and emits a `now-playing` event via the event bus if it
 * changed.
 *
 * Handles:
 * - 204 No Content (nothing playing) without erroring.
 * - No refresh token stored yet (Spotify not connected) by skipping
 *   silently, matching the token refresh worker's graceful-skip philosophy.
 *
 * `fetchFn` and `getTokenFn` are injectable for testing.
 */
export async function pollNowPlaying(
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<void> {
  let accessToken: string;
  try {
    accessToken = await getTokenFn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/No spotify_refresh_token/.test(message)) {
      // Spotify hasn't been connected yet — skip silently, don't spam logs.
      return;
    }
    throw err;
  }

  const response = await fetchFn(`${SPOTIFY_API_BASE}/me/player/currently-playing`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let nextState: NowPlayingState;

  if (response.status === 204) {
    nextState = NOTHING_PLAYING_STATE;
  } else if (!response.ok) {
    throw new Error(`Spotify currently-playing request failed: ${response.status}`);
  } else {
    const data = (await response.json()) as SpotifyCurrentlyPlayingResponse;
    nextState = shapeResponse(data);
  }

  if (hasChanged(lastState, nextState)) {
    lastState = nextState;
    emitEvent("now-playing", nextState);
  } else {
    lastState = nextState;
  }
}

/**
 * Starts a background interval that polls Spotify's currently-playing
 * endpoint every `intervalMs` (default 4s) and emits a `now-playing` event
 * on the event bus when the track or play/pause state changes.
 *
 * Errors from individual polls are caught and logged so a single failure
 * doesn't crash the process or stop future polls.
 */
export function startNowPlayingPoller(
  intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): NodeJS.Timeout {
  const timer = setInterval(() => {
    pollNowPlaying(fetchFn, getTokenFn).catch((err) => {
      console.error(
        "[nowPlaying] Spotify currently-playing poll failed:",
        err instanceof Error ? err.message : err
      );
    });
  }, intervalMs);

  // Don't let this interval keep the process alive on its own.
  timer.unref?.();

  return timer;
}

/** Stops a poller previously started with startNowPlayingPoller. */
export function stopNowPlayingPoller(timer: NodeJS.Timeout): void {
  clearInterval(timer);
}
