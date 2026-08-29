import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { db, runMigrations } from "../db";
import { JUKEBOX_DEVICE_CLIENT_ID_KEY } from "../db/jukeboxDevice";

let server: Server;
let baseUrl: string;
let adminToken: string;
const ORIGINAL_ADMIN_PIN = process.env.ADMIN_PIN;

async function login(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: "4321" }),
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

beforeEach(async () => {
  process.env.ADMIN_PIN = "4321";
  runMigrations();

  // The backing DB is a real shared file with no per-test reset, so
  // explicitly reset the setting this suite touches to a known state.
  db.prepare("DELETE FROM app_settings WHERE key = ?").run(JUKEBOX_DEVICE_CLIENT_ID_KEY);

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  adminToken = await login();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.env.ADMIN_PIN = ORIGINAL_ADMIN_PIN;
});

describe("GET /api/admin/jukebox-device", () => {
  it("returns 401 without a valid admin token", async () => {
    const res = await fetch(`${baseUrl}/api/admin/jukebox-device`);
    expect(res.status).toBe(401);
  });

  it("returns clientId: null when nothing has ever been registered", async () => {
    const res = await fetch(`${baseUrl}/api/admin/jukebox-device`, {
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ clientId: null });
  });
});

describe("POST /api/admin/jukebox-device/register", () => {
  it("returns 401 without a valid admin token", async () => {
    const res = await fetch(`${baseUrl}/api/admin/jukebox-device/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "device-abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("registers a clientId and GET reflects it", async () => {
    const postRes = await fetch(`${baseUrl}/api/admin/jukebox-device/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ clientId: "device-abc" }),
    });
    const postBody = (await postRes.json()) as any;

    expect(postRes.status).toBe(200);
    expect(postBody).toEqual({ clientId: "device-abc" });

    const getRes = await fetch(`${baseUrl}/api/admin/jukebox-device`, {
      headers: { "x-admin-token": adminToken },
    });
    const getBody = (await getRes.json()) as any;
    expect(getBody).toEqual({ clientId: "device-abc" });
  });

  it("registering a second clientId supersedes the first — GET shows only the new one", async () => {
    await fetch(`${baseUrl}/api/admin/jukebox-device/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ clientId: "device-abc" }),
    });
    await fetch(`${baseUrl}/api/admin/jukebox-device/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ clientId: "device-xyz" }),
    });

    const getRes = await fetch(`${baseUrl}/api/admin/jukebox-device`, {
      headers: { "x-admin-token": adminToken },
    });
    const getBody = (await getRes.json()) as any;
    expect(getBody).toEqual({ clientId: "device-xyz" });
  });

  it("returns 400 when clientId is missing", async () => {
    const res = await fetch(`${baseUrl}/api/admin/jukebox-device/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when clientId is an empty string", async () => {
    const res = await fetch(`${baseUrl}/api/admin/jukebox-device/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ clientId: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when clientId is not a string", async () => {
    const res = await fetch(`${baseUrl}/api/admin/jukebox-device/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ clientId: 12345 }),
    });
    expect(res.status).toBe(400);
  });
});
