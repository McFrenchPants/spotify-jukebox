import express, { Express } from "express";
import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations, setSetting } from "../db";
import { GuestSession } from "../db/guestSessions";
import {
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_WINDOW_MS_KEY,
  checkRateLimit,
  rateLimitGuestSession,
  recordAllowedRequest,
} from "./rateLimiter";

function fakeSession(sessionId: string): GuestSession {
  return {
    sessionId,
    clientIp: "127.0.0.1",
    userAgent: null,
    createdAt: new Date().toISOString(),
    lastRequestAt: new Date().toISOString(),
    totalRequests: 1,
  };
}

beforeEach(() => {
  runMigrations();
  // The backing DB is a real file shared across test files/runs (no
  // per-test reset), so explicitly reset this setting each time rather than
  // relying on it being unset — a previous test/run may have left it
  // overridden (e.g. to "100" for fast-window tests below).
  setSetting(RATE_LIMIT_WINDOW_MS_KEY, String(DEFAULT_RATE_LIMIT_WINDOW_MS));
});

describe("checkRateLimit / recordAllowedRequest", () => {
  it("allows the first request for a fresh session (no prior state)", () => {
    const result = checkRateLimit("session-fresh");
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBeUndefined();
  });

  it("uses the default 10-minute window when the setting is unset", () => {
    const sessionId = "session-default-window";
    recordAllowedRequest(sessionId);

    const result = checkRateLimit(sessionId);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(DEFAULT_RATE_LIMIT_WINDOW_MS);
    expect(result.retryAfterMs).toBeGreaterThan(DEFAULT_RATE_LIMIT_WINDOW_MS - 1000);
  });

  it("rejects a request made within the (overridden, short) window with a clear retryAfterMs", () => {
    setSetting("rate_limit_window_ms", "100");
    const sessionId = "session-second-request";

    recordAllowedRequest(sessionId);
    const result = checkRateLimit(sessionId);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows a request again after the (overridden, short) window has elapsed", async () => {
    setSetting("rate_limit_window_ms", "100");
    const sessionId = "session-window-elapsed";

    recordAllowedRequest(sessionId);
    expect(checkRateLimit(sessionId).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const result = checkRateLimit(sessionId);
    expect(result.allowed).toBe(true);
  });

  it("does not consume/reset the window merely by calling checkRateLimit repeatedly", () => {
    const sessionId = "session-check-only";

    expect(checkRateLimit(sessionId).allowed).toBe(true);
    expect(checkRateLimit(sessionId).allowed).toBe(true);
    expect(checkRateLimit(sessionId).allowed).toBe(true);
  });
});

describe("rateLimitGuestSession middleware", () => {
  let server: Server;
  let baseUrl: string;

  function buildTestApp(): Express {
    const app = express();
    app.get(
      "/probe",
      (req, _res, next) => {
        const header = req.get("x-test-session-id");
        if (header) {
          req.guestSession = fakeSession(header);
        }
        next();
      },
      rateLimitGuestSession,
      (req, res) => {
        res.status(200).json({ ok: true });
      }
    );
    return app;
  }

  beforeEach(async () => {
    runMigrations();
    setSetting(RATE_LIMIT_WINDOW_MS_KEY, String(DEFAULT_RATE_LIMIT_WINDOW_MS));
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

  it("passes through (200) when req.guestSession is absent", async () => {
    const res = await fetch(`${baseUrl}/probe`);
    expect(res.status).toBe(200);
  });

  it("calls next() and allows the request when there's no prior recorded request", async () => {
    const res = await fetch(`${baseUrl}/probe`, {
      headers: { "x-test-session-id": "mw-session-allowed" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  it("returns 429 with { error, retryAfterMs } when rate-limited, and does not itself record", async () => {
    const sessionId = "mw-session-limited";
    recordAllowedRequest(sessionId);

    const res = await fetch(`${baseUrl}/probe`, {
      headers: { "x-test-session-id": sessionId },
    });

    expect(res.status).toBe(429);
    const body = (await res.json()) as any;
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterMs).toBeGreaterThan(0);

    // Confirm the middleware itself never calls recordAllowedRequest: the
    // underlying state should be unchanged from the single manual record
    // above, meaning checkRateLimit still reports the same "not allowed"
    // status rather than having been refreshed to a later timestamp.
    const stillLimited = checkRateLimit(sessionId);
    expect(stillLimited.allowed).toBe(false);
  });
});
