import { Response, Router } from "express";
import { getArtist } from "../spotify/client";
import { classifySpotifyAuthError } from "../spotify/errors";

export const artistRouter = Router();

/**
 * Shapes a Spotify-call failure into an HTTP response, following the same
 * shared-classifier approach as queue.ts's handleSpotifyError. An artist id
 * Spotify reports as a 404 is special-cased to also respond 404 (with
 * "artist_not_found") rather than the generic 502.
 */
function handleSpotifyError(err: unknown, res: Response): void {
  const classified = classifySpotifyAuthError(err);
  if (classified) {
    res.status(classified.status).json(classified.body);
    return;
  }

  const message = err instanceof Error ? err.message : String(err);

  if (/^Spotify artist lookup failed: 404/.test(message)) {
    res.status(404).json({ error: "artist_not_found", message });
    return;
  }

  res.status(502).json({
    error: "spotify_artist_lookup_failed",
    message,
  });
}

// Public, unauthenticated read — same category as search (genre/image/
// follower-count data isn't sensitive), so no session/trust-mode gating.
artistRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (typeof id !== "string" || id.trim() === "") {
    res.status(400).json({
      error: "missing_artist_id",
      message: "Path parameter 'id' is required and must not be empty.",
    });
    return;
  }

  try {
    const artist = await getArtist(id);
    res.status(200).json(artist);
  } catch (err) {
    handleSpotifyError(err, res);
  }
});
