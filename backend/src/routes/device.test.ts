import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../spotify/device", () => ({
  resolveDevice: vi.fn(),
  listDevices: vi.fn(),
}));

vi.mock("../db", () => ({
  setSetting: vi.fn(),
}));

import { listDevices, resolveDevice } from "../spotify/device";
import { setSetting } from "../db";
import { createApp } from "../app";

const DEVICE_A = {
  id: "device-a",
  name: "Kitchen Phone",
  type: "Smartphone",
  is_active: true,
  volume_percent: 80,
};

const DEVICE_B = {
  id: "device-b",
  name: "Living Room Speaker",
  type: "Speaker",
  is_active: false,
  volume_percent: 50,
};

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
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

describe("GET /api/device", () => {
  it("returns the resolved device and full device list", async () => {
    vi.mocked(resolveDevice).mockResolvedValue({ resolved: DEVICE_A, devices: [DEVICE_A, DEVICE_B] });

    const res = await fetch(`${baseUrl}/api/device`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ resolved: DEVICE_A, devices: [DEVICE_A, DEVICE_B] });
  });

  it("returns resolved: null when ambiguous", async () => {
    vi.mocked(resolveDevice).mockResolvedValue({ resolved: null, devices: [DEVICE_A, DEVICE_B] });

    const res = await fetch(`${baseUrl}/api/device`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.resolved).toBeNull();
  });

  it("returns 503 with a clear message when Spotify hasn't been connected yet", async () => {
    vi.mocked(resolveDevice).mockRejectedValue(
      new Error("No spotify_refresh_token stored yet — skip refresh until consent is completed.")
    );

    const res = await fetch(`${baseUrl}/api/device`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("spotify_not_connected");
  });

  it("returns 502 when the Spotify device lookup fails", async () => {
    vi.mocked(resolveDevice).mockRejectedValue(new Error("Spotify device list failed: 500"));

    const res = await fetch(`${baseUrl}/api/device`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_device_lookup_failed");
  });
});

describe("POST /api/device/select", () => {
  it("persists and returns the device when the given id is currently visible", async () => {
    vi.mocked(listDevices).mockResolvedValue([DEVICE_A, DEVICE_B]);

    const res = await fetch(`${baseUrl}/api/device/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "device-b" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual(DEVICE_B);
    expect(setSetting).toHaveBeenCalledWith("spotify_device_id", "device-b");
  });

  it("returns 400 and does not persist when the id isn't in the current device list", async () => {
    vi.mocked(listDevices).mockResolvedValue([DEVICE_A]);

    const res = await fetch(`${baseUrl}/api/device/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "not-visible" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("device_not_found");
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("returns 400 when deviceId is missing from the body", async () => {
    const res = await fetch(`${baseUrl}/api/device/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("missing_device_id");
    expect(listDevices).not.toHaveBeenCalled();
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("returns 503 when Spotify hasn't been connected yet", async () => {
    vi.mocked(listDevices).mockRejectedValue(
      new Error("No spotify_refresh_token stored yet — skip refresh until consent is completed.")
    );

    const res = await fetch(`${baseUrl}/api/device/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "device-a" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("spotify_not_connected");
  });
});
