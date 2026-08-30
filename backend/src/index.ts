import dotenv from "dotenv";
import { loadHomeAssistantOptions } from "./config/homeAssistantOptions";

// Must run before dotenv.config(): in Home Assistant OS add-on mode there is
// no .env file, so this seeds process.env from the Supervisor's
// /data/options.json instead. dotenv.config() does not override already-set
// process.env values, so calling this first and letting dotenv no-op
// afterward for the same keys is safe and correct. In every other
// deployment mode (local dev, standalone Docker) /data/options.json doesn't
// exist and this is a no-op.
loadHomeAssistantOptions();

dotenv.config();

import { createApp } from "./app";
import { runMigrations } from "./db";
import { seedRefreshTokenFromEnv } from "./config/seedRefreshToken";
import { startNowPlayingPoller } from "./spotify/nowPlaying";
import { startTokenRefreshWorker } from "./spotify/tokenRefresh";
import { logInfo } from "./logger";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

runMigrations();
seedRefreshTokenFromEnv();

startTokenRefreshWorker();
startNowPlayingPoller();

const app = createApp();

app.listen(PORT, () => {
  logInfo("index", `Guest Jukebox backend listening on port ${PORT}`);
});
