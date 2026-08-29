import { Router } from "express";
import { subscribe } from "../events/bus";
import { clientConnected, clientDisconnected } from "../events/jukeboxDeviceOnline";

export const eventsRouter = Router();

/** How often to send a keep-alive comment to hold the connection through proxy/browser timeouts. */
export const HEARTBEAT_INTERVAL_MS = 15000;

eventsRouter.get("/", (req, res) => {
  // Optional self-reported identifier, used only to track connect/disconnect
  // of the Jukebox device (M1.2) for `isJukeboxDeviceOnline()`. This is a
  // public, unauthenticated stream, so clientId is not — and must never be
  // treated as — an auth mechanism; omitting it is fully backward compatible
  // (no tracking, no jukebox-device-status events for that connection).
  const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Disable proxy buffering (e.g. nginx) so events flush immediately.
  res.setHeader("X-Accel-Buffering", "no");
  // Vite's dev-server proxy doesn't reliably stream this endpoint (observed
  // hang: the proxy's own 'proxyRes' event fires promptly, but nothing ever
  // reaches the browser — reproduced on a fresh restart with zero prior
  // connections, so not a leaked-connection artifact; root cause not fully
  // isolated, tried extending proxy timeouts and a hand-rolled raw-socket
  // proxy middleware, neither fixed it). The frontend dev build connects
  // directly to this backend origin for just this one endpoint instead of
  // going through the Vite proxy (see frontend/src/hooks/useEventStream.ts),
  // which needs this CORS header. Safe to leave permissive in production
  // too: this is an unauthenticated, public, read-only stream carrying no
  // credentials — anyone who can reach it can already read it directly.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders?.();

  const unsubscribe = subscribe((event) => {
    res.write(`event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, HEARTBEAT_INTERVAL_MS);

  if (clientId) {
    clientConnected(clientId);
  }

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
    if (clientId) {
      clientDisconnected(clientId);
    }
  };

  req.on("close", cleanup);
});
