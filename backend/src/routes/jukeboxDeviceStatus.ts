import { Router } from "express";
import { getRegisteredJukeboxDeviceId } from "../db/jukeboxDevice";

export const jukeboxDeviceStatusRouter = Router();

/**
 * C1 — Public (no-auth) read of whether a given clientId is the currently
 * registered "Jukebox device" (Master Device Mode registration). Distinct
 * from the admin-gated GET/POST /api/admin/jukebox-device pair in admin.ts,
 * which is how an admin registers the device in the first place: this
 * endpoint lets any client (guest browser) check its OWN status without an
 * admin token.
 */
jukeboxDeviceStatusRouter.get("/mine", (req, res) => {
  const { clientId } = req.query;

  if (typeof clientId !== "string" || clientId.trim() === "") {
    res.status(400).json({ error: "clientId is required" });
    return;
  }

  const registeredId = getRegisteredJukeboxDeviceId();
  res.status(200).json({ isRegistered: registeredId !== null && registeredId === clientId });
});
