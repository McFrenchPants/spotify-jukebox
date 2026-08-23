import express, { Express } from "express";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { deviceRouter } from "./routes/device";
import { eventsRouter } from "./routes/events";
import { leaderboardRouter } from "./routes/leaderboard";
import { queueRouter } from "./routes/queue";
import { recentRouter } from "./routes/recent";
import { searchRouter } from "./routes/search";
import { sessionRouter } from "./routes/session";

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/admin", adminRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/device", deviceRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/leaderboard", leaderboardRouter);
  app.use("/api/queue", queueRouter);
  app.use("/api/recent", recentRouter);
  app.use("/api/session", sessionRouter);

  return app;
}
