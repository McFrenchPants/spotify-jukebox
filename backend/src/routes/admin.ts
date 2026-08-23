import { Router } from "express";
import { issueAdminToken, verifyAdminPin } from "../auth/adminToken";

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
