import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../spotify/client", () => ({
  getArtist: vi.fn(),
}));

import { getArtist } from "../spotify/client";
import { createApp } from "../app";

const SHAPED_ARTIST = {
  id: "artist-1",
  name: "Artist One",
  genres: ["pop", "dance pop"],
  imageUrl: "https://example.com/large.jpg",
  followers: 12345,
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

describe("GET /api/artist/:id", () => {
  it("returns a shaped artist from a mocked Spotify client, unauthenticated", async () => {
    vi.mocked(getArtist).mockResolvedValue(SHAPED_ARTIST);

    const res = await fetch(`${baseUrl}/api/artist/artist-1`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual(SHAPED_ARTIST);
    expect(getArtist).toHaveBeenCalledWith("artist-1");
  });

  it("returns 200 when the shaped artist has default followers/imageUrl (BACKLOG item 15 regression)", async () => {
    // getArtist now defaults followers to 0 and imageUrl to null instead of
    // throwing when Spotify omits those fields for a given artist ID, so the
    // route should see a normal resolved value here, not an error — this
    // guards against the fix regressing back to a 502.
    vi.mocked(getArtist).mockResolvedValue({
      id: "artist-3",
      name: "Artist Three",
      genres: [],
      imageUrl: null,
      followers: 0,
    });

    const res = await fetch(`${baseUrl}/api/artist/artist-3`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: "artist-3",
      name: "Artist Three",
      genres: [],
      imageUrl: null,
      followers: 0,
    });
  });

  it("returns 404 with artist_not_found when Spotify reports the artist as not found", async () => {
    vi.mocked(getArtist).mockRejectedValue(
      new Error("Spotify artist lookup failed: 404 Not found")
    );

    const res = await fetch(`${baseUrl}/api/artist/missing-artist`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(404);
    expect(body.error).toBe("artist_not_found");
  });

  it("returns 502 on a generic Spotify failure", async () => {
    vi.mocked(getArtist).mockRejectedValue(
      new Error("Spotify artist lookup failed: 500 Internal error")
    );

    const res = await fetch(`${baseUrl}/api/artist/artist-1`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("spotify_artist_lookup_failed");
  });

  it("returns 503 with a clear message when Spotify hasn't been connected yet", async () => {
    vi.mocked(getArtist).mockRejectedValue(
      new Error("No spotify_refresh_token stored yet — skip refresh until consent is completed.")
    );

    const res = await fetch(`${baseUrl}/api/artist/artist-1`);
    const body = (await res.json()) as any;

    expect(res.status).toBe(503);
    expect(body.error).toBe("spotify_not_connected");
    expect(body.message).toMatch(/complete \/api\/auth\/login first/);
  });
});
