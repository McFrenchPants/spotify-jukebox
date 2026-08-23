import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, string>();

vi.mock("../db", () => ({
  getSetting: vi.fn((key: string) => settings.get(key)),
  setSetting: vi.fn((key: string, value: string) => {
    settings.set(key, value);
  }),
}));

import { getSetting, setSetting } from "../db";
import { listDevices, resolveDevice } from "./device";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

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

describe("listDevices", () => {
  beforeEach(() => {
    settings.clear();
    vi.clearAllMocks();
  });

  it("shapes the Spotify devices response into Device[]", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ devices: [DEVICE_A, DEVICE_B] }));
    const getTokenFn = vi.fn().mockResolvedValue("test-token");

    const devices = await listDevices(fetchMock, getTokenFn);

    expect(devices).toEqual([DEVICE_A, DEVICE_B]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.spotify.com/v1/me/player/devices");
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe(
      "Bearer test-token"
    );
  });

  it("drops devices with a null id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ devices: [{ ...DEVICE_A, id: null }, DEVICE_B] })
    );
    const getTokenFn = vi.fn().mockResolvedValue("test-token");

    const devices = await listDevices(fetchMock, getTokenFn);

    expect(devices).toEqual([DEVICE_B]);
  });

  it("returns an empty array when there are no devices", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ devices: [] }));
    const getTokenFn = vi.fn().mockResolvedValue("test-token");

    const devices = await listDevices(fetchMock, getTokenFn);

    expect(devices).toEqual([]);
  });

  it("throws a clear error when Spotify returns a non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { status: 401, message: "Invalid access token" } }, false, 401)
    );
    const getTokenFn = vi.fn().mockResolvedValue("bad-token");

    await expect(listDevices(fetchMock, getTokenFn)).rejects.toThrow(/Spotify device list failed/);
  });

  it("propagates errors from token acquisition without crashing", async () => {
    const fetchMock = vi.fn();
    const getTokenFn = vi.fn().mockRejectedValue(new Error("No spotify_refresh_token stored"));

    await expect(listDevices(fetchMock, getTokenFn)).rejects.toThrow(/No spotify_refresh_token/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveDevice", () => {
  beforeEach(() => {
    settings.clear();
    vi.clearAllMocks();
  });

  it("resolves to the previously-selected device when it's present in the live list", async () => {
    settings.set("spotify_device_id", "device-b");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ devices: [DEVICE_A, DEVICE_B] }));
    const getTokenFn = vi.fn().mockResolvedValue("test-token");

    const result = await resolveDevice(fetchMock, getTokenFn);

    expect(result.resolved).toEqual(DEVICE_B);
    expect(result.devices).toEqual([DEVICE_A, DEVICE_B]);
    // Should not re-persist an already-stored, still-valid selection.
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("resolves and persists the single device when there's no previous selection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ devices: [DEVICE_A] }));
    const getTokenFn = vi.fn().mockResolvedValue("test-token");

    const result = await resolveDevice(fetchMock, getTokenFn);

    expect(result.resolved).toEqual(DEVICE_A);
    expect(result.devices).toEqual([DEVICE_A]);
    expect(setSetting).toHaveBeenCalledWith("spotify_device_id", "device-a");
    expect(getSetting("spotify_device_id")).toBe("device-a");
  });

  it("returns resolved: null when multiple devices are visible and there's no valid prior selection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ devices: [DEVICE_A, DEVICE_B] }));
    const getTokenFn = vi.fn().mockResolvedValue("test-token");

    const result = await resolveDevice(fetchMock, getTokenFn);

    expect(result.resolved).toBeNull();
    expect(result.devices).toEqual([DEVICE_A, DEVICE_B]);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("returns resolved: null when a stored selection is no longer present among multiple devices", async () => {
    settings.set("spotify_device_id", "stale-device-id");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ devices: [DEVICE_A, DEVICE_B] }));
    const getTokenFn = vi.fn().mockResolvedValue("test-token");

    const result = await resolveDevice(fetchMock, getTokenFn);

    expect(result.resolved).toBeNull();
    expect(result.devices).toEqual([DEVICE_A, DEVICE_B]);
  });

  it("returns resolved: null and an empty list when there are zero devices", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ devices: [] }));
    const getTokenFn = vi.fn().mockResolvedValue("test-token");

    const result = await resolveDevice(fetchMock, getTokenFn);

    expect(result.resolved).toBeNull();
    expect(result.devices).toEqual([]);
    expect(setSetting).not.toHaveBeenCalled();
  });
});
