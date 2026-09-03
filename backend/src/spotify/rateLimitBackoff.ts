/**
 * Shared rate-limit backoff state for the automatic background pollers
 * (nowPlaying.ts's now-playing poll and device-status check). When Spotify
 * returns a 429, its own client-side rate limiting is already the real
 * constraint — our job is just to stop our own recurring polls from
 * compounding it (or from repeatedly re-triggering it right as the window
 * resets), not to prevent every Spotify call app-wide. On-demand,
 * user-triggered calls (search, an admin manually retrying the device list,
 * queueing a track) are NOT gated by this — they should still attempt a real
 * call and surface a real error, since silently blocking a human-initiated
 * action based on our own guess would be more confusing than a clear 429.
 *
 * This exists because a real production incident showed why it matters: two
 * independent instances of this app's backend (local dev + a Home Assistant
 * OS Add-on deployment) were both polling the same Spotify account
 * simultaneously, roughly doubling background request volume and tripping
 * Spotify's rate limit — which then didn't recover on page reload, because
 * both pollers kept re-triggering it every ~4s regardless.
 */

import { logWarn } from "../logger";

const DEFAULT_BACKOFF_SECONDS = 30;

/**
 * Backoff window armed when a 429's body indicates Spotify's Development
 * Mode QUOTA_EXCEEDED condition (a broader resource-allocation exhaustion,
 * distinct from the ordinary rolling rate limit) rather than an ordinary
 * short rate limit. 1800s (30 minutes) is an engineering estimate, NOT a
 * confirmed reset window — Spotify doesn't document one, and this app has
 * never actually observed a real QUOTA_EXCEEDED response to confirm it
 * against (see BACKLOG.md #25 / docs/proposals/ARCHIVE.md, items 24-26).
 * The intent is just "meaningfully longer than the ordinary 30s default so
 * the poller stops hammering a condition that clearly won't self-clear in
 * seconds," not a precise number.
 */
const QUOTA_EXCEEDED_BACKOFF_SECONDS = 1800;

let blockedUntil = 0;

/** True while an active backoff window (from a recent 429) is in effect. */
export function isRateLimited(): boolean {
  return Date.now() < blockedUntil;
}

/**
 * Checks a parsed 429 response body for Spotify's QUOTA_EXCEEDED reason.
 * The real shape isn't confirmed against this app's own traffic yet, so
 * this checks defensively at both a plausible top-level `body.reason` and a
 * plausible nested `body.error.reason` rather than assuming one.
 */
function isQuotaExceededBody(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }
  const record = body as Record<string, unknown>;
  if (record.reason === "QUOTA_EXCEEDED") {
    return true;
  }
  const error = record.error;
  if (error && typeof error === "object" && (error as Record<string, unknown>).reason === "QUOTA_EXCEEDED") {
    return true;
  }
  return false;
}

/** Truncates a value to a JSON string safe to log, never throwing. */
function safeTruncatedBody(body: unknown, maxLength = 500): string {
  try {
    const text = JSON.stringify(body);
    if (text === undefined) {
      return String(body);
    }
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  } catch {
    return "<unstringifiable body>";
  }
}

/**
 * Inspects a fetch Response for a 429 and, if found, arms the backoff window
 * — using Spotify's `Retry-After` header (seconds) when present, or a
 * default otherwise. No-ops (returns false) for any other status. Safe to
 * call on every Spotify response; only actually does anything on a 429.
 *
 * `body` is the already-parsed response body, if the caller happens to have
 * it (this function stays synchronous and never reads/awaits the response
 * body itself, to avoid double-reading a body each call site handles
 * differently). When `body` indicates Spotify's QUOTA_EXCEEDED condition
 * (see isQuotaExceededBody), a much longer backoff window is armed instead
 * of the ordinary Retry-After/default logic, with distinct log wording.
 * Otherwise, the ordinary logic runs unchanged, and — when `body` is
 * present — its raw (truncated) contents are also logged, so a real future
 * 429 builds an evidence trail of Spotify's actual response shape.
 *
 * Logs a warning whenever this actually arms the window. This case used to
 * be entirely silent by design (a single expected 429 isn't worth logging
 * every tick) — but that meant a *real, ongoing* Spotify-side rate limit or
 * quota block produced zero log output at all, which is exactly what made a
 * real incident look like nothing was happening (BACKLOG.md item 21: a
 * fresh restart's very first poll silently re-armed this window with no
 * trace in the logs). `source` just identifies which caller hit the 429
 * (e.g. "nowPlaying poll", "device list") for that log line.
 */
export function recordRateLimitFromResponse(
  response: {
    status: number;
    headers: { get(name: string): string | null };
  },
  source = "spotify",
  body?: unknown
): boolean {
  if (response.status !== 429) {
    return false;
  }

  if (isQuotaExceededBody(body)) {
    const seconds = QUOTA_EXCEEDED_BACKOFF_SECONDS;
    blockedUntil = Date.now() + seconds * 1000;
    logWarn(
      "rateLimitBackoff",
      `${source} hit Spotify QUOTA_EXCEEDED — backing off for ${seconds}s (no confirmed reset window known, see BACKLOG.md #25) (until ${new Date(blockedUntil).toISOString()})`
    );
    return true;
  }

  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  const seconds =
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds
      : DEFAULT_BACKOFF_SECONDS;

  blockedUntil = Date.now() + seconds * 1000;
  logWarn(
    "rateLimitBackoff",
    `${source} got a 429 from Spotify — backing off for ${seconds}s (until ${new Date(blockedUntil).toISOString()})`
  );
  if (body !== null && body !== undefined) {
    logWarn("rateLimitBackoff", `${source} 429 response body (for evidence, see BACKLOG.md #25): ${safeTruncatedBody(body)}`);
  }
  return true;
}

/** Test-only: clears any active backoff window. */
export function resetRateLimitForTests(): void {
  blockedUntil = 0;
}
