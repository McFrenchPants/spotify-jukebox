import { dequeueBySpotifyTrackId } from "../db/queueEntries";
import { insertPlayHistory } from "../db/playHistory";
import { recordTrackPlay } from "../db/trackStats";
import { emitEvent } from "../events/bus";
import { getValidAccessToken } from "./client";
import { listDevices } from "./device";
import { getSetting } from "../db";
import { SpotifyRateLimitedError, SpotifyReauthRequiredError } from "./errors";
import { isRateLimited, recordRateLimitFromResponse } from "./rateLimitBackoff";

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
  // Present whenever Spotify has an active playback session (i.e. not a 204)
  // — even while paused. Reused below to infer bridge-device online/offline
  // status for free, instead of a separate /v1/me/player/devices call on
  // every tick (see updateDeviceStatusFromDeviceField / checkDeviceStatusFallback).
  device?: { id: string; name: string } | null;
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
 * Only used as a fallback when the currently-playing response can't tell us
 * anything about device presence (see updateDeviceStatusFromDeviceField's
 * docs) — a real GET /v1/me/player/devices call, throttled to at most once
 * per this interval, since it's the one piece of device monitoring that
 * genuinely needs a separate Spotify API call.
 */
const DEVICE_LIST_FALLBACK_INTERVAL_MS = 5 * 60 * 1000;

/** Last-seen bridge-device online/offline state. null = not checked yet (no baseline). */
let lastDeviceOnline: boolean | null = null;

/** Timestamp of the last device-presence check by *any* means (device field or fallback list call). */
let lastDeviceCheckAt = 0;

/** Resets the last-seen state — primarily useful for tests. */
export function resetNowPlayingState(): void {
  lastState = NOTHING_PLAYING_STATE;
  lastDeviceOnline = null;
  lastDeviceCheckAt = 0;
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
 * Updates bridge-device online/offline status *for free*, using the
 * `device` field Spotify already includes in every currently-playing
 * response that has an active playback session (even while paused) — no
 * separate API call needed. Emits `device-status` only when the status
 * actually changes since the last check, same as the fallback below.
 */
function updateDeviceStatusFromDeviceField(device: { id: string; name: string }): void {
  const deviceId = getSetting("spotify_device_id");
  if (!deviceId) {
    return;
  }

  lastDeviceCheckAt = Date.now();
  const online = device.id === deviceId;
  const changed = lastDeviceOnline !== null && lastDeviceOnline !== online;
  lastDeviceOnline = online;

  if (changed) {
    emitEvent("device-status", {
      online,
      deviceId,
      deviceName: online ? device.name : undefined,
    } satisfies DeviceStatus);
  }
}

/**
 * Fallback for when the currently-playing response can't tell us anything
 * about device presence — specifically a 204 (no active playback session at
 * all, so Spotify includes no `device` field to read for free). Makes a real
 * GET /v1/me/player/devices call, but throttled to at most once per
 * DEVICE_LIST_FALLBACK_INTERVAL_MS (5 min) via lastDeviceCheckAt, which is
 * shared with updateDeviceStatusFromDeviceField above — so as long as
 * something is actively playing/paused, this fallback essentially never
 * fires; it only matters while the bridge device is fully idle, where a few
 * minutes of staleness on offline-detection is an acceptable tradeoff for
 * not polling a dedicated endpoint on every tick.
 *
 * `accessToken` is passed in (already obtained by the caller) rather than
 * re-resolved here, so this never triggers its own token refresh.
 *
 * Best-effort: if no device has been resolved yet, or the device-list fetch
 * itself fails, this silently does nothing — a real Spotify-connectivity
 * problem is already surfaced by pollNowPlaying's own error handling, this
 * is purely supplementary monitoring.
 */
async function checkDeviceStatusFallback(fetchFn: typeof fetch, accessToken: string): Promise<void> {
  const deviceId = getSetting("spotify_device_id");
  if (!deviceId) {
    return;
  }

  const now = Date.now();
  if (now - lastDeviceCheckAt < DEVICE_LIST_FALLBACK_INTERVAL_MS) {
    return;
  }
  lastDeviceCheckAt = now;

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
 * changed. Also updates bridge-device online/offline status and emits
 * `device-status` on change — for free from this same response's `device`
 * field when available (see updateDeviceStatusFromDeviceField), or via a
 * throttled fallback call when it isn't (see checkDeviceStatusFallback).
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
  // Skip this entire tick (device check included) while an active backoff
  // window is in effect — see rateLimitBackoff.ts. Deliberately checked
  // before doing anything else (including refreshing the access token), so
  // a 429 doesn't just get immediately re-triggered on the very next tick.
  if (isRateLimited()) {
    return;
  }

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
    if (err instanceof SpotifyRateLimitedError) {
      // Spotify's Accounts (token) endpoint itself was rate-limited —
      // recordRateLimitFromResponse already armed the shared backoff inside
      // refreshAccessToken(), so isRateLimited() will skip future ticks;
      // just don't throw/log-spam for this one.
      return;
    }
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
    // No active session at all, so no `device` field to read for free —
    // fall back to a throttled real device-list check (best-effort, never
    // lets a device-list failure abort this poll).
    await checkDeviceStatusFallback(fetchFn, accessToken);
  } else if (!response.ok) {
    if (recordRateLimitFromResponse(response)) {
      // Arms the backoff window so the next tick skips outright instead of
      // immediately re-triggering the same 429 — see rateLimitBackoff.ts.
      // Not an error worth logging every tick; the poller will just resume
      // once the window passes.
      return;
    }
    throw new Error(`Spotify currently-playing request failed: ${response.status}`);
  } else {
    const data = (await response.json()) as SpotifyCurrentlyPlayingResponse;
    nextState = shapeResponse(data);

    if (data.device) {
      updateDeviceStatusFromDeviceField(data.device);
    } else {
      await checkDeviceStatusFallback(fetchFn, accessToken);
    }
  }

  if (hasChanged(lastState, nextState)) {
    lastState = nextState;
    if (nextState.trackId) {
      // The track that just started playing is no longer "pending," so drop
      // it from the local queue mirror — and use the matched row's
      // added_by_session_id (if any) to attribute the play recorded below.
      // No match (null) means this track was never queued locally, i.e. it's
      // an organic/autoplay continuation Spotify picked on its own.
      const addedBySessionId = dequeueBySpotifyTrackId(nextState.trackId);

      // This is the actual "a new track started playing" signal — the right
      // place to record play_history/track_stats (see trackStats.ts's
      // getLeaderboard docs for why this moved here from routes/queue.ts:
      // queueing a track only means a guest asked for it, not that it
      // played). Only record on an actual play start, not a pause.
      if (nextState.isPlaying) {
        insertPlayHistory({
          spotifyTrackId: nextState.trackId,
          trackName: nextState.name ?? "Unknown track",
          artistName: nextState.artist ?? "Unknown artist",
          albumArtUrl: nextState.albumArt ?? null,
          durationMs: nextState.durationMs ?? 0,
          guestSessionId: addedBySessionId,
        });
        recordTrackPlay(nextState.trackId);
        // recordTrackPlay() above changes leaderboard standing (play_count)
        // for every actual play, not just admin blacklist actions (the only
        // other current emitter of this event, in routes/admin.ts) — a
        // leaderboard view relying solely on this event to stay live needs
        // it here too.
        emitEvent("leaderboard-update", { trackId: nextState.trackId });
      }
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
