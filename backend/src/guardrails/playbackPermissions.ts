import { getSetting } from "../db";
import {
  ACTIVE_MODE_KEY,
  ALLOW_PAUSE_RESUME_KEY,
  ALLOW_SKIP_KEY,
  ALLOW_VOLUME_KEY,
} from "../db/appSettings";

/**
 * P3.3 — Resolves whether a given playback-control capability is currently
 * permitted for a guest, per DESIGN_SPEC §4's trust-mode gating.
 *
 * Precedence: the capability's own per-toggle override (if set) always wins;
 * if it's unset ("inherit"), fall back to whether the global active_mode is
 * "trusted". This must be called fresh on every request (not cached) since
 * an admin can flip the mode/toggles at any time mid-event.
 */
export type PlaybackCapability = "pause_resume" | "skip" | "volume";

const OVERRIDE_KEY_BY_CAPABILITY: Record<PlaybackCapability, string> = {
  pause_resume: ALLOW_PAUSE_RESUME_KEY,
  skip: ALLOW_SKIP_KEY,
  volume: ALLOW_VOLUME_KEY,
};

export function resolveEffectivePermission(capability: PlaybackCapability): boolean {
  const overrideKey = OVERRIDE_KEY_BY_CAPABILITY[capability];
  const override = getSetting(overrideKey);

  if (override === "true") return true;
  if (override === "false") return false;

  return getSetting(ACTIVE_MODE_KEY) === "trusted";
}
