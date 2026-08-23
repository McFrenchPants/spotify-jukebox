import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../spotify/playback", () => ({
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(),
  skipToNext: vi.fn(),
  skipToPrevious: vi.fn(),
  setVolume: vi.fn(),
}));

import { db, runMigrations, setSetting } from "../db";
import { ACTIVE_MODE_KEY, ALLOW_PAUSE_RESUME_KEY, ALLOW_SKIP_KEY, ALLOW_VOLUME_KEY } from "../db/appSettings";
import { issueAdminToken } from "../auth/adminToken";
import { ADMIN_TOKEN_HEADER } from "../middleware/adminAuth";
import { pausePlayback, setVolume, skipToPrevious } from "../spotify/playback";
import { createApp } from "../app";

const DEVICE_ID = "device-under-test";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  runMigrations();
  // Real shared-file DB with no per-test reset — reset every setting we
  // touch to a known value, following the pattern in queue.test.ts.
  db.prepare(
    `DELETE FROM app_settings WHERE key IN (?, ?, ?, ?)`
  ).run(ACTIVE_MODE_KEY, ALLOW_PAUSE_RESUME_KEY, ALLOW_SKIP_KEY, ALLOW_VOLUME_KEY);
  setSetting("spotify_device_id", DEVICE_ID);

  vi.clearAllMocks();
  vi.mocked(pausePlayback).mockResolvedValue(undefined);
  vi.mocked(setVolume).mockResolvedValue(undefined);
  vi.mocked(skipToPrevious).mockResolvedValue(undefined);

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

describe("POST /api/playback/pause", () => {
  it("restricted mode + no admin token -> 403", async () => {
    setSetting(ACTIVE_MODE_KEY, "restricted");

    const res = await fetch(`${baseUrl}/api/playback/pause`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body.error).toBe("trust_mode_denied");
    expect(pausePlayback).not.toHaveBeenCalled();
  });

  it("restricted mode + valid admin token -> proceeds (admin bypass)", async () => {
    setSetting(ACTIVE_MODE_KEY, "restricted");
    const { token } = issueAdminToken();

    const res = await fetch(`${baseUrl}/api/playback/pause`, {
      method: "POST",
      headers: { [ADMIN_TOKEN_HEADER]: token },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(pausePlayback).toHaveBeenCalledTimes(1);
    expect(pausePlayback).toHaveBeenCalledWith(DEVICE_ID);
  });

  it("trusted mode + no admin token -> proceeds", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/playback/pause`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(pausePlayback).toHaveBeenCalledTimes(1);
  });

  it("device not resolved -> 503", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    db.prepare("DELETE FROM app_settings WHERE key = 'spotify_device_id'").run();

    const res = await fetch(`${baseUrl}/api/playback/pause`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("device_not_resolved");
    expect(pausePlayback).not.toHaveBeenCalled();
  });

  it("Spotify call failure -> 502", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    vi.mocked(pausePlayback).mockRejectedValueOnce(new Error("Spotify pause failed: 500"));

    const res = await fetch(`${baseUrl}/api/playback/pause`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_pause_failed");
  });
});

describe("POST /api/playback/previous", () => {
  it("restricted mode + no admin token -> 403", async () => {
    setSetting(ACTIVE_MODE_KEY, "restricted");

    const res = await fetch(`${baseUrl}/api/playback/previous`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body.error).toBe("trust_mode_denied");
    expect(skipToPrevious).not.toHaveBeenCalled();
  });

  it("restricted mode + valid admin token -> proceeds (admin bypass)", async () => {
    setSetting(ACTIVE_MODE_KEY, "restricted");
    const { token } = issueAdminToken();

    const res = await fetch(`${baseUrl}/api/playback/previous`, {
      method: "POST",
      headers: { [ADMIN_TOKEN_HEADER]: token },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(skipToPrevious).toHaveBeenCalledTimes(1);
    expect(skipToPrevious).toHaveBeenCalledWith(DEVICE_ID);
  });

  it("trusted mode + no admin token -> proceeds", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/playback/previous`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(skipToPrevious).toHaveBeenCalledTimes(1);
  });

  it("device not resolved -> 503", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    db.prepare("DELETE FROM app_settings WHERE key = 'spotify_device_id'").run();

    const res = await fetch(`${baseUrl}/api/playback/previous`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("device_not_resolved");
    expect(skipToPrevious).not.toHaveBeenCalled();
  });

  it("Spotify call failure -> 502", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    vi.mocked(skipToPrevious).mockRejectedValueOnce(new Error("Spotify previous-track failed: 500"));

    const res = await fetch(`${baseUrl}/api/playback/previous`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_previous_failed");
  });
});

describe("POST /api/playback/volume", () => {
  it("invalid volumePercent -> 400", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/playback/volume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumePercent: 150 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_volume");
    expect(setVolume).not.toHaveBeenCalled();
  });

  it("missing volumePercent -> 400", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/playback/volume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_volume");
  });

  it("restricted mode + no admin token -> 403 even with a valid volumePercent", async () => {
    setSetting(ACTIVE_MODE_KEY, "restricted");

    const res = await fetch(`${baseUrl}/api/playback/volume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumePercent: 50 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body.error).toBe("trust_mode_denied");
    expect(setVolume).not.toHaveBeenCalled();
  });

  it("trusted mode + valid volumePercent -> proceeds", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/playback/volume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumePercent: 42 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(setVolume).toHaveBeenCalledWith(42, DEVICE_ID);
  });
});
