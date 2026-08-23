import { NextFunction, Request, Response } from "express";
import { db, getSetting } from "../db";

/** app_settings key for the configurable rate-limit window, in milliseconds. */
export const RATE_LIMIT_WINDOW_MS_KEY = "rate_limit_window_ms";

/** Default rate-limit window: 1 request per 10 minutes per guest session. */
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

interface RateLimitStateRow {
  session_id: string;
  last_allowed_at: string;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/** Reads the configured rate-limit window from app_settings, falling back to the default. */
function getRateLimitWindowMs(): number {
  const raw = getSetting(RATE_LIMIT_WINDOW_MS_KEY);
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_LIMIT_WINDOW_MS;
}

/**
 * Read-only check: does this session currently have an available token?
 *
 * Does NOT mutate any state. Callers that intend to proceed with the
 * rate-limited action must call `recordAllowedRequest` themselves afterward
 * (see that function's docs for why this is split into two steps).
 */
export function checkRateLimit(sessionId: string): RateLimitResult {
  const windowMs = getRateLimitWindowMs();

  const row = db
    .prepare<[string], RateLimitStateRow>(
      "SELECT * FROM rate_limit_state WHERE session_id = ?"
    )
    .get(sessionId);

  if (!row) {
    return { allowed: true };
  }

  const lastAllowedAt = new Date(row.last_allowed_at).getTime();
  const elapsed = Date.now() - lastAllowedAt;

  if (elapsed >= windowMs) {
    return { allowed: true };
  }

  return { allowed: false, retryAfterMs: windowMs - elapsed };
}

/**
 * Records that a rate-limited action was actually performed for this
 * session, upserting `last_allowed_at` to now. This consumes the bucket.
 *
 * Call this ONLY after `checkRateLimit` returned `allowed: true` AND the
 * caller has decided to actually go ahead with the action. Keeping this
 * separate from `checkRateLimit` lets a route run other guardrail checks
 * (e.g. P2.4's content filter) in between, without the rate limiter's
 * bucket getting consumed by a request that ultimately gets rejected by one
 * of those other checks.
 */
export function recordAllowedRequest(sessionId: string): void {
  db.prepare(
    `INSERT INTO rate_limit_state (session_id, last_allowed_at)
     VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(session_id) DO UPDATE SET last_allowed_at = excluded.last_allowed_at`
  ).run(sessionId);
}

/**
 * Express middleware wrapper around `checkRateLimit` for convenience.
 *
 * If there's no `req.guestSession` (populated upstream by
 * `resolveGuestSession`), this middleware has nothing to enforce and simply
 * calls `next()` — deciding whether a session is required at all is some
 * other layer's job.
 *
 * IMPORTANT ORDERING CAVEAT: this middleware only *checks* the rate limit.
 * It deliberately does NOT call `recordAllowedRequest` — that must happen
 * in the route handler itself, after it decides to actually proceed (and
 * ideally after any other guardrail checks, e.g. P2.4's content filter,
 * have also passed). Auto-recording here would consume the bucket before
 * those other checks run, so a request rejected by a later guardrail would
 * incorrectly burn the rate-limit token too.
 */
export function rateLimitGuestSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.guestSession) {
    next();
    return;
  }

  const result = checkRateLimit(req.guestSession.sessionId);

  if (!result.allowed) {
    res.status(429).json({ error: "rate_limited", retryAfterMs: result.retryAfterMs });
    return;
  }

  next();
}
