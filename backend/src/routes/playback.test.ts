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

vi.mock("../spotify/nowPlaying", () => ({
  triggerImmediateNowPlayingPoll: vi.fn(),
}));

import { db, runMigrations, setSetting } from "../db";
import { ACTIVE_MODE_KEY, ALLOW_PAUSE_RESUME_KEY, ALLOW_SKIP_KEY, ALLOW_VOLUME_KEY } from "../db/appSettings";
import { JUKEBOX_DEVICE_CLIENT_ID_KEY, registerJukeboxDeviceId } from "../db/jukeboxDevice";
import { clientConnected, clientDisconnected, resetJukeboxDeviceOnlineForTests } from "../events/jukeboxDeviceOnline";
import { subscribe } from "../events/bus";
import { issueAdminToken } from "../auth/adminToken";
import { ADMIN_TOKEN_HEADER } from "../middleware/adminAuth";
import { pausePlayback, resumePlayback, setVolume, skipToNext, skipToPrevious } from "../spotify/playback";
import { triggerImmediateNowPlayingPoll } from "../spotify/nowPlaying";
import { createApp } from "../app";

const DEVICE_ID = "device-under-test";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  runMigrations();
  // Real shared-file DB with no per-test reset — reset every setting we
  // touch to a known value, following the pattern in queue.test.ts.
  db.prepare(
    `DELETE FROM app_settings WHERE key IN (?, ?, ?, ?, ?)`
  ).run(ACTIVE_MODE_KEY, ALLOW_PAUSE_RESUME_KEY, ALLOW_SKIP_KEY, ALLOW_VOLUME_KEY, JUKEBOX_DEVICE_CLIENT_ID_KEY);
  setSetting("spotify_device_id", DEVICE_ID);
  resetJukeboxDeviceOnlineForTests();

  vi.clearAllMocks();
  vi.mocked(pausePlayback).mockResolvedValue(undefined);
  vi.mocked(resumePlayback).mockResolvedValue(undefined);
  vi.mocked(skipToNext).mockResolvedValue(undefined);
  vi.mocked(setVolume).mockResolvedValue(undefined);
  vi.mocked(skipToPrevious).mockResolvedValue(undefined);
  vi.mocked(triggerImmediateNowPlayingPoll).mockResolvedValue(undefined);

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
    expect(triggerImmediateNowPlayingPoll).toHaveBeenCalledTimes(1);
  });

  it("trusted mode + no admin token -> proceeds", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/playback/pause`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(pausePlayback).toHaveBeenCalledTimes(1);
    expect(triggerImmediateNowPlayingPoll).toHaveBeenCalledTimes(1);
  });

  it("device not resolved -> 503", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    db.prepare("DELETE FROM app_settings WHERE key = 'spotify_device_id'").run();

    const res = await fetch(`${baseUrl}/api/playback/pause`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("device_not_resolved");
    expect(pausePlayback).not.toHaveBeenCalled();
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
  });

  it("Spotify call failure -> 502", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    vi.mocked(pausePlayback).mockRejectedValueOnce(new Error("Spotify pause failed: 500"));

    const res = await fetch(`${baseUrl}/api/playback/pause`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_pause_failed");
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
  });
});

describe("POST /api/playback/resume", () => {
  it("restricted mode + no admin token -> 403", async () => {
    setSetting(ACTIVE_MODE_KEY, "restricted");

    const res = await fetch(`${baseUrl}/api/playback/resume`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body.error).toBe("trust_mode_denied");
    expect(resumePlayback).not.toHaveBeenCalled();
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
  });

  it("trusted mode + no admin token -> proceeds and triggers an immediate poll", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/playback/resume`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(resumePlayback).toHaveBeenCalledTimes(1);
    expect(resumePlayback).toHaveBeenCalledWith(DEVICE_ID);
    expect(triggerImmediateNowPlayingPoll).toHaveBeenCalledTimes(1);
  });

  it("device not resolved -> 503", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    db.prepare("DELETE FROM app_settings WHERE key = 'spotify_device_id'").run();

    const res = await fetch(`${baseUrl}/api/playback/resume`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("device_not_resolved");
    expect(resumePlayback).not.toHaveBeenCalled();
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
  });

  it("Spotify call failure -> 502, no trigger", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    vi.mocked(resumePlayback).mockRejectedValueOnce(new Error("Spotify resume failed: 500"));

    const res = await fetch(`${baseUrl}/api/playback/resume`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_resume_failed");
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
  });
});

describe("POST /api/playback/skip", () => {
  it("restricted mode + no admin token -> 403", async () => {
    setSetting(ACTIVE_MODE_KEY, "restricted");

    const res = await fetch(`${baseUrl}/api/playback/skip`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(403);
    expect(body.error).toBe("trust_mode_denied");
    expect(skipToNext).not.toHaveBeenCalled();
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
  });

  it("trusted mode + no admin token -> proceeds and triggers an immediate poll", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/playback/skip`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(skipToNext).toHaveBeenCalledTimes(1);
    expect(skipToNext).toHaveBeenCalledWith(DEVICE_ID);
    expect(triggerImmediateNowPlayingPoll).toHaveBeenCalledTimes(1);
  });

  it("device not resolved -> 503", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    db.prepare("DELETE FROM app_settings WHERE key = 'spotify_device_id'").run();

    const res = await fetch(`${baseUrl}/api/playback/skip`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("device_not_resolved");
    expect(skipToNext).not.toHaveBeenCalled();
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
  });

  it("Spotify call failure -> 502, no trigger", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    vi.mocked(skipToNext).mockRejectedValueOnce(new Error("Spotify skip failed: 500"));

    const res = await fetch(`${baseUrl}/api/playback/skip`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_skip_failed");
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
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
    expect(triggerImmediateNowPlayingPoll).toHaveBeenCalledTimes(1);
  });

  it("trusted mode + no admin token -> proceeds", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/playback/previous`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(skipToPrevious).toHaveBeenCalledTimes(1);
    expect(triggerImmediateNowPlayingPoll).toHaveBeenCalledTimes(1);
  });

  it("device not resolved -> 503", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    db.prepare("DELETE FROM app_settings WHERE key = 'spotify_device_id'").run();

    const res = await fetch(`${baseUrl}/api/playback/previous`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("device_not_resolved");
    expect(skipToPrevious).not.toHaveBeenCalled();
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
  });

  it("Spotify call failure -> 502", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    vi.mocked(skipToPrevious).mockRejectedValueOnce(new Error("Spotify previous-track failed: 500"));

    const res = await fetch(`${baseUrl}/api/playback/previous`, { method: "POST" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_previous_failed");
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
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
    expect(triggerImmediateNowPlayingPoll).not.toHaveBeenCalled();
  });

  it("no Jukebox device registered -> existing Spotify-volume-API path unchanged", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");

    const res = await fetch(`${baseUrl}/api/playback/volume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumePercent: 37 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(setVolume).toHaveBeenCalledTimes(1);
    expect(setVolume).toHaveBeenCalledWith(37, DEVICE_ID);
  });

  it("Jukebox device registered but offline -> falls back to Spotify-volume-API path unchanged", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    registerJukeboxDeviceId("jukebox-client-1");
    // Registered, but no SSE connection is open — isJukeboxDeviceOnline() is false.

    const res = await fetch(`${baseUrl}/api/playback/volume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumePercent: 55 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(setVolume).toHaveBeenCalledTimes(1);
    expect(setVolume).toHaveBeenCalledWith(55, DEVICE_ID);
  });

  it("Jukebox device registered and online -> emits jukebox-volume-command instead of calling Spotify", async () => {
    setSetting(ACTIVE_MODE_KEY, "trusted");
    registerJukeboxDeviceId("jukebox-client-1");
    clientConnected("jukebox-client-1");

    const received: Array<{ name: string; data: unknown }> = [];
    const unsubscribe = subscribe((event) => received.push(event));

    try {
      const res = await fetch(`${baseUrl}/api/playback/volume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volumePercent: 68 }),
      });
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body).toEqual({ status: "ok" });
      expect(setVolume).not.toHaveBeenCalled();
      expect(received).toContainEqual({
        name: "jukebox-volume-command",
        data: { volumePercent: 68 },
      });
    } finally {
      unsubscribe();
      clientDisconnected("jukebox-client-1");
    }
  });

  it("Jukebox device registered and online -> still gated by trust mode (403, no event)", async () => {
    setSetting(ACTIVE_MODE_KEY, "restricted");
    registerJukeboxDeviceId("jukebox-client-1");
    clientConnected("jukebox-client-1");

    const received: Array<{ name: string; data: unknown }> = [];
    const unsubscribe = subscribe((event) => received.push(event));

    try {
      const res = await fetch(`${baseUrl}/api/playback/volume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volumePercent: 20 }),
      });
      const body = (await res.json()) as any;

      expect(res.status).toBe(403);
      expect(body.error).toBe("trust_mode_denied");
      expect(setVolume).not.toHaveBeenCalled();
      expect(received).toHaveLength(0);
    } finally {
      unsubscribe();
      clientDisconnected("jukebox-client-1");
    }
  });
});
