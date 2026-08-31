import { Router } from "express";
import { getLyricsSnapshot, getNowPlayingState } from "../spotify/nowPlaying";

export const lyricsRouter = Router();

// GET /api/lyrics — public, no request params (mirrors /api/now-playing's
// "no params, ambient current state" shape). Always answers for whatever's
// currently playing, read internally via getNowPlayingState().trackId, and
// never returns a 404/500 for the normal "not ready yet" case.
//
// `loading` convention: present-and-true only while a track is playing but
// its lyrics lookup hasn't resolved yet; omitted entirely otherwise (nothing
// playing, or lyrics have resolved — found or genuinely not found).
lyricsRouter.get("/", (_req, res) => {
  const { trackId } = getNowPlayingState();

  if (!trackId) {
    res.status(200).json({ trackId: null, syncedLyrics: null, plainLyrics: null, found: false });
    return;
  }

  const snapshot = getLyricsSnapshot(trackId);

  if (!snapshot) {
    res.status(200).json({
      trackId,
      syncedLyrics: null,
      plainLyrics: null,
      found: false,
      loading: true,
    });
    return;
  }

  res.status(200).json({ trackId, ...snapshot });
});
