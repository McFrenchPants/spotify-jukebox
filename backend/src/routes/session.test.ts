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
    expect(body.nickname).toBeNull();
    expect(body.avatar).toBeNull();
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

describe("PATCH /api/session/me", () => {
  async function createGuestToken(): Promise<string> {
    const res = await fetch(`${baseUrl}/api/session`, { method: "POST" });
    const body = (await res.json()) as any;
    return body.token;
  }

  it("sets nickname only", async () => {
    const token = await createGuestToken();

    const res = await fetch(`${baseUrl}/api/session/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ nickname: "DJ Test" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.nickname).toBe("DJ Test");
    expect(body.avatar).toBeNull();
  });

  it("sets avatar only", async () => {
    const token = await createGuestToken();

    const res = await fetch(`${baseUrl}/api/session/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ avatar: "avatar-3" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.avatar).toBe("avatar-3");
    expect(body.nickname).toBeNull();
  });

  it("sets both nickname and avatar in a single call", async () => {
    const token = await createGuestToken();

    const res = await fetch(`${baseUrl}/api/session/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ nickname: "DJ Test", avatar: "avatar-3" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.nickname).toBe("DJ Test");
    expect(body.avatar).toBe("avatar-3");
    expect(body.token).toBe(token);
    expect(body.sessionId).toBe(token);
    expect(typeof body.createdAt).toBe("string");
  });

  it("persists the profile so a subsequent POST /api/session resume reflects it", async () => {
    const token = await createGuestToken();

    await fetch(`${baseUrl}/api/session/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ nickname: "DJ Test", avatar: "avatar-3" }),
    });

    const resumeRes = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "x-guest-token": token },
    });
    const resumeBody = (await resumeRes.json()) as any;

    expect(resumeRes.status).toBe(200);
    expect(resumeBody.nickname).toBe("DJ Test");
    expect(resumeBody.avatar).toBe("avatar-3");
  });

  it("returns 400 session_required when no valid token is sent", async () => {
    const res = await fetch(`${baseUrl}/api/session/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "DJ Test" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("session_required");
  });

  it("returns 400 session_required when an unrecognized token is sent", async () => {
    const res = await fetch(`${baseUrl}/api/session/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-guest-token": "totally-garbage-token" },
      body: JSON.stringify({ nickname: "DJ Test" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("session_required");
  });

  it("returns 400 invalid_body when nickname is not a string", async () => {
    const token = await createGuestToken();

    const res = await fetch(`${baseUrl}/api/session/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ nickname: 123 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_body");
  });
});
