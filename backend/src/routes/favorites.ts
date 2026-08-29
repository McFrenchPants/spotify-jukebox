import { Response, Router } from "express";
import {
  addFavorite,
  getFavoriteStatusForTracks,
  listFavoritesForGuest,
  removeFavorite,
} from "../db/favorites";
import { emitEvent } from "../events/bus";
import { resolveGuestSession } from "../middleware/guestSession";
import { getTrack } from "../spotify/client";
import { classifySpotifyAuthError } from "../spotify/errors";

export const favoritesRouter = Router();

/**
 * Shapes a Spotify-call failure into an HTTP response. Mirrors queue.ts's
 * private handleSpotifyError (itself following device.ts's/artist.ts's
 * pattern) — each route file keeps its own copy rather than sharing one
 * across files, per the codebase's existing convention.
 */
function handleSpotifyError(
  err: unknown,
  res: Response,
  fallbackCode: string,
  notFoundCode?: string
): void {
  const classified = classifySpotifyAuthError(err);
  if (classified) {
    res.status(classified.status).json(classified.body);
    return;
  }

  const message = err instanceof Error ? err.message : String(err);

  if (notFoundCode && /^Spotify track lookup failed: 404/.test(message)) {
    res.status(404).json({ error: notFoundCode, message });
    return;
  }

  res.status(502).json({
    error: fallbackCode,
    message,
  });
}

// Registered before the (currently DELETE-only) "/:trackId" route so an
// explicit literal path always wins over the future addition of any
// GET "/:trackId" route. GET "/" vs GET "/status" don't conflict today since
// "/status" is a distinct literal, not a param segment, but keeping this
// route defined first is the safer convention going forward.
favoritesRouter.get("/status", resolveGuestSession, (req, res) => {
  const rawTrackIds = req.query.trackIds;
  const trackIds =
    typeof rawTrackIds === "string" && rawTrackIds.trim() !== ""
      ? rawTrackIds.split(",")
      : [];

  const status = getFavoriteStatusForTracks(req.guestSession?.sessionId, trackIds);
  res.status(200).json(status);
});

favoritesRouter.get("/", resolveGuestSession, (req, res) => {
  if (!req.guestSession) {
    res.status(400).json({
      error: "session_required",
      message: "Call POST /api/session first.",
    });
    return;
  }

  res.status(200).json(listFavoritesForGuest(req.guestSession.sessionId));
});

favoritesRouter.post("/", resolveGuestSession, async (req, res) => {
  if (!req.guestSession) {
    res.status(400).json({
      error: "session_required",
      message: "Call POST /api/session first.",
    });
    return;
  }

  const { trackId } = req.body ?? {};
  if (typeof trackId !== "string" || trackId.trim() === "") {
    res.status(400).json({
      error: "missing_track_id",
      message: "Body field 'trackId' is required and must not be empty.",
    });
    return;
  }

  // Always re-fetch track metadata server-side rather than trusting anything
  // the client might also send, same trust boundary as POST /api/queue.
  let track;
  try {
    track = await getTrack(trackId);
  } catch (err) {
    handleSpotifyError(err, res, "spotify_track_lookup_failed", "track_not_found");
    return;
  }

  addFavorite({
    guestSessionId: req.guestSession.sessionId,
    spotifyTrackId: track.id,
    trackName: track.name,
    artistName: track.artist,
    albumArtUrl: track.albumArt,
    durationMs: track.durationMs,
  });

  emitEvent("favorites-update", { trackId: track.id, guestSessionId: req.guestSession.sessionId });

  res.status(201).json(track);
});

favoritesRouter.delete("/:trackId", resolveGuestSession, (req, res) => {
  if (!req.guestSession) {
    res.status(400).json({
      error: "session_required",
      message: "Call POST /api/session first.",
    });
    return;
  }

  removeFavorite(req.guestSession.sessionId, req.params.trackId);
  emitEvent("favorites-update", {
    trackId: req.params.trackId,
    guestSessionId: req.guestSession.sessionId,
  });

  res.status(204).end();
});
