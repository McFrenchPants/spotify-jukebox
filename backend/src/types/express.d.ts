import { GuestSession } from "../db/guestSessions";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Set by `resolveGuestSession` middleware when the request carries a
       * valid `x-guest-token` header matching an existing guest_sessions row.
       * Left undefined when no token is present or it doesn't match — this
       * middleware only resolves, it never creates or rejects.
       */
      guestSession?: GuestSession;
    }
  }
}

export {};
