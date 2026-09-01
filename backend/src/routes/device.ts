import { Response, Router } from "express";
import { setSetting } from "../db";
import { requireAdminAuth } from "../middleware/adminAuth";
import { getCachedDeviceResolution, invalidateDeviceResolutionCache, listDevices } from "../spotify/device";
import { classifySpotifyAuthError } from "../spotify/errors";

export const deviceRouter = Router();

function handleSpotifyError(err: unknown, res: Response) {
  const classified = classifySpotifyAuthError(err);
  if (classified) {
    res.status(classified.status).json(classified.body);
    return;
  }

  res.status(502).json({
    error: "spotify_device_lookup_failed",
    message: err instanceof Error ? err.message : String(err),
  });
}

deviceRouter.get("/", async (_req, res) => {
  try {
    const result = await getCachedDeviceResolution();
    res.status(200).json(result);
  } catch (err) {
    handleSpotifyError(err, res);
  }
});

deviceRouter.post("/select", requireAdminAuth, async (req, res) => {
  const { deviceId } = req.body ?? {};

  if (typeof deviceId !== "string" || deviceId.trim() === "") {
    res.status(400).json({
      error: "missing_device_id",
      message: "Body field 'deviceId' is required and must not be empty.",
    });
    return;
  }

  try {
    // Re-fetch the live device list rather than trusting anything cached —
    // the admin must be selecting from what's currently visible.
    const devices = await listDevices();
    const match = devices.find((d) => d.id === deviceId);

    if (!match) {
      res.status(400).json({
        error: "device_not_found",
        message: "The given deviceId is not currently visible in the Spotify device list.",
      });
      return;
    }

    setSetting("spotify_device_id", deviceId);
    invalidateDeviceResolutionCache();
    res.status(200).json(match);
  } catch (err) {
    handleSpotifyError(err, res);
  }
});
