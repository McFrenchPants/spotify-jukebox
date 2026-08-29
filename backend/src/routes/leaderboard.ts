import { Router } from "express";
import { getLeaderboard, getTrackPlayCount } from "../db/trackStats";

export const leaderboardRouter = Router();

const DEFAULT_LIMIT = 10;
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

leaderboardRouter.get("/", (req, res) => {
  const limit = parseLimit(req.query.limit, DEFAULT_LIMIT);
  const entries = getLeaderboard(limit);
  res.status(200).json(entries);
});

/**
 * Full all-time play count for one track, independent of leaderboard
 * ranking — used by the Now Playing detail card, which needs a track's real
 * count even when it's well outside the top N.
 */
leaderboardRouter.get("/track/:trackId", (req, res) => {
  const playCount = getTrackPlayCount(req.params.trackId);
  res.status(200).json({ spotifyTrackId: req.params.trackId, playCount });
});
