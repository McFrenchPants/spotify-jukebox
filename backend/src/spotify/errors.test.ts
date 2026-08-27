import { describe, expect, it } from "vitest";
import { SpotifyRateLimitedError, SpotifyReauthRequiredError, classifySpotifyAuthError } from "./errors";

describe("classifySpotifyAuthError", () => {
  it("classifies a SpotifyRateLimitedError as 503 spotify_rate_limited", () => {
    const result = classifySpotifyAuthError(new SpotifyRateLimitedError("boom"));

    expect(result).toEqual({
      status: 503,
      body: {
        error: "spotify_rate_limited",
        message: expect.stringMatching(/rate-limiting/),
      },
    });
  });

  it("classifies a SpotifyReauthRequiredError as 503 spotify_reauth_required", () => {
    const result = classifySpotifyAuthError(new SpotifyReauthRequiredError("boom"));

    expect(result).toEqual({
      status: 503,
      body: {
        error: "spotify_reauth_required",
        message: expect.stringMatching(/GET \/api\/auth\/login/),
      },
    });
  });

  it("classifies a missing-refresh-token Error as 503 spotify_not_connected", () => {
    const result = classifySpotifyAuthError(
      new Error("No spotify_refresh_token stored yet — skip refresh until consent is completed.")
    );

    expect(result).toEqual({
      status: 503,
      body: {
        error: "spotify_not_connected",
        message: expect.stringMatching(/complete \/api\/auth\/login first/),
      },
    });
  });

  it("returns null for an unrelated error, leaving it to the caller's fallback handling", () => {
    expect(classifySpotifyAuthError(new Error("Spotify search failed: 500"))).toBeNull();
    expect(classifySpotifyAuthError(new Error("network error"))).toBeNull();
  });
});
