import { dequeueBySpotifyTrackId } from "../db/queueEntries";
import { emitEvent } from "../events/bus";
import { getValidAccessToken } from "./client";
import { listDevices } from "./device";
import { getSetting } from "../db";
import { SpotifyReauthRequiredError } from "./errors";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/** Default poll interval: 4 seconds (within the 3-5s target range). */
export const DEFAULT_POLL_INTERVAL_MS = 4000;

export interface NowPlayingState {
  isPlaying: boolean;
  trackId: string | null;
  name?: string;
  artist?: string;
  artistId?: string;
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
    artists: Array<{ id: string; name: string }>;
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

export interface DeviceStatus {
  online: boolean;
  deviceId?: string;
  deviceName?: string;
}

/**
 * Piggybacks on this poller's existing 4s loop to also watch for the
 * resolved bridge device disappearing from (or reappearing in) Spotify's
 * live device list, rather than adding a second independent setInterval.
 *
 * Checking device presence needs its own Spotify API call (GET
 * /v1/me/player/devices — currently-playing doesn't reveal which devices
 * exist, only what's currently active), so to avoid tripling the poller's
 * Spotify API traffic just for connectivity monitoring, this only runs
 * every DEVICE_CHECK_EVERY_N_TICKS ticks (every ~12s at the default 4s
 * interval) rather than on every single tick.
 */
const DEVICE_CHECK_EVERY_N_TICKS = 3;

/** Tick counter for throttling the device-presence check; module-level like lastState. */
let pollTickCount = 0;

/** Last-seen bridge-device online/offline state. null = not checked yet (no baseline). */
let lastDeviceOnline: boolean | null = null;

/** Resets the last-seen state — primarily useful for tests. */
export function resetNowPlayingState(): void {
  lastState = NOTHING_PLAYING_STATE;
  pollTickCount = 0;
  lastDeviceOnline = null;
}

/** Returns the last-seen now-playing state (same data the SSE now-playing event carries). */
export function getNowPlayingState(): NowPlayingState {
  return lastState;
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
    artistId: data.item.artists[0]?.id,
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
 * Checks whether the resolved bridge device (app_settings.spotify_device_id)
 * is still present in Spotify's live device list, and emits a `device-status`
 * event via the event bus only when that online/offline status actually
 * changes since the last check — mirrors pollNowPlaying's own
 * only-emit-on-change behavior so this doesn't spam the SSE stream every
 * check.
 *
 * `accessToken` is passed in (already obtained by the caller) rather than
 * re-resolved here, so this never triggers its own token refresh.
 *
 * Best-effort: if no device has been resolved yet, or the device-list fetch
 * itself fails, this silently does nothing — a real Spotify-connectivity
 * problem is already surfaced by pollNowPlaying's own error handling, this
 * is purely supplementary monitoring.
 */
async function checkDeviceStatus(fetchFn: typeof fetch, accessToken: string): Promise<void> {
  const deviceId = getSetting("spotify_device_id");
  if (!deviceId) {
    return;
  }

  let devices;
  try {
    devices = await listDevices(fetchFn, async () => accessToken);
  } catch {
    return;
  }

  const match = devices.find((d) => d.id === deviceId);
  const online = Boolean(match);

  const changed = lastDeviceOnline !== null && lastDeviceOnline !== online;
  lastDeviceOnline = online;

  if (changed) {
    emitEvent("device-status", {
      online,
      deviceId,
      deviceName: match?.name,
    } satisfies DeviceStatus);
  }
}

/**
 * Polls Spotify's currently-playing endpoint once, diffs against the
 * last-seen state, and emits a `now-playing` event via the event bus if it
 * changed. Also, every few ticks (see checkDeviceStatus), checks whether the
 * resolved bridge device is still visible to Spotify and emits
 * `device-status` on change.
 *
 * Handles:
 * - 204 No Content (nothing playing) without erroring.
 * - No refresh token stored yet (Spotify not connected) by skipping
 *   silently, matching the token refresh worker's graceful-skip philosophy.
 * - A dead refresh token (SpotifyReauthRequiredError) the same way.
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
    if (err instanceof SpotifyReauthRequiredError) {
      // The stored refresh token is dead and won't recover on its own until
      // an admin redoes the consent flow — skip silently rather than
      // spamming logs on every 4s tick, same philosophy as the
      // not-connected-yet case below.
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/No spotify_refresh_token/.test(message)) {
      // Spotify hasn't been connected yet — skip silently, don't spam logs.
      return;
    }
    throw err;
  }

  // Throttled device-presence check (see checkDeviceStatus docs) — checked
  // before incrementing so the very first tick always establishes a
  // baseline. Runs independently of the currently-playing fetch below (and
  // best-effort — never lets a device-list failure abort this poll).
  const shouldCheckDevice = pollTickCount % DEVICE_CHECK_EVERY_N_TICKS === 0;
  pollTickCount += 1;
  if (shouldCheckDevice) {
    await checkDeviceStatus(fetchFn, accessToken);
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
    if (nextState.trackId) {
      // Best-effort: the track that just started playing is no longer
      // "pending," so drop it from the local queue mirror.
      dequeueBySpotifyTrackId(nextState.trackId);
    }
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
