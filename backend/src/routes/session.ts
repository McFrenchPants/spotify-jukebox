import { Router } from "express";
import { createGuestSession, touchGuestSession } from "../db/guestSessions";
import { GUEST_TOKEN_HEADER } from "../middleware/guestSession";

export const sessionRouter = Router();

sessionRouter.post("/", (req, res) => {
  const token = req.get(GUEST_TOKEN_HEADER);

  if (token) {
    const existing = touchGuestSession(token);
    if (existing) {
      res.status(200).json({
        token: existing.sessionId,
        sessionId: existing.sessionId,
        createdAt: existing.createdAt,
      });
      return;
    }
    // Token present but unrecognized (expired/garbage/foreign) — fall
    // through and issue a fresh session rather than erroring.
  }

  const created = createGuestSession(req.ip ?? "unknown", req.get("user-agent") ?? undefined);
  res.status(201).json({
    token: created.sessionId,
    sessionId: created.sessionId,
    createdAt: created.createdAt,
  });
});
