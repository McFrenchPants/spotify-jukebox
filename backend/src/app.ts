import express, { Express } from "express";
import { authRouter } from "./routes/auth";
import { deviceRouter } from "./routes/device";
import { eventsRouter } from "./routes/events";
import { searchRouter } from "./routes/search";

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/device", deviceRouter);
  app.use("/api/events", eventsRouter);

  return app;
}
