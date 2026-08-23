import dotenv from "dotenv";

dotenv.config();

import { createApp } from "./app";
import { runMigrations } from "./db";
import { startNowPlayingPoller } from "./spotify/nowPlaying";
import { startTokenRefreshWorker } from "./spotify/tokenRefresh";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

runMigrations();

startTokenRefreshWorker();
startNowPlayingPoller();

const app = createApp();

app.listen(PORT, () => {
  console.log(`Guest Jukebox backend listening on port ${PORT}`);
});
