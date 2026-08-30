import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { db, runMigrations } from "../db";
import { JUKEBOX_DEVICE_CLIENT_ID_KEY, registerJukeboxDeviceId } from "../db/jukeboxDevice";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
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
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("GET /api/jukebox-device/mine", () => {
  it("returns 400 when clientId query param is missing", async () => {
    const res = await fetch(`${baseUrl}/api/jukebox-device/mine`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "clientId is required" });
  });

  it("returns isRegistered: false when nothing has ever been registered", async () => {
    const res = await fetch(`${baseUrl}/api/jukebox-device/mine?clientId=some-client`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ isRegistered: false });
  });

  it("returns isRegistered: true when the query clientId matches the registered device", async () => {
    registerJukeboxDeviceId("device-abc");

    const res = await fetch(`${baseUrl}/api/jukebox-device/mine?clientId=device-abc`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ isRegistered: true });
  });

  it("returns isRegistered: false when the query clientId does not match the registered device", async () => {
    registerJukeboxDeviceId("device-abc");

    const res = await fetch(`${baseUrl}/api/jukebox-device/mine?clientId=device-xyz`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ isRegistered: false });
  });

  it("works with no headers at all — no auth required", async () => {
    const res = await fetch(`${baseUrl}/api/jukebox-device/mine?clientId=device-abc`, {
      headers: {},
    });

    expect(res.status).toBe(200);
  });
});
