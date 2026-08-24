import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../spotify/client", () => ({
  searchTracks: vi.fn(),
}));

import { searchTracks } from "../spotify/client";
import { createApp } from "../app";

const SHAPED_RESULTS = [
  {
    id: "track-1",
    name: "Song One",
    artist: "Artist A",
    albumArt: "https://example.com/large.jpg",
    durationMs: 210000,
    explicit: true,
  },
  {
    id: "track-2",
    name: "Song Two",
    artist: "Artist B, Artist C",
    albumArt: null,
    durationMs: 180000,
    explicit: false,
  },
];

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

describe("GET /api/search", () => {
  it("returns shaped track results from a mocked Spotify client, including explicit tracks", async () => {
    vi.mocked(searchTracks).mockResolvedValue(SHAPED_RESULTS);

    const res = await fetch(`${baseUrl}/api/search?q=party+songs`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual(SHAPED_RESULTS);
    // Explicit-content filtering is out of scope (P2.4) — explicit tracks
    // must still be present in the raw proxy response.
    expect(body.some((t: { explicit: boolean }) => t.explicit)).toBe(true);
    expect(searchTracks).toHaveBeenCalledWith("party songs");
  });

  it("returns 400 when the q parameter is missing", async () => {
    const res = await fetch(`${baseUrl}/api/search`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toBe("missing_query");
    expect(searchTracks).not.toHaveBeenCalled();
  });

  it("returns 400 when q is present but empty", async () => {
    const res = await fetch(`${baseUrl}/api/search?q=`);
    expect(res.status).toBe(400);
    expect(searchTracks).not.toHaveBeenCalled();
  });

  it("propagates a Spotify API error as a 502 rather than crashing", async () => {
    vi.mocked(searchTracks).mockRejectedValue(new Error("Spotify search failed: 401 Invalid token"));

    const res = await fetch(`${baseUrl}/api/search?q=test`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_search_failed");
    expect(body.message).toMatch(/Spotify search failed/);
  });

  it("returns 503 with a clear message when Spotify hasn't been connected yet", async () => {
    vi.mocked(searchTracks).mockRejectedValue(
      new Error("No spotify_refresh_token stored yet — skip refresh until consent is completed.")
    );

    const res = await fetch(`${baseUrl}/api/search?q=test`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("spotify_not_connected");
    expect(body.message).toMatch(/complete \/api\/auth\/login first/);
  });

  it("returns 503 spotify_reauth_required when the stored refresh token is dead (invalid_grant)", async () => {
    const { SpotifyReauthRequiredError } = await import("../spotify/errors");
    vi.mocked(searchTracks).mockRejectedValue(
      new SpotifyReauthRequiredError("Spotify token refresh failed: invalid_grant Refresh token revoked")
    );

    const res = await fetch(`${baseUrl}/api/search?q=test`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("spotify_reauth_required");
    expect(body.message).toMatch(/GET \/api\/auth\/login/);
  });
});
