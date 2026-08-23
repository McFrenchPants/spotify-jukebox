import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../spotify/queueSync", () => ({
  resyncSpotifyQueue: vi.fn(),
}));

vi.mock("../events/bus", async () => {
  const actual = await vi.importActual<typeof import("../events/bus")>("../events/bus");
  return { ...actual, emitEvent: vi.fn() };
});

import { createApp } from "../app";
import { db, runMigrations, setSetting } from "../db";
import { insertQueueEntry, listQueueEntries } from "../db/queueEntries";
import { isTrackBlacklisted } from "../db/trackStats";
import { isArtistBlacklisted } from "../db/artistBlacklist";
import { emitEvent } from "../events/bus";
import { resyncSpotifyQueue } from "../spotify/queueSync";
import { checkBlacklist } from "../guardrails/queueGuardrails";

const DEVICE_ID = "device-under-test";

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

function addEntry(spotifyTrackId: string) {
  return insertQueueEntry({
    spotifyTrackId,
    trackName: `Song ${spotifyTrackId}`,
    artistName: "Some Artist",
    albumArtUrl: null,
    durationMs: 200_000,
    addedBySessionId: null,
  });
}

beforeEach(async () => {
  process.env.ADMIN_PIN = "4321";
  runMigrations();
  db.prepare("DELETE FROM queue_entries").run();
  db.prepare("DELETE FROM track_stats").run();
  db.prepare("DELETE FROM app_settings WHERE key IN ('spotify_device_id', 'blacklisted_artists')").run();

  vi.clearAllMocks();
  vi.mocked(resyncSpotifyQueue).mockResolvedValue(undefined);

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

describe("GET /api/admin/queue", () => {
  it("returns 401 without a valid admin token", async () => {
    const res = await fetch(`${baseUrl}/api/admin/queue`);
    expect(res.status).toBe(401);
  });

  it("returns queue entries in order", async () => {
    addEntry("track-1");
    addEntry("track-2");

    const res = await fetch(`${baseUrl}/api/admin/queue`, {
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(body.map((e) => e.spotifyTrackId)).toEqual(["track-1", "track-2"]);
  });
});

describe("DELETE /api/admin/queue/:id", () => {
  it("returns 401 without a valid admin token", async () => {
    const res = await fetch(`${baseUrl}/api/admin/queue/1`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-integer id", async () => {
    const res = await fetch(`${baseUrl}/api/admin/queue/not-a-number`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an id that doesn't exist", async () => {
    const res = await fetch(`${baseUrl}/api/admin/queue/999999`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any;
    expect(res.status).toBe(404);
    expect(body.error).toBe("queue_entry_not_found");
  });

  it("returns 503 when no device is resolved, after already deleting locally", async () => {
    const id = addEntry("track-1");

    const res = await fetch(`${baseUrl}/api/admin/queue/${id}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("device_not_resolved");
    // The local delete already happened even though the resync couldn't run.
    expect(listQueueEntries()).toHaveLength(0);
    expect(resyncSpotifyQueue).not.toHaveBeenCalled();
  });

  it("deletes locally, calls resyncSpotifyQueue, emits queue-update, and returns 200 on success", async () => {
    setSetting("spotify_device_id", DEVICE_ID);
    const id = addEntry("track-1");
    addEntry("track-2");

    const res = await fetch(`${baseUrl}/api/admin/queue/${id}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(listQueueEntries().map((e) => e.spotifyTrackId)).toEqual(["track-2"]);
    expect(resyncSpotifyQueue).toHaveBeenCalledWith(DEVICE_ID);
    expect(emitEvent).toHaveBeenCalledWith("queue-update", { removed: id });
  });

  it("returns 502 when resync fails", async () => {
    setSetting("spotify_device_id", DEVICE_ID);
    vi.mocked(resyncSpotifyQueue).mockRejectedValueOnce(new Error("spotify blew up"));
    const id = addEntry("track-1");

    const res = await fetch(`${baseUrl}/api/admin/queue/${id}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_resync_failed");
    expect(emitEvent).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/queue/clear", () => {
  it("returns 401 without a valid admin token", async () => {
    const res = await fetch(`${baseUrl}/api/admin/queue/clear`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 503 when no device is resolved, after already clearing locally", async () => {
    addEntry("track-1");
    addEntry("track-2");

    const res = await fetch(`${baseUrl}/api/admin/queue/clear`, {
      method: "POST",
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("device_not_resolved");
    expect(listQueueEntries()).toHaveLength(0);
  });

  it("clears locally, calls resyncSpotifyQueue, emits queue-update, and returns 200 on success", async () => {
    setSetting("spotify_device_id", DEVICE_ID);
    addEntry("track-1");
    addEntry("track-2");

    const res = await fetch(`${baseUrl}/api/admin/queue/clear`, {
      method: "POST",
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(listQueueEntries()).toHaveLength(0);
    expect(resyncSpotifyQueue).toHaveBeenCalledWith(DEVICE_ID);
    expect(emitEvent).toHaveBeenCalledWith("queue-update", { cleared: true });
  });

  it("returns 502 when resync fails", async () => {
    setSetting("spotify_device_id", DEVICE_ID);
    vi.mocked(resyncSpotifyQueue).mockRejectedValueOnce(new Error("spotify blew up"));

    const res = await fetch(`${baseUrl}/api/admin/queue/clear`, {
      method: "POST",
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_resync_failed");
  });
});

describe("POST /api/admin/blacklist", () => {
  it("returns 401 without a valid admin token", async () => {
    const res = await fetch(`${baseUrl}/api/admin/blacklist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "track", value: "track-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid type", async () => {
    const res = await fetch(`${baseUrl}/api/admin/blacklist`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ type: "album", value: "foo" }),
    });
    const body = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_blacklist_request");
  });

  it("returns 400 for an empty value", async () => {
    const res = await fetch(`${baseUrl}/api/admin/blacklist`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ type: "track", value: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("blacklists a track by id and emits leaderboard-update", async () => {
    const res = await fetch(`${baseUrl}/api/admin/blacklist`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ type: "track", value: "track-1" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(isTrackBlacklisted("track-1")).toBe(true);
    expect(emitEvent).toHaveBeenCalledWith("leaderboard-update", {
      blacklisted: { type: "track", value: "track-1" },
    });

    const guardResult = checkBlacklist("track-1", "Any Artist");
    expect(guardResult.allowed).toBe(false);
  });

  it("blacklists an artist by name and emits leaderboard-update", async () => {
    const res = await fetch(`${baseUrl}/api/admin/blacklist`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ type: "artist", value: "Some Artist" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(isArtistBlacklisted("some artist")).toBe(true);
    expect(emitEvent).toHaveBeenCalledWith("leaderboard-update", {
      blacklisted: { type: "artist", value: "Some Artist" },
    });

    const guardResult = checkBlacklist("some-other-track-id", "some artist");
    expect(guardResult.allowed).toBe(false);
  });
});
