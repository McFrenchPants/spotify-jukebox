import { Router } from "express";
import { getRecentlyPlayed } from "../db/playHistory";

export const recentRouter = Router();

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/**
 * Parses the ?limit= query param. A missing or non-numeric value falls back
 * to DEFAULT_LIMIT (rather than a 400) — a bad/absent limit shouldn't break
 * an otherwise-valid read request. A numeric value is clamped to
 * [MIN_LIMIT, MAX_LIMIT].
 */
function parseLimit(raw: unknown, fallback: number): number {
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, parsed));
}

recentRouter.get("/", (req, res) => {
  const limit = parseLimit(req.query.limit, DEFAULT_LIMIT);
  const entries = getRecentlyPlayed(limit);
  res.status(200).json(entries);
});
