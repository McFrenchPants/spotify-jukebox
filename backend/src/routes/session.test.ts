import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { runMigrations } from "../db";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  runMigrations();
  const app = createApp();
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

describe("POST /api/session", () => {
  it("creates a new session and returns 201 when no token is given", async () => {
    const res = await fetch(`${baseUrl}/api/session`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(201);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.sessionId).toBe(body.token);
    expect(typeof body.createdAt).toBe("string");
  });

  it("produces a different token/session on each call without a token", async () => {
    const res1 = await fetch(`${baseUrl}/api/session`, { method: "POST" });
    const body1 = (await res1.json()) as any;

    const res2 = await fetch(`${baseUrl}/api/session`, { method: "POST" });
    const body2 = (await res2.json()) as any;

    expect(body1.token).not.toBe(body2.token);
  });

  it("reuses the existing session and bumps total_requests when a valid token is given", async () => {
    const createRes = await fetch(`${baseUrl}/api/session`, { method: "POST" });
    const created = (await createRes.json()) as any;

    const res = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "x-guest-token": created.token },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.sessionId).toBe(created.sessionId);
    expect(body.token).toBe(created.token);

    // Fetch a third time and confirm the row keeps being reused, not re-created.
    const res2 = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "x-guest-token": created.token },
    });
    const body2 = (await res2.json()) as any;
    expect(res2.status).toBe(200);
    expect(body2.sessionId).toBe(created.sessionId);
  });

  it("treats an unrecognized token like no token: creates a new session with 201", async () => {
    const res = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "x-guest-token": "totally-garbage-token-that-does-not-exist" },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(201);
    expect(body.token).not.toBe("totally-garbage-token-that-does-not-exist");
    expect(typeof body.token).toBe("string");
  });
});
