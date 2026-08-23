import express, { Express } from "express";
import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../db";
import { createGuestSession } from "../db/guestSessions";
import { resolveGuestSession } from "./guestSession";

let server: Server;
let baseUrl: string;

function buildTestApp(): Express {
  const app = express();
  app.get("/probe", resolveGuestSession, (req, res) => {
    res.status(200).json({ guestSession: req.guestSession ?? null });
  });
  return app;
}

beforeEach(async () => {
  runMigrations();
  const app = buildTestApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("resolveGuestSession middleware", () => {
  it("attaches req.guestSession and bumps total_requests for a valid token", async () => {
    const session = createGuestSession("127.0.0.1", "test-agent");

    const res = await fetch(`${baseUrl}/probe`, {
      headers: { "x-guest-token": session.sessionId },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.guestSession).not.toBeNull();
    expect(body.guestSession.sessionId).toBe(session.sessionId);
    expect(body.guestSession.totalRequests).toBe(session.totalRequests + 1);
  });

  it("leaves req.guestSession undefined and still calls next() when no token is given", async () => {
    const res = await fetch(`${baseUrl}/probe`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.guestSession).toBeNull();
  });

  it("leaves req.guestSession undefined and does not block the request for an invalid token", async () => {
    const res = await fetch(`${baseUrl}/probe`, {
      headers: { "x-guest-token": "not-a-real-session" },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.guestSession).toBeNull();
  });
});
