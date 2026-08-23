import { getSetting } from "../db";
import { isArtistBlacklisted } from "../db/artistBlacklist";
import { isTrackBlacklisted } from "../db/trackStats";

/** app_settings key for the explicit-content filter toggle. */
export const EXPLICIT_FILTER_ENABLED_KEY = "explicit_filter_enabled";
/** Default: explicit filter is ON when unset (fail restrictive). */
export const DEFAULT_EXPLICIT_FILTER_ENABLED = "true";

/** app_settings key for the minimum allowed track duration, in milliseconds. */
export const MIN_DURATION_MS_KEY = "min_duration_ms";
/** Default minimum duration: 60 seconds. */
export const DEFAULT_MIN_DURATION_MS = 60_000;

/** app_settings key for the maximum allowed track duration, in milliseconds. */
export const MAX_DURATION_MS_KEY = "max_duration_ms";
/** Default maximum duration: 8 minutes. */
export const DEFAULT_MAX_DURATION_MS = 480_000;

export type GuardrailResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "explicit" | "duration_too_short" | "duration_too_long" | "duplicate" | "blacklisted";
      message: string;
    };

const ALLOWED: GuardrailResult = { allowed: true };

/** Reads the explicit-filter toggle from app_settings. Any value other than the literal string "false" is treated as enabled (fail restrictive/safe by default, including when unset). */
function isExplicitFilterEnabled(): boolean {
  const raw = getSetting(EXPLICIT_FILTER_ENABLED_KEY) ?? DEFAULT_EXPLICIT_FILTER_ENABLED;
  return raw !== "false";
}

function getMinDurationMs(): number {
  const raw = getSetting(MIN_DURATION_MS_KEY);
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MIN_DURATION_MS;
}

function getMaxDurationMs(): number {
  const raw = getSetting(MAX_DURATION_MS_KEY);
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_DURATION_MS;
}

/**
 * Guardrail 1: explicit content filter. When the `explicit_filter_enabled`
 * setting is on (the default), tracks flagged `explicit: true` by Spotify
 * are rejected from direct queueing.
 */
export function checkExplicitFilter(track: { explicit: boolean }): GuardrailResult {
  if (isExplicitFilterEnabled() && track.explicit) {
    return { allowed: false, reason: "explicit", message: "This track is marked explicit and explicit content is currently disabled." };
  }
  return ALLOWED;
}

/**
 * Guardrail 2: duration bounds. Rejects tracks shorter than
 * `min_duration_ms` or longer than `max_duration_ms` (both admin-adjustable
 * via app_settings, inclusive bounds).
 */
export function checkDurationBounds(track: { durationMs: number }): GuardrailResult {
  const min = getMinDurationMs();
  const max = getMaxDurationMs();

  if (track.durationMs < min) {
    return { allowed: false, reason: "duration_too_short", message: `Track is shorter than the minimum allowed duration of ${min}ms.` };
  }
  if (track.durationMs > max) {
    return { allowed: false, reason: "duration_too_long", message: `Track is longer than the maximum allowed duration of ${max}ms.` };
  }
  return ALLOWED;
}

/**
 * Guardrail 3: duplicate prevention. Rejects a track that is currently
 * playing or already sitting in the queue. Takes both pieces of state as
 * explicit injected parameters — this function does not fetch them itself
 * (see module docs / task notes for why).
 */
export function checkDuplicate(
  trackId: string,
  currentlyPlayingTrackId: string | null,
  queuedTrackIds: string[]
): GuardrailResult {
  if (trackId === currentlyPlayingTrackId || queuedTrackIds.includes(trackId)) {
    return { allowed: false, reason: "duplicate", message: "This track is already playing or in the queue." };
  }
  return ALLOWED;
}

/**
 * Guardrail 4: blacklist. Rejects a track that an admin has flagged via
 * `track_stats.is_blacklisted`, or whose artist has been flagged via the
 * `blacklisted_artists` app_settings entry (see db/artistBlacklist.ts).
 */
export function checkBlacklist(trackId: string, artistName: string): GuardrailResult {
  if (isTrackBlacklisted(trackId)) {
    return { allowed: false, reason: "blacklisted", message: "This track has been blacklisted by an admin." };
  }
  if (isArtistBlacklisted(artistName)) {
    return { allowed: false, reason: "blacklisted", message: "This artist has been blacklisted by an admin." };
  }
  return ALLOWED;
}

/**
 * Runs all queue-submission guardrails in sequence, short-circuiting on the
 * first rejection. Order (cheapest / no-DB checks first):
 *   1. explicit filter
 *   2. duration bounds
 *   3. duplicate prevention
 *   4. blacklist
 */
export function runQueueGuardrails(
  track: { id: string; explicit: boolean; durationMs: number; artist: string },
  context: { currentlyPlayingTrackId: string | null; queuedTrackIds: string[] }
): GuardrailResult {
  const explicitResult = checkExplicitFilter(track);
  if (!explicitResult.allowed) return explicitResult;

  const durationResult = checkDurationBounds(track);
  if (!durationResult.allowed) return durationResult;

  const duplicateResult = checkDuplicate(track.id, context.currentlyPlayingTrackId, context.queuedTrackIds);
  if (!duplicateResult.allowed) return duplicateResult;

  const blacklistResult = checkBlacklist(track.id, track.artist);
  if (!blacklistResult.allowed) return blacklistResult;

  return ALLOWED;
}
