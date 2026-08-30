import { Response, Router } from "express";
import { issueAdminToken, verifyAdminPin } from "../auth/adminToken";
import { addBlacklistedArtist } from "../db/artistBlacklist";
import { applyAppSettingsUpdate, getAllAppSettings, validateAppSettingsUpdate } from "../db/appSettings";
import { getSetting } from "../db";
import { getRegisteredJukeboxDeviceId, registerJukeboxDeviceId } from "../db/jukeboxDevice";
import { clearQueueEntries, deleteQueueEntry, listQueueEntries } from "../db/queueEntries";
import { setTrackBlacklisted } from "../db/trackStats";
import { emitEvent } from "../events/bus";
import { requireAdminAuth } from "../middleware/adminAuth";
import { resyncSpotifyQueue } from "../spotify/queueSync";

export const adminRouter = Router();

adminRouter.post("/login", (req, res) => {
  const pin = req.body?.pin;

  if (typeof pin !== "string" || pin.length === 0) {
    res.status(400).json({ error: "pin is required" });
    return;
  }

  if (!verifyAdminPin(pin)) {
    res.status(401).json({ error: "invalid_pin" });
    return;
  }

  const { token, expiresAt } = issueAdminToken();
  res.status(200).json({ token, expiresAt });
});

// P3.2 — Settings CRUD. Protected individually (not via adminRouter.use)
// so /login stays unauthenticated.
adminRouter.get("/settings", requireAdminAuth, (_req, res) => {
  res.status(200).json(getAllAppSettings());
});

adminRouter.put("/settings", requireAdminAuth, (req, res) => {
  const { errors, value } = validateAppSettingsUpdate(req.body);

  if (errors.length > 0) {
    res.status(400).json({ error: "invalid_settings", details: errors });
    return;
  }

  applyAppSettingsUpdate(value);
  res.status(200).json(getAllAppSettings());
});

// P3.4 — Queue moderation (local queue mirror + Spotify resync). Protected
// individually, same pattern as the settings routes above.

/**
 * Shared helper for the two moderation routes below (DELETE /queue/:id and
 * POST /queue/clear): after the local queue_entries mutation has already
 * happened, check for a resolved device and resync Spotify's live queue to
 * match. Responds and returns false on failure (device not resolved, or the
 * resync call itself failing); the caller should return immediately in that
 * case. Responds 200 and emits `event` on success.
 */
async function resyncAndRespond(
  res: Response,
  event: string,
  eventPayload: unknown
): Promise<void> {
  const deviceId = getSetting("spotify_device_id");
  if (!deviceId) {
    res.status(503).json({
      error: "device_not_resolved",
      message: "No Spotify device is resolved yet — an admin must visit GET /api/device first.",
    });
    return;
  }

  try {
    await resyncSpotifyQueue(deviceId);
  } catch (err) {
    // The local mutation has already happened at this point; not rolling it
    // back is an accepted tradeoff (same category as queue.ts's rate-limit
    // bucket-already-consumed tradeoff).
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "spotify_resync_failed", message });
    return;
  }

  emitEvent(event, eventPayload);
  res.status(200).json({ status: "ok" });
}

adminRouter.get("/queue", requireAdminAuth, (_req, res) => {
  res.status(200).json(listQueueEntries());
});

adminRouter.delete("/queue/:id", requireAdminAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_queue_entry_id", message: "id must be a positive integer." });
    return;
  }

  const deleted = deleteQueueEntry(id);
  if (!deleted) {
    res.status(404).json({ error: "queue_entry_not_found" });
    return;
  }

  await resyncAndRespond(res, "queue-update", { removed: id });
});

adminRouter.post("/queue/clear", requireAdminAuth, async (_req, res) => {
  clearQueueEntries();
  await resyncAndRespond(res, "queue-update", { cleared: true });
});

adminRouter.post("/blacklist", requireAdminAuth, (req, res) => {
  const { type, value } = req.body ?? {};

  if (type !== "track" && type !== "artist") {
    res.status(400).json({
      error: "invalid_blacklist_request",
      message: 'type must be "track" or "artist".',
    });
    return;
  }

  if (typeof value !== "string" || value.trim() === "") {
    res.status(400).json({
      error: "invalid_blacklist_request",
      message: "value is required and must not be empty.",
    });
    return;
  }

  if (type === "track") {
    setTrackBlacklisted(value.trim(), true);
  } else {
    addBlacklistedArtist(value);
  }

  emitEvent("leaderboard-update", { blacklisted: { type, value } });
  res.status(200).json({ status: "ok" });
});

// M1.1 — Jukebox device registration. Protected individually, same pattern
// as the settings/queue routes above. Storage-only for now: no volume
// routing, SSE, or native client wiring yet (later tasks in this proposal).
adminRouter.get("/jukebox-device", requireAdminAuth, (_req, res) => {
  res.status(200).json({ clientId: getRegisteredJukeboxDeviceId() });
});

adminRouter.post("/jukebox-device/register", requireAdminAuth, (req, res) => {
  const { clientId } = req.body ?? {};

  if (typeof clientId !== "string" || clientId.trim() === "") {
    res.status(400).json({
      error: "invalid_jukebox_device_request",
      message: "clientId is required and must be a non-empty string.",
    });
    return;
  }

  const trimmed = clientId.trim();
  registerJukeboxDeviceId(trimmed);
  res.status(200).json({ clientId: trimmed });
});
