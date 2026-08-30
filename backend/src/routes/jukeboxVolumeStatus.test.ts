import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { db, runMigrations } from "../db";
import { JUKEBOX_DEVICE_CLIENT_ID_KEY, registerJukeboxDeviceId } from "../db/jukeboxDevice";
import { subscribe } from "../events/bus";
import { reportJukeboxVolumePercent, resetJukeboxVolumeStatusForTests } from "../events/jukeboxVolumeStatus";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  runMigrations();

  // The backing DB is a real shared file with no per-test reset, so
  // explicitly reset the setting this suite touches to a known state.
  db.prepare("DELETE FROM app_settings WHERE key = ?").run(JUKEBOX_DEVICE_CLIENT_ID_KEY);
  resetJukeboxVolumeStatusForTests();

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

describe("GET /api/playback/jukebox-volume", () => {
  it("returns volumePercent: null when nothing has ever been reported", async () => {
    const res = await fetch(`${baseUrl}/api/playback/jukebox-volume`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ volumePercent: null });
  });

  it("works with no headers at all — no auth required", async () => {
    const res = await fetch(`${baseUrl}/api/playback/jukebox-volume`, { headers: {} });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/playback/jukebox-volume-report", () => {
  it("returns 403 when no Jukebox device is registered at all", async () => {
    const res = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "some-client", volumePercent: 50 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "not_registered_device" });
  });

  it("returns 403 and does not record the value when clientId does not match the registered device", async () => {
    registerJukeboxDeviceId("device-abc");

    const res = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "device-xyz", volumePercent: 60 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "not_registered_device" });

    const getRes = await fetch(`${baseUrl}/api/playback/jukebox-volume`);
    const getBody = (await getRes.json()) as any;
    expect(getBody).toEqual({ volumePercent: null });
  });

  it("returns 200 and records the value when clientId matches the registered device", async () => {
    registerJukeboxDeviceId("device-abc");

    const res = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "device-abc", volumePercent: 42 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });

    const getRes = await fetch(`${baseUrl}/api/playback/jukebox-volume`);
    const getBody = (await getRes.json()) as any;
    expect(getBody).toEqual({ volumePercent: 42 });
  });

  it("returns 400 for an out-of-range volumePercent", async () => {
    registerJukeboxDeviceId("device-abc");

    const res = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "device-abc", volumePercent: 150 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_volume");
  });

  it("returns 400 for a non-integer volumePercent", async () => {
    registerJukeboxDeviceId("device-abc");

    const res = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "device-abc", volumePercent: 12.5 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_volume");
  });

  it("returns 400 when clientId is missing", async () => {
    registerJukeboxDeviceId("device-abc");

    const res = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumePercent: 50 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "clientId is required" });
  });

  it("returns 400 when clientId is empty", async () => {
    registerJukeboxDeviceId("device-abc");

    const res = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "", volumePercent: 50 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "clientId is required" });
  });

  it("works with no auth headers beyond content-type — no auth required", async () => {
    registerJukeboxDeviceId("device-abc");

    const res = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "device-abc", volumePercent: 10 }),
    });

    expect(res.status).toBe(200);
  });

  it("does not re-emit / re-report change when the same value is reported twice, but still reflects it on GET", async () => {
    registerJukeboxDeviceId("device-abc");

    const first = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "device-abc", volumePercent: 30 }),
    });
    expect(first.status).toBe(200);

    // Reporting the same value again should still succeed (200) even though
    // internally reportJukeboxVolumePercent() skips emitting a duplicate
    // SSE event — this test exercises that path without reaching into the
    // event bus directly.
    const second = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "device-abc", volumePercent: 30 }),
    });
    expect(second.status).toBe(200);

    const getRes = await fetch(`${baseUrl}/api/playback/jukebox-volume`);
    const getBody = (await getRes.json()) as any;
    expect(getBody).toEqual({ volumePercent: 30 });

    // A subsequent different value should still update it.
    const third = await fetch(`${baseUrl}/api/playback/jukebox-volume-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "device-abc", volumePercent: 31 }),
    });
    expect(third.status).toBe(200);

    const getRes2 = await fetch(`${baseUrl}/api/playback/jukebox-volume`);
    const getBody2 = (await getRes2.json()) as any;
    expect(getBody2).toEqual({ volumePercent: 31 });
  });
});

describe("reportJukeboxVolumePercent (unit, event bus)", () => {
  it("emits jukebox-volume-status only when the value actually changes", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.name === "jukebox-volume-status") {
        received.push(event.data);
      }
    });

    try {
      reportJukeboxVolumePercent(20); // unset -> 20: emits
      reportJukeboxVolumePercent(20); // unchanged: no emit
      reportJukeboxVolumePercent(20); // unchanged: no emit
      reportJukeboxVolumePercent(21); // changed: emits

      expect(received).toEqual([{ volumePercent: 20 }, { volumePercent: 21 }]);
    } finally {
      unsubscribe();
    }
  });
});
