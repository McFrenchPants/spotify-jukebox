import { Router } from "express";
import { createGuestSession, touchGuestSession, updateGuestProfile } from "../db/guestSessions";
import { GUEST_TOKEN_HEADER, resolveGuestSession } from "../middleware/guestSession";

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
        nickname: existing.nickname,
        avatar: existing.avatar,
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
    nickname: created.nickname,
    avatar: created.avatar,
  });
});

sessionRouter.patch("/me", resolveGuestSession, (req, res) => {
  if (!req.guestSession) {
    res.status(400).json({
      error: "session_required",
      message: "Call POST /api/session first.",
    });
    return;
  }

  const { nickname, avatar } = req.body ?? {};

  if (nickname !== undefined && typeof nickname !== "string") {
    res.status(400).json({
      error: "invalid_body",
      message: "Body field 'nickname' must be a string if present.",
    });
    return;
  }

  if (avatar !== undefined && typeof avatar !== "string") {
    res.status(400).json({
      error: "invalid_body",
      message: "Body field 'avatar' must be a string if present.",
    });
    return;
  }

  const updates: { nickname?: string; avatar?: string } = {};
  if (nickname !== undefined) {
    updates.nickname = nickname;
  }
  if (avatar !== undefined) {
    updates.avatar = avatar;
  }

  const updated = updateGuestProfile(req.guestSession.sessionId, updates);

  // updated should always be defined here since resolveGuestSession only
  // attaches req.guestSession for a session it just found, but guard anyway.
  if (!updated) {
    res.status(400).json({
      error: "session_required",
      message: "Call POST /api/session first.",
    });
    return;
  }

  res.status(200).json({
    token: updated.sessionId,
    sessionId: updated.sessionId,
    createdAt: updated.createdAt,
    nickname: updated.nickname,
    avatar: updated.avatar,
  });
});
