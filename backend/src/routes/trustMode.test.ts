import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { db, runMigrations, setSetting } from "../db";
import {
  ACTIVE_MODE_KEY,
  ALLOW_PAUSE_RESUME_KEY,
  ALLOW_SKIP_KEY,
  ALLOW_VOLUME_KEY,
} from "../db/appSettings";
import { JUKEBOX_DEVICE_CLIENT_ID_KEY, registerJukeboxDeviceId } from "../db/jukeboxDevice";
import { clientConnected, clientDisconnected, resetJukeboxDeviceOnlineForTests } from "../events/jukeboxDeviceOnline";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  runMigrations();
  // The backing DB is a real shared file with no per-test reset, so
  // explicitly clear every setting used here to a known ("unset") state.
  db.prepare(
    `DELETE FROM app_settings WHERE key IN (?, ?, ?, ?, ?)`
  ).run(ACTIVE_MODE_KEY, ALLOW_PAUSE_RESUME_KEY, ALLOW_SKIP_KEY, ALLOW_VOLUME_KEY, JUKEBOX_DEVICE_CLIENT_ID_KEY);
  resetJukeboxDeviceOnlineForTests();

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

describe("GET /api/trust-mode", () => {
  it("defaults to all false (restricted mode, no overrides)", async () => {
    const res = await fetch(`${baseUrl}/api/trust-mode`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      pauseResume: false,
      skip: false,
      volume: false,
      jukeboxDevice: { registered: false, online: false },
    });
  });

  it("returns all true when active_mode is trusted", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/trust-mode`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      pauseResume: true,
      skip: true,
      volume: true,
      jukeboxDevice: { registered: false, online: false },
    });
  });

  it("reflects a specific override within trusted mode", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    setSetting(ALLOW_VOLUME_KEY, "false");

    const res = await fetch(`${baseUrl}/api/trust-mode`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      pauseResume: true,
      skip: true,
      volume: false,
      jukeboxDevice: { registered: false, online: false },
    });
  });

  describe("jukeboxDevice state", () => {
    it("registered: false, online: false — no Jukebox device ever registered", async () => {
      const res = await fetch(`${baseUrl}/api/trust-mode`);
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.jukeboxDevice).toEqual({ registered: false, online: false });
    });

    it("registered: true, online: false — registered but no open SSE connection", async () => {
      registerJukeboxDeviceId("jukebox-client-1");

      const res = await fetch(`${baseUrl}/api/trust-mode`);
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.jukeboxDevice).toEqual({ registered: true, online: false });
    });

    it("registered: true, online: true — registered and has an open SSE connection", async () => {
      registerJukeboxDeviceId("jukebox-client-1");
      clientConnected("jukebox-client-1");

      try {
        const res = await fetch(`${baseUrl}/api/trust-mode`);
        const body = (await res.json()) as any;

        expect(res.status).toBe(200);
        expect(body.jukeboxDevice).toEqual({ registered: true, online: true });
      } finally {
        clientDisconnected("jukebox-client-1");
      }
    });
  });
});
