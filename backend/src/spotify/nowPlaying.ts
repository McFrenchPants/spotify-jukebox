import { dequeueBySpotifyTrackId } from "../db/queueEntries";
import { insertPlayHistory } from "../db/playHistory";
import { recordTrackPlay } from "../db/trackStats";
import { emitEvent } from "../events/bus";
import { evictPreviousTrackLyrics, getLyricsForTrack, type LyricsResult } from "../lyrics/lyricsService";
import { getValidAccessToken } from "./client";
import { invalidateDeviceResolutionCache, listDevices } from "./device";
import { getSetting } from "../db";
import { SpotifyRateLimitedError, SpotifyReauthRequiredError } from "./errors";
import { isRateLimited, recordRateLimitFromResponse } from "./rateLimitBackoff";
import { logError, logInfo } from "../logger";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/**
 * Low-frequency safety-net poll interval (BACKLOG.md #24 / see
 * analysis/24-event-scheduled-now-playing-poll.md). Always the outer bound
 * on how long the poller will wait before checking again, regardless of
 * what else is scheduled — catches out-of-band playback changes (a
 * hardware remote, another Spotify client, the bridge device's own
 * controls), general drift, and keeps device online/offline detection
 * alive (it piggybacks on every poll's `device` field).
 */
export const SAFETY_INTERVAL_MS = 15000;

/**
 * Small buffer added on top of the computed "time until this track ends"
 * delay, so the end-of-track poll fires slightly after Spotify's own
 * server-side transition rather than a hair before it (which would just
 * see the same track still playing and have to wait for the next trigger).
 */
const END_OF_TRACK_POLL_BUFFER_MS = 750;

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

/**
 * Timestamp (epoch ms) of the last poll attempt that actually completed
 * (i.e. wasn't skipped early due to isRateLimited()). 0 means no poll has
 * completed yet. Lets consumers of getNowPlayingState() tell a live snapshot
 * apart from one frozen by an active rate-limit backoff window — see
 * getNowPlayingSnapshot() below.
 */
let lastPolledAt = 0;

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

/**
 * Latest resolved lyrics lookup, alongside the trackId it belongs to — set
 * once the fire-and-forget lookup kicked off in pollNowPlaying() resolves.
 * null trackId / null result means no lookup has completed yet for the
 * currently playing track (either still in flight, or nothing is playing).
 * See getLyricsSnapshot() below.
 */
let lastLyricsTrackId: string | null = null;
let lastLyricsResult: LyricsResult | null = null;

/** Resets the last-seen state — primarily useful for tests. */
export function resetNowPlayingState(): void {
  lastState = NOTHING_PLAYING_STATE;
  lastDeviceOnline = null;
  lastDeviceCheckAt = 0;
  lastPolledAt = 0;
  lastLyricsTrackId = null;
  lastLyricsResult = null;
}

/** Returns the last-seen now-playing state (same data the SSE now-playing event carries). */
export function getNowPlayingState(): NowPlayingState {
  return lastState;
}

/** Timestamp (epoch ms) of the last poll that actually completed; 0 if none yet. */
export function getLastPolledAt(): number {
  return lastPolledAt;
}

/**
 * Returns the most recently resolved lyrics lookup for `trackId`, or null if
 * that's not the currently-stored result — either because no lookup has
 * completed yet for the current track (still in flight, or nothing is
 * playing) or because `trackId` refers to a track that isn't the one this
 * result belongs to (e.g. a stale request for a track that has since
 * changed). Used by a later route (LY1.2) to serve lyrics on demand to a
 * guest who connects after the lookup already happened.
 */
export function getLyricsSnapshot(trackId: string): LyricsResult | null {
  if (lastLyricsTrackId !== trackId) {
    return null;
  }
  return lastLyricsResult;
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
    invalidateDeviceResolutionCache();
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
    invalidateDeviceResolutionCache();
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
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Not JSON (or empty body) — leave body undefined, ordinary
      // rate-limit handling still works without it.
    }
    if (recordRateLimitFromResponse(response, "nowPlaying poll", body)) {
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
    const previousTrackId = lastState.trackId;
    const trackActuallyChanged = previousTrackId !== nextState.trackId;
    lastState = nextState;
    lastPolledAt = Date.now();

    if (trackActuallyChanged) {
      // The just-replaced track's lyrics are no longer needed (unless
      // favorited) — evict regardless of whether a new track is starting or
      // playback simply stopped (nextState.trackId === null).
      evictPreviousTrackLyrics(previousTrackId);

      if (nextState.trackId) {
        // Fire-and-forget: kick off the lyrics lookup as a separate async
        // operation rather than awaiting it here, so a slow LRCLIB response
        // never delays the now-playing emit below (which must stay
        // synchronous/immediate). lyrics-update is emitted whenever the
        // lookup happens to resolve; a rejection is caught and logged, never
        // rethrown or turned into an event (the frontend's "still loading"
        // state just persists longer instead).
        const trackId = nextState.trackId;
        getLyricsForTrack(trackId, {
          trackName: nextState.name ?? "Unknown track",
          artistName: nextState.artist ?? "Unknown artist",
          durationMs: nextState.durationMs,
        })
          .then((result) => {
            lastLyricsTrackId = trackId;
            lastLyricsResult = result;
            emitEvent("lyrics-update", {
              trackId,
              syncedLyrics: result.syncedLyrics,
              plainLyrics: result.plainLyrics,
              found: result.found,
            });
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            logError("nowPlaying", `Lyrics lookup failed for track ${trackId}: ${message}`, err);
          });
      } else {
        lastLyricsTrackId = null;
        lastLyricsResult = null;
      }
    }

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
    lastPolledAt = Date.now();
  }
}

/**
 * A running poller "session" — the mutable bits that need to survive
 * across scheduled polls (which fetchFn/getTokenFn to keep using, the
 * pending timer handle, and the consecutive-failure counter). Opaque to
 * callers; treat the return value of startNowPlayingPoller as a handle to
 * pass to stopNowPlayingPoller and nothing else.
 */
export interface NowPlayingPollerHandle {
  fetchFn: typeof fetch;
  getTokenFn: () => Promise<string>;
  timer: ReturnType<typeof setTimeout> | null;
  consecutiveFailures: number;
  stopped: boolean;
}

/**
 * The currently-running poller, if any, started via startNowPlayingPoller.
 * Module-level so triggerImmediateNowPlayingPoll() — called from outside
 * this file, with no context of its own — can find it. There is only ever
 * meant to be one real poller running per process (matches how
 * index.ts uses this today: a single startNowPlayingPoller() call at
 * startup).
 */
let activePoller: NowPlayingPollerHandle | null = null;

/**
 * Computes the delay (ms) until the next automatic poll should fire, given
 * the most recently observed state: whichever is sooner of "estimated time
 * until the current track ends" (plus a small buffer) and the safety-net
 * interval. When nothing is playing, or duration/progress aren't known,
 * there's no end-of-track estimate to compute against — only the safety
 * interval applies.
 */
function computeNextPollDelayMs(state: NowPlayingState): number {
  if (
    state.isPlaying &&
    typeof state.durationMs === "number" &&
    typeof state.progressMs === "number"
  ) {
    const remainingMs = state.durationMs - state.progressMs + END_OF_TRACK_POLL_BUFFER_MS;
    return Math.max(0, Math.min(remainingMs, SAFETY_INTERVAL_MS));
  }
  return SAFETY_INTERVAL_MS;
}

/**
 * Runs one poll for `poller`, then (unless it's been stopped in the
 * meantime) schedules the next one based on the freshly observed state.
 * Shared by both the automatic timer chain and triggerImmediateNowPlayingPoll,
 * so every trigger reschedules consistently and never leaves a stale timer
 * behind.
 */
async function runPollAndReschedule(poller: NowPlayingPollerHandle): Promise<void> {
  try {
    await pollNowPlaying(poller.fetchFn, poller.getTokenFn);
    if (poller.consecutiveFailures > 0) {
      logInfo(
        "nowPlaying",
        `Poll recovered after ${poller.consecutiveFailures} consecutive failure(s)`
      );
      poller.consecutiveFailures = 0;
    }
  } catch (err) {
    poller.consecutiveFailures += 1;
    // Log the first failure in a streak in full, then only every 15th
    // after that — enough to confirm it's still failing and see the cause,
    // without flooding the log with identical lines.
    if (poller.consecutiveFailures === 1 || poller.consecutiveFailures % 15 === 0) {
      logError(
        "nowPlaying",
        `Spotify currently-playing poll failed (${poller.consecutiveFailures} consecutive failure(s) so far)`,
        err
      );
    }
  } finally {
    if (!poller.stopped) {
      scheduleNextPoll(poller);
    }
  }
}

/**
 * Clears any pending timer on `poller` and schedules the next automatic
 * poll based on the current now-playing state (see computeNextPollDelayMs).
 */
function scheduleNextPoll(poller: NowPlayingPollerHandle): void {
  if (poller.timer) {
    clearTimeout(poller.timer);
    poller.timer = null;
  }

  const delay = computeNextPollDelayMs(lastState);
  const timer = setTimeout(() => {
    void runPollAndReschedule(poller);
  }, delay);
  // Don't let this timer keep the process alive on its own.
  timer.unref?.();
  poller.timer = timer;
}

/**
 * Starts event-scheduled polling of Spotify's currently-playing endpoint
 * (BACKLOG.md #24 / analysis/24-event-scheduled-now-playing-poll.md),
 * replacing the old flat interval. After each poll, the next one is
 * scheduled at whichever is sooner: an estimate of when the currently
 * playing track will end, or the SAFETY_INTERVAL_MS (15s) safety net.
 * Callers outside this file can also request an immediate one-shot poll at
 * any time via triggerImmediateNowPlayingPoll(), which reschedules from
 * that fresh result the same way.
 *
 * Errors from individual polls are caught and logged so a single failure
 * doesn't crash the process or stop future polls.
 */
export function startNowPlayingPoller(
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): NowPlayingPollerHandle {
  const poller: NowPlayingPollerHandle = {
    fetchFn,
    getTokenFn,
    timer: null,
    consecutiveFailures: 0,
    stopped: false,
  };

  activePoller = poller;
  scheduleNextPoll(poller);

  return poller;
}

/**
 * Stops a poller previously started with startNowPlayingPoller — cancels
 * any pending scheduled timer (safety-net or end-of-track) and prevents
 * any in-flight poll's completion from scheduling another one.
 */
export function stopNowPlayingPoller(poller: NowPlayingPollerHandle): void {
  poller.stopped = true;
  if (poller.timer) {
    clearTimeout(poller.timer);
    poller.timer = null;
  }
  if (activePoller === poller) {
    activePoller = null;
  }
}

/**
 * Triggers an immediate one-shot poll on the currently-running poller
 * (started via startNowPlayingPoller), cancelling whatever timer was
 * pending and rescheduling from the fresh result once it completes —
 * so a caller (e.g. a playback route, after its own pause/resume/skip/
 * previous call succeeds) never leaves a stale duplicate timer running or
 * causes a double-poll race with the next automatically scheduled one.
 *
 * A no-op if no poller is currently running (e.g. in a test that never
 * called startNowPlayingPoller).
 */
export async function triggerImmediateNowPlayingPoll(): Promise<void> {
  const poller = activePoller;
  if (!poller) {
    return;
  }
  if (poller.timer) {
    clearTimeout(poller.timer);
    poller.timer = null;
  }
  await runPollAndReschedule(poller);
}
