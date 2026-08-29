import { Router } from "express";
import { resolveEffectivePermission } from "../guardrails/playbackPermissions";
import { getRegisteredJukeboxDeviceId } from "../db/jukeboxDevice";
import { isJukeboxDeviceOnline } from "../events/jukeboxDeviceOnline";

export const trustModeRouter = Router();

/**
 * P4.5 — Public (no-auth) read of the *resolved effective permissions* for
 * the three playback-control capabilities. This is a UI hint only: real
 * enforcement happens server-side on every P3.3 playback-control call via
 * resolveEffectivePermission(), regardless of what this endpoint returns.
 *
 * M1.4 — additionally reports the Jukebox device's state, so the frontend
 * can distinguish three cases: never registered (`registered: false`),
 * registered and currently connected (`registered: true, online: true`),
 * and registered but currently disconnected (`registered: true, online:
 * false`). This is purely additive — the three existing top-level fields
 * are unchanged.
 */
trustModeRouter.get("/", (_req, res) => {
  res.status(200).json({
    pauseResume: resolveEffectivePermission("pause_resume"),
    skip: resolveEffectivePermission("skip"),
    volume: resolveEffectivePermission("volume"),
    jukeboxDevice: {
      registered: getRegisteredJukeboxDeviceId() !== null,
      online: isJukeboxDeviceOnline(),
    },
  });
});
