import { NextFunction, Request, Response } from "express";
import { touchGuestSession } from "../db/guestSessions";

export const GUEST_TOKEN_HEADER = "x-guest-token";

/**
 * Resolves the guest session (if any) for the incoming request from the
 * `x-guest-token` header and attaches it to `req.guestSession`.
 *
 * This middleware only *resolves* a session — it never creates one (that's
 * POST /api/session's job) and never rejects the request when no session is
 * found. Downstream routes (rate limiting, queue attribution, etc.) decide
 * for themselves what to do with an absent `req.guestSession`.
 */
export function resolveGuestSession(req: Request, _res: Response, next: NextFunction): void {
  const token = req.get(GUEST_TOKEN_HEADER);

  if (token) {
    const session = touchGuestSession(token);
    if (session) {
      req.guestSession = session;
    }
  }

  next();
}
