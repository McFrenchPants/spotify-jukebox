import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { runMigrations } from "../db";

let server: Server;
let baseUrl: string;
const ORIGINAL_ADMIN_PIN = process.env.ADMIN_PIN;

beforeEach(async () => {
  process.env.ADMIN_PIN = "4321";
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
  process.env.ADMIN_PIN = ORIGINAL_ADMIN_PIN;
});

describe("POST /api/admin/login", () => {
  it("returns 200 with a token and expiresAt for the correct PIN", async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "4321" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    expect(typeof body.expiresAt).toBe("string");
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns 401 for an incorrect PIN", async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "0000" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(401);
    expect(typeof body.error).toBe("string");
  });

  it("returns 400 when pin is missing", async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when pin is not a string", async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: 4321 }),
    });
    expect(res.status).toBe(400);
  });

  it("issues a different token on each successful login", async () => {
    const res1 = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "4321" }),
    });
    const body1 = (await res1.json()) as any;

    const res2 = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "4321" }),
    });
    const body2 = (await res2.json()) as any;

    expect(body1.token).not.toBe(body2.token);
  });
});
