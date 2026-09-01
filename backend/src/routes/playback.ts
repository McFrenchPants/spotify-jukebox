import { Response, Router } from "express";
import { verifyAdminToken } from "../auth/adminToken";
import { getSetting } from "../db";
import { getRegisteredJukeboxDeviceId } from "../db/jukeboxDevice";
import { emitEvent } from "../events/bus";
import { isJukeboxDeviceOnline } from "../events/jukeboxDeviceOnline";
import { getLastKnownJukeboxVolumePercent, reportJukeboxVolumePercent } from "../events/jukeboxVolumeStatus";
import { PlaybackCapability, resolveEffectivePermission } from "../guardrails/playbackPermissions";
import { ADMIN_TOKEN_HEADER } from "../middleware/adminAuth";
import { pausePlayback, resumePlayback, setVolume, skipToNext, skipToPrevious } from "../spotify/playback";
import { classifySpotifyAuthError } from "../spotify/errors";
import { triggerImmediateNowPlayingPoll } from "../spotify/nowPlaying";

export const playbackRouter = Router();

/**
 * Shapes a Spotify-call failure into an HTTP response, following the same
 * shared-classifier approach as queue.ts's handleSpotifyError.
 */
function handleSpotifyError(err: unknown, res: Response, fallbackCode: string): void {
  const classified = classifySpotifyAuthError(err);
  if (classified) {
    res.status(classified.status).json(classified.body);
    return;
  }

  res.status(502).json({
    error: fallbackCode,
    message: err instanceof Error ? err.message : String(err),
  });
}

/**
 * Trust-mode gate shared by every playback-control endpoint. A valid admin
 * token always bypasses the gate (per DESIGN_SPEC: the admin can always
 * perform these actions). Otherwise, the capability's effective permission
 * (resolved fresh on every request — never cached) must be true. Returns
 * true if the request may proceed; writes the 403 response and returns
 * false otherwise.
 */
function checkTrustModeGate(req: { get(name: string): string | undefined }, res: Response, capability: PlaybackCapability): boolean {
  if (verifyAdminToken(req.get(ADMIN_TOKEN_HEADER))) {
    return true;
  }

  if (!resolveEffectivePermission(capability)) {
    res.status(403).json({
      error: "trust_mode_denied",
      message: `This action ("${capability}") is not permitted in the current trust mode.`,
    });
    return false;
  }

  return true;
}

/**
 * Fire-and-forget kickoff of an immediate now-playing poll (BACKLOG.md #24),
 * called after a playback-control route's underlying Spotify call succeeds.
 * Never awaited by the caller — the guest's own HTTP response must not wait
 * on an extra Spotify round-trip; the poll's result reaches clients via the
 * existing now-playing SSE event separately. triggerImmediateNowPlayingPoll()
 * already catches/logs any failure internally, so the try/catch here is
 * purely defensive against an unexpected synchronous throw.
 */
function triggerNowPlayingPollFireAndForget(): void {
  try {
    void triggerImmediateNowPlayingPoll();
  } catch {
    // Defensive only — triggerImmediateNowPlayingPoll() is not expected to
    // throw synchronously; see doc comment above.
  }
}

/** Reads the resolved Spotify device id, or writes a 503 and returns null if none is set yet. */
function requireDeviceId(res: Response): string | null {
  const deviceId = getSetting("spotify_device_id");
  if (!deviceId) {
    res.status(503).json({
      error: "device_not_resolved",
      message: "No Spotify device is resolved yet — an admin must visit GET /api/device first.",
    });
    return null;
  }
  return deviceId;
}

playbackRouter.post("/pause", async (req, res) => {
  if (!checkTrustModeGate(req, res, "pause_resume")) return;

  const deviceId = requireDeviceId(res);
  if (!deviceId) return;

  try {
    await pausePlayback(deviceId);
  } catch (err) {
    handleSpotifyError(err, res, "spotify_pause_failed");
    return;
  }

  triggerNowPlayingPollFireAndForget();
  res.status(200).json({ status: "ok" });
});

playbackRouter.post("/resume", async (req, res) => {
  if (!checkTrustModeGate(req, res, "pause_resume")) return;

  const deviceId = requireDeviceId(res);
  if (!deviceId) return;

  try {
    await resumePlayback(deviceId);
  } catch (err) {
    handleSpotifyError(err, res, "spotify_resume_failed");
    return;
  }

  triggerNowPlayingPollFireAndForget();
  res.status(200).json({ status: "ok" });
});

playbackRouter.post("/skip", async (req, res) => {
  if (!checkTrustModeGate(req, res, "skip")) return;

  const deviceId = requireDeviceId(res);
  if (!deviceId) return;

  try {
    await skipToNext(deviceId);
  } catch (err) {
    handleSpotifyError(err, res, "spotify_skip_failed");
    return;
  }

  triggerNowPlayingPollFireAndForget();
  res.status(200).json({ status: "ok" });
});

playbackRouter.post("/previous", async (req, res) => {
  if (!checkTrustModeGate(req, res, "skip")) return;

  const deviceId = requireDeviceId(res);
  if (!deviceId) return;

  try {
    await skipToPrevious(deviceId);
  } catch (err) {
    handleSpotifyError(err, res, "spotify_previous_failed");
    return;
  }

  triggerNowPlayingPollFireAndForget();
  res.status(200).json({ status: "ok" });
});

playbackRouter.post("/volume", async (req, res) => {
  // Validated before the trust-mode check: a malformed request should
  // always 400 regardless of who's asking, and doing so first avoids
  // leaking trust-mode/admin-status information via which check fires.
  const { volumePercent } = req.body ?? {};
  if (
    typeof volumePercent !== "number" ||
    !Number.isInteger(volumePercent) ||
    volumePercent < 0 ||
    volumePercent > 100
  ) {
    res.status(400).json({
      error: "invalid_volume",
      message: "Body field 'volumePercent' is required and must be an integer between 0 and 100.",
    });
    return;
  }

  if (!checkTrustModeGate(req, res, "volume")) return;

  // M1.3 — Master Device Mode: when a Jukebox device is registered and
  // currently online, volume commands are routed to it over SSE instead of
  // Spotify's Volume API (which doesn't work for a phone acting as a
  // Spotify Connect receiver). This branch bypasses requireDeviceId()
  // entirely — no Spotify API call happens, so no Spotify device id is
  // needed. When no Jukebox device is registered, or one is registered but
  // offline, behavior is unchanged: fall through to the existing
  // Spotify-volume-API path below.
  if (getRegisteredJukeboxDeviceId() !== null && isJukeboxDeviceOnline()) {
    emitEvent("jukebox-volume-command", { volumePercent });
    res.status(200).json({ status: "ok" });
    return;
  }

  const deviceId = requireDeviceId(res);
  if (!deviceId) return;

  try {
    await setVolume(volumePercent, deviceId);
  } catch (err) {
    handleSpotifyError(err, res, "spotify_volume_failed");
    return;
  }

  res.status(200).json({ status: "ok" });
});

/**
 * Backlog item 19 — Public (no-auth), clientId-gated endpoint the native
 * Jukebox device (Master Device Mode) uses to report its actual current
 * volume, since Master Device Mode volume control is otherwise one-way
 * (backend -> phone via jukebox-volume-command above). Mirrors the
 * clientId-gating pattern of GET /api/jukebox-device/mine.
 */
playbackRouter.post("/jukebox-volume-report", (req, res) => {
  // Validated before the clientId check, same "validate shape before
  // checking who's asking" ordering as POST /volume above.
  const { clientId, volumePercent } = req.body ?? {};
  if (
    typeof volumePercent !== "number" ||
    !Number.isInteger(volumePercent) ||
    volumePercent < 0 ||
    volumePercent > 100
  ) {
    res.status(400).json({
      error: "invalid_volume",
      message: "Body field 'volumePercent' is required and must be an integer between 0 and 100.",
    });
    return;
  }

  if (typeof clientId !== "string" || clientId.trim() === "") {
    res.status(400).json({ error: "clientId is required" });
    return;
  }

  if (clientId !== getRegisteredJukeboxDeviceId()) {
    res.status(403).json({ error: "not_registered_device" });
    return;
  }

  reportJukeboxVolumePercent(volumePercent);
  res.status(200).json({ status: "ok" });
});

/**
 * Backlog item 19 — Public (no-auth) read of the last-known volume reported
 * by the Jukebox device, so any client (guest browser) can seed/resync its
 * volume slider without an admin token.
 */
playbackRouter.get("/jukebox-volume", (req, res) => {
  res.status(200).json({ volumePercent: getLastKnownJukeboxVolumePercent() });
});
