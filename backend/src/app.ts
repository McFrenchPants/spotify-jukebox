import fs from "fs";
import path from "path";
import express, { Express } from "express";
import { adminRouter } from "./routes/admin";
import { artistRouter } from "./routes/artist";
import { authRouter } from "./routes/auth";
import { deviceRouter } from "./routes/device";
import { eventsRouter } from "./routes/events";
import { favoritesRouter } from "./routes/favorites";
import { jukeboxDeviceStatusRouter } from "./routes/jukeboxDeviceStatus";
import { leaderboardRouter } from "./routes/leaderboard";
import { nowPlayingRouter } from "./routes/nowPlaying";
import { playbackRouter } from "./routes/playback";
import { queueRouter } from "./routes/queue";
import { recentRouter } from "./routes/recent";
import { searchRouter } from "./routes/search";
import { sessionRouter } from "./routes/session";
import { trustModeRouter } from "./routes/trustMode";

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  // CORS — permissive by design. The native Android app (Master Device Mode,
  // Capacitor-wrapped) loads its bundled frontend from its own local WebView
  // origin (e.g. capacitor://localhost) and calls this backend's LAN URL
  // directly, which makes every request genuinely cross-origin. Every route
  // in this app is either a public unauthenticated read, or protected by a
  // bearer-style header token (x-admin-token / x-guest-token) — never
  // cookies — so there is no CORS-credentials concern that would require
  // echoing a specific origin: a wildcard is safe and simplest. Hand-rolled
  // rather than pulling in the `cors` package, matching this project's
  // existing preference for small hand-rolled auth over new dependencies.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token, x-guest-token");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/admin", adminRouter);
  app.use("/api/artist", artistRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/device", deviceRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/favorites", favoritesRouter);
  app.use("/api/jukebox-device", jukeboxDeviceStatusRouter);
  app.use("/api/leaderboard", leaderboardRouter);
  app.use("/api/now-playing", nowPlayingRouter);
  app.use("/api/playback", playbackRouter);
  app.use("/api/queue", queueRouter);
  app.use("/api/recent", recentRouter);
  app.use("/api/session", sessionRouter);
  app.use("/api/trust-mode", trustModeRouter);

  // Serve the frontend's built static assets in production (single-origin
  // deployment — see docs/DESIGN_SPEC.md). Only wired up when a build is
  // actually present so local `npm run dev` (backend only, no frontend
  // build) is unaffected. Must come after the /api routes above so it never
  // intercepts an API call; the catch-all below only matches non-API paths.
  const frontendDistPath =
    process.env.FRONTEND_DIST_PATH || path.join(__dirname, "../public");
  if (fs.existsSync(path.join(frontendDistPath, "index.html"))) {
    app.use(express.static(frontendDistPath));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(frontendDistPath, "index.html"));
    });
  }

  return app;
}
