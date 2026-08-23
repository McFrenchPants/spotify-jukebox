import { Response, Router } from "express";
import { getSetting } from "../db";
import { insertPlayHistory } from "../db/playHistory";
import { insertQueueEntry, listQueueEntries } from "../db/queueEntries";
import { recordTrackPlay } from "../db/trackStats";
import { emitEvent } from "../events/bus";
import { runQueueGuardrails } from "../guardrails/queueGuardrails";
import { recordAllowedRequest, rateLimitGuestSession } from "../guardrails/rateLimiter";
import { resolveGuestSession } from "../middleware/guestSession";
import { getTrack } from "../spotify/client";
import { addTrackToQueue, getQueueState } from "../spotify/queue";

export const queueRouter = Router();

queueRouter.get("/", (_req, res) => {
  res.status(200).json(listQueueEntries());
});

/**
 * Shapes a Spotify-call failure into an HTTP response, following the same
 * message-sniffing approach as device.ts's handleSpotifyError. `fallbackCode`
 * is the error code used for the generic 502 case; a track lookup that
 * Spotify reports as a 404 is special-cased to also respond 404 (with
 * `notFoundCode`) rather than the generic 502.
 */
function handleSpotifyError(
  err: unknown,
  res: Response,
  fallbackCode: string,
  notFoundCode?: string
): void {
  const message = err instanceof Error ? err.message : String(err);

  if (/No spotify_refresh_token/.test(message)) {
    res.status(503).json({
      error: "spotify_not_connected",
      message: "Spotify not connected yet — complete /api/auth/login first.",
    });
    return;
  }

  if (notFoundCode && /^Spotify track lookup failed: 404/.test(message)) {
    res.status(404).json({ error: notFoundCode, message });
    return;
  }

  res.status(502).json({
    error: fallbackCode,
    message,
  });
}

queueRouter.post("/", resolveGuestSession, rateLimitGuestSession, async (req, res) => {
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

  const deviceId = getSetting("spotify_device_id");
  if (!deviceId) {
    res.status(503).json({
      error: "device_not_resolved",
      message: "No Spotify device is resolved yet — an admin must visit GET /api/device first.",
    });
    return;
  }

  // Always re-fetch track metadata server-side rather than trusting anything
  // the client might also send — the guardrails below depend on it, and a
  // client-supplied explicit/durationMs could otherwise bypass them.
  let track;
  try {
    track = await getTrack(trackId);
  } catch (err) {
    handleSpotifyError(err, res, "spotify_track_lookup_failed", "track_not_found");
    return;
  }

  let queueState;
  try {
    queueState = await getQueueState();
  } catch (err) {
    handleSpotifyError(err, res, "spotify_queue_state_failed");
    return;
  }

  const guardrailResult = runQueueGuardrails(track, {
    currentlyPlayingTrackId: queueState.currentlyPlayingTrackId,
    queuedTrackIds: queueState.queuedTrackIds,
  });

  if (!guardrailResult.allowed) {
    res.status(422).json({
      error: guardrailResult.reason,
      message: guardrailResult.message,
    });
    return;
  }

  // All guardrails passed — consume the rate-limit bucket now, and only now
  // (see rateLimiter.ts's docs for why this must happen after guardrails).
  recordAllowedRequest(req.guestSession.sessionId);

  try {
    await addTrackToQueue(track.id, deviceId);
  } catch (err) {
    // The rate-limit bucket has already been consumed at this point. An
    // admin/infra-level Spotify failure here is a different kind of problem
    // than a guest-caused guardrail rejection; not refunding the bucket is
    // an accepted tradeoff.
    handleSpotifyError(err, res, "spotify_queue_failed");
    return;
  }

  insertPlayHistory({
    spotifyTrackId: track.id,
    trackName: track.name,
    artistName: track.artist,
    albumArtUrl: track.albumArt,
    durationMs: track.durationMs,
    guestSessionId: req.guestSession.sessionId,
  });
  recordTrackPlay(track.id);
  insertQueueEntry({
    spotifyTrackId: track.id,
    trackName: track.name,
    artistName: track.artist,
    albumArtUrl: track.albumArt,
    durationMs: track.durationMs,
    addedBySessionId: req.guestSession.sessionId,
  });

  emitEvent("queue-update", { track, queuedBy: req.guestSession.sessionId });
  // recordTrackPlay() above changes leaderboard standing (play_count) for
  // every successful queue-add, not just admin blacklist actions (the only
  // other current emitter of this event, in routes/admin.ts) — a leaderboard
  // view relying solely on this event to stay live needs it here too.
  emitEvent("leaderboard-update", { trackId: track.id });

  res.status(201).json(track);
});
