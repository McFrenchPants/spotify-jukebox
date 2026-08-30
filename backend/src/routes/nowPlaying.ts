import { Router } from "express";
import { getLastPolledAt, getNowPlayingState } from "../spotify/nowPlaying";
import { isRateLimited } from "../spotify/rateLimitBackoff";

export const nowPlayingRouter = Router();

nowPlayingRouter.get("/", (_req, res) => {
  res.status(200).json({
    ...getNowPlayingState(),
    // Lets consumers (including a full page reload) tell a live snapshot
    // apart from one frozen by an active rate-limit backoff window — see
    // BACKLOG.md item 9 "Bug A". rateLimited is read fresh here, not cached,
    // since a backoff window can arm/expire between polls.
    polledAt: getLastPolledAt(),
    rateLimited: isRateLimited(),
  });
});
