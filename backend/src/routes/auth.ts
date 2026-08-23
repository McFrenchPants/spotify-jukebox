import { Router } from "express";
import { setSetting } from "../db";
import { generateCodeChallenge, generateCodeVerifier, generateState } from "../spotify/pkce";

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

const SCOPES = [
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-read-recently-played",
].join(" ");

/**
 * This is a one-time, admin-run PKCE flow (see DESIGN_SPEC.md §8), not a
 * per-guest/multi-user login. A single module-level slot to hold the
 * in-flight code_verifier/state between /login and /callback is sufficient —
 * there is intentionally no session store or concurrency handling here.
 */
let pendingAuth: { codeVerifier: string; state: string } | null = null;

export const authRouter = Router();

authRouter.get("/login", (_req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.status(500).json({
      error: "server_misconfigured",
      message: "SPOTIFY_CLIENT_ID and SPOTIFY_REDIRECT_URI must be set in the environment.",
    });
    return;
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  pendingAuth = { codeVerifier, state };

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state,
  });

  res.redirect(`${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`);
});

authRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    res.status(400).send(`Spotify authorization failed: ${String(error)}`);
    return;
  }

  if (typeof code !== "string") {
    res.status(400).send("Missing or invalid 'code' query parameter.");
    return;
  }

  if (!pendingAuth) {
    res.status(400).send(
      "No pending authorization request found. Start the flow at /api/auth/login first."
    );
    return;
  }

  if (typeof state !== "string" || state !== pendingAuth.state) {
    res.status(400).send("State mismatch — possible CSRF or a stale/duplicate callback.");
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    res.status(500).json({
      error: "server_misconfigured",
      message:
        "SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REDIRECT_URI must be set in the environment.",
    });
    return;
  }

  const codeVerifier = pendingAuth.codeVerifier;
  // Consume the pending auth attempt regardless of outcome below so a stale
  // verifier can't be replayed against a later callback.
  pendingAuth = null;

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    });

    const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: body.toString(),
    });

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenData.access_token || !tokenData.refresh_token) {
      res.status(502).send(
        `Spotify token exchange failed: ${tokenData.error ?? tokenResponse.status} ${
          tokenData.error_description ?? ""
        }`.trim()
      );
      return;
    }

    const expiresAt = Date.now() + (tokenData.expires_in ?? 3600) * 1000;

    setSetting("spotify_access_token", tokenData.access_token);
    setSetting("spotify_refresh_token", tokenData.refresh_token);
    setSetting("spotify_token_expires_at", String(expiresAt));

    res
      .status(200)
      .send("Spotify connected — tokens saved. You can close this tab.");
  } catch (err) {
    res
      .status(502)
      .send(`Spotify token exchange failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});
