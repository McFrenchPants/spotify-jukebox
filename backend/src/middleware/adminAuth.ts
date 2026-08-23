import { NextFunction, Request, Response } from "express";
import { verifyAdminToken } from "../auth/adminToken";

/** Header carrying the signed admin session token issued by POST /api/admin/login. */
export const ADMIN_TOKEN_HEADER = "x-admin-token";

/**
 * Protects `/api/admin/*` routes. Requires a valid, unexpired, untampered
 * admin session token in the `x-admin-token` header — 401s otherwise. On
 * success, attaches `req.isAdmin = true` and calls next().
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.get(ADMIN_TOKEN_HEADER);

  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  req.isAdmin = true;
  next();
}
