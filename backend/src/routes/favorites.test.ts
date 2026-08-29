import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../spotify/client", async () => {
  const actual = await vi.importActual<typeof import("../spotify/client")>("../spotify/client");
  return { ...actual, getTrack: vi.fn() };
});

vi.mock("../events/bus", async () => {
  const actual = await vi.importActual<typeof import("../events/bus")>("../events/bus");
  return { ...actual, emitEvent: vi.fn() };
});

import { db, runMigrations } from "../db";
import { emitEvent } from "../events/bus";
import { getTrack } from "../spotify/client";
import { createApp } from "../app";

const TRACK_1 = {
  id: "track-1",
  name: "Song One",
  artist: "Artist A",
  albumArt: "https://example.com/one.jpg",
  durationMs: 200_000,
  explicit: false,
};

const TRACK_2 = {
  id: "track-2",
  name: "Song Two",
  artist: "Artist B",
  albumArt: null,
  durationMs: 210_000,
  explicit: false,
};

let server: Server;
let baseUrl: string;

async function createGuestToken(): Promise<{ token: string; sessionId: string }> {
  const res = await fetch(`${baseUrl}/api/session`, { method: "POST" });
  const body = (await res.json()) as any;
  return { token: body.token, sessionId: body.sessionId };
}

beforeEach(async () => {
  runMigrations();
  db.prepare("DELETE FROM favorites").run();

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

describe("POST /api/favorites", () => {
  it("returns 400 when there is no guest session", async () => {
    const res = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("session_required");
    expect(getTrack).not.toHaveBeenCalled();
  });

  it("returns 400 when trackId is missing", async () => {
    const { token } = await createGuestToken();

    const res = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("missing_track_id");
    expect(getTrack).not.toHaveBeenCalled();
  });

  it("happy path: 201, favorite persisted, favorites-update emitted", async () => {
    vi.mocked(getTrack).mockResolvedValue(TRACK_1);
    const { token, sessionId } = await createGuestToken();

    const res = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(201);
    expect(body).toEqual(TRACK_1);

    const listRes = await fetch(`${baseUrl}/api/favorites`, {
      headers: { "x-guest-token": token },
    });
    const listBody = (await listRes.json()) as any[];
    expect(listBody).toHaveLength(1);
    expect(listBody[0]).toMatchObject({ spotifyTrackId: "track-1" });

    expect(emitEvent).toHaveBeenCalledWith(
      "favorites-update",
      expect.objectContaining({ trackId: "track-1", guestSessionId: sessionId })
    );
  });

  it("adding the same track twice is idempotent (still one row)", async () => {
    vi.mocked(getTrack).mockResolvedValue(TRACK_1);
    const { token } = await createGuestToken();

    const res1 = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    expect(res1.status).toBe(201);

    const res2 = await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    expect(res2.status).toBe(201);

    const listRes = await fetch(`${baseUrl}/api/favorites`, {
      headers: { "x-guest-token": token },
    });
    const listBody = (await listRes.json()) as any[];
    expect(listBody).toHaveLength(1);
  });
});

describe("DELETE /api/favorites/:trackId", () => {
  it("returns 400 when there is no guest session", async () => {
    const res = await fetch(`${baseUrl}/api/favorites/track-1`, { method: "DELETE" });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("session_required");
  });

  it("removes a favorite: 204, no longer listed, favorites-update emitted", async () => {
    vi.mocked(getTrack).mockResolvedValue(TRACK_1);
    const { token, sessionId } = await createGuestToken();

    await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    vi.mocked(emitEvent).mockClear();

    const res = await fetch(`${baseUrl}/api/favorites/track-1`, {
      method: "DELETE",
      headers: { "x-guest-token": token },
    });
    expect(res.status).toBe(204);

    const listRes = await fetch(`${baseUrl}/api/favorites`, {
      headers: { "x-guest-token": token },
    });
    const listBody = (await listRes.json()) as any[];
    expect(listBody).toHaveLength(0);

    expect(emitEvent).toHaveBeenCalledWith(
      "favorites-update",
      expect.objectContaining({ trackId: "track-1", guestSessionId: sessionId })
    );
  });

  it("removing a nonexistent favorite does not error", async () => {
    const { token } = await createGuestToken();

    const res = await fetch(`${baseUrl}/api/favorites/never-favorited`, {
      method: "DELETE",
      headers: { "x-guest-token": token },
    });

    expect(res.status).toBe(204);
  });
});

describe("GET /api/favorites", () => {
  it("returns 400 when there is no guest session", async () => {
    const res = await fetch(`${baseUrl}/api/favorites`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("session_required");
  });

  it("returns several favorites for a session", async () => {
    vi.mocked(getTrack).mockResolvedValueOnce(TRACK_1);
    const { token } = await createGuestToken();
    await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });

    vi.mocked(getTrack).mockResolvedValueOnce(TRACK_2);
    await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-2" }),
    });

    const res = await fetch(`${baseUrl}/api/favorites`, {
      headers: { "x-guest-token": token },
    });
    const body = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body.map((f) => f.spotifyTrackId).sort()).toEqual(["track-1", "track-2"]);
  });
});

describe("GET /api/favorites/status", () => {
  it("distinguishes favorited-by-me, favorited-by-another-guest, and favorited-by-nobody", async () => {
    vi.mocked(getTrack).mockResolvedValueOnce(TRACK_1);
    const me = await createGuestToken();
    await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": me.token },
      body: JSON.stringify({ trackId: "track-1" }),
    });

    vi.mocked(getTrack).mockResolvedValueOnce(TRACK_2);
    const other = await createGuestToken();
    await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": other.token },
      body: JSON.stringify({ trackId: "track-2" }),
    });

    const res = await fetch(
      `${baseUrl}/api/favorites/status?trackIds=track-1,track-2,track-nobody`,
      { headers: { "x-guest-token": me.token } }
    );
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body["track-1"]).toEqual({ favoritedByMe: true, favoritedByAnyone: true });
    expect(body["track-2"]).toEqual({ favoritedByMe: false, favoritedByAnyone: true });
    expect(body["track-nobody"]).toEqual({ favoritedByMe: false, favoritedByAnyone: false });
  });

  it("returns 200 with all favoritedByMe: false when there is no x-guest-token header", async () => {
    vi.mocked(getTrack).mockResolvedValueOnce(TRACK_1);
    const { token } = await createGuestToken();
    await fetch(`${baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ trackId: "track-1" }),
    });

    const res = await fetch(`${baseUrl}/api/favorites/status?trackIds=track-1`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body["track-1"]).toEqual({ favoritedByMe: false, favoritedByAnyone: true });
  });

  it("returns an empty object for a missing trackIds param", async () => {
    const res = await fetch(`${baseUrl}/api/favorites/status`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({});
  });
});
