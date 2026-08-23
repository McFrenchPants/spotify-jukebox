import { Router } from "express";
import { subscribe } from "../events/bus";

export const eventsRouter = Router();

/** How often to send a keep-alive comment to hold the connection through proxy/browser timeouts. */
export const HEARTBEAT_INTERVAL_MS = 15000;

eventsRouter.get("/", (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Disable proxy buffering (e.g. nginx) so events flush immediately.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const unsubscribe = subscribe((event) => {
    res.write(`event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on("close", cleanup);
});
