import { Router } from "express";
import { resolveEffectivePermission } from "../guardrails/playbackPermissions";

export const trustModeRouter = Router();

/**
 * P4.5 — Public (no-auth) read of the *resolved effective permissions* for
 * the three playback-control capabilities. This is a UI hint only: real
 * enforcement happens server-side on every P3.3 playback-control call via
 * resolveEffectivePermission(), regardless of what this endpoint returns.
 */
trustModeRouter.get("/", (_req, res) => {
  res.status(200).json({
    pauseResume: resolveEffectivePermission("pause_resume"),
    skip: resolveEffectivePermission("skip"),
    volume: resolveEffectivePermission("volume"),
  });
});
