import { Router } from "express";
import { searchTracks } from "../spotify/client";
import { classifySpotifyAuthError } from "../spotify/errors";

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
    const classified = classifySpotifyAuthError(err);
    if (classified) {
      res.status(classified.status).json(classified.body);
      return;
    }

    res.status(502).json({
      error: "spotify_search_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
