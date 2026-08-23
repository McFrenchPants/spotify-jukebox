import { Router } from "express";
import { issueAdminToken, verifyAdminPin } from "../auth/adminToken";
import { applyAppSettingsUpdate, getAllAppSettings, validateAppSettingsUpdate } from "../db/appSettings";
import { requireAdminAuth } from "../middleware/adminAuth";

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
