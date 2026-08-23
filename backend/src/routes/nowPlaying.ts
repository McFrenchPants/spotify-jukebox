import { Router } from "express";
import { getNowPlayingState } from "../spotify/nowPlaying";

export const nowPlayingRouter = Router();

nowPlayingRouter.get("/", (_req, res) => {
  res.status(200).json(getNowPlayingState());
});
