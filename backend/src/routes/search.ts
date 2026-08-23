import { Router } from "express";
import { searchTracks } from "../spotify/client";

export const searchRouter = Router();

searchRouter.get("/", async (req, res) => {
  const q = req.query.q;

  if (typeof q !== "string" || q.trim() === "") {
    res.status(400).json({
      error: "missing_query",
      message: "Query parameter 'q' is required and must not be empty.",
    });
    return;
  }

  try {
    const results = await searchTracks(q);
    res.status(200).json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (/No spotify_refresh_token/.test(message)) {
      res.status(503).json({
        error: "spotify_not_connected",
        message: "Spotify not connected yet — complete /api/auth/login first.",
      });
      return;
    }

    res.status(502).json({
      error: "spotify_search_failed",
      message,
    });
  }
});
