# Guest Jukebox

A self-hosted, LAN-only party music queueing app: guests browse and add songs to a shared Spotify queue from their own phones, no login required, while an admin keeps control via a PIN-protected panel.

## Before you start it

Fill in all four options on the add-on's **Configuration** tab before pressing Start:

- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — from a Spotify Developer app you create at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard). Add `https://mcfrenchpants.github.io/spotify-jukebox/oauth-callback/` as that app's Redirect URI (a fixed, shared value — see "Option A" below for why).
- `SPOTIFY_REDIRECT_URI` — leave as the default. It's only used by the SSH-based fallback (Option B below); the recommended path (Option A) doesn't touch it.
- `ADMIN_PIN` — a real PIN, not the `change-me` default. Guests never see this; only whoever opens the admin panel needs it. **This can't be changed later** through the Configuration tab — it's only ever read on the very first login attempt (hashed once and stored), so get it right before pressing Start.
- `SPOTIFY_REFRESH_TOKEN` — leave blank; Option A below fills it in for you.

## One-time Spotify login — two ways to do it

The app needs one Spotify login to authorize itself — that part always needs an actual human to log in somewhere, it can't be fully automated away. What the app *does* automate: it checks its own Spotify connection status on its own, every time the Settings page loads. If it isn't connected (or a previously-working connection has expired), a "Spotify connection" card at the top of Settings tells you so and walks you through reconnecting right there — no need to notice a broken Now Playing screen and go hunting for why.

There are two ways to complete the actual one-time login:

**Option A — recommended, no SSH, no localhost, works from any device.** Start the add-on, open its Settings page, log in with your `ADMIN_PIN`, and follow the "Spotify connection" card: it links to [mcfrenchpants.github.io/spotify-jukebox/oauth-callback](https://mcfrenchpants.github.io/spotify-jukebox/oauth-callback/), which you can open in any browser — your phone, your laptop, whatever's convenient, doesn't need to be anywhere near the Home Assistant box. Paste in your `SPOTIFY_CLIENT_ID` from above, click **Authorize with Spotify**, and log in when Spotify prompts you. That page then hands you a refresh token to copy — paste it back into the Settings card and click **Connect**. It takes effect immediately, live, no add-on restart needed (unlike setting the `SPOTIFY_REFRESH_TOKEN` Configuration-tab option directly, which only gets read on startup).

That auth page runs entirely in your browser (a static page, no server behind it) using Spotify's own "Authorization Code with PKCE" flow, which is specifically designed not to need a client secret at all — nothing about your Spotify credentials ever leaves your browser except the request to Spotify itself. It's shared, fixed infrastructure used identically by every self-hosted install of this app; it doesn't know or care which specific add-on instance you're setting up, which is why you paste the resulting token back into the app yourself rather than it happening automatically.

  ⚠️ **Don't reuse a refresh token you already generated for a different running instance** (e.g. a local dev setup) unless that other instance won't keep polling Spotify at the same time — a refresh token is tied to the Spotify app (client ID) that issued it, and Spotify's rate limit is bucketed *per client ID*, shared across every instance using it. If you're keeping a dev/staging setup running alongside this one, register a **separate** Spotify Developer app (its own client ID/secret, same fixed Redirect URI) and get a fresh token for each via Option A.

**Option B — via SSH tunnel, if you'd rather not depend on the hosted page above.** Set `SPOTIFY_REDIRECT_URI` to `http://127.0.0.1:8085/api/auth/callback` (this exact value must also be added to your Spotify app's Redirect URIs — matching Option A's URI too is fine, apps can have multiple), leave `SPOTIFY_REFRESH_TOKEN` blank, start the add-on, and visit:

```
http://127.0.0.1:8085/api/auth/login
```

Because Spotify only accepts the literal `127.0.0.1` loopback address for plain-HTTP redirects, this has to be done from a browser running on the Home Assistant host itself, or by SSH-tunneling port 8085 from your own machine to the HA box and visiting the URL locally (`ssh -L 8085:localhost:8085 <user>@<ha-host>`, then open that URL in a normal browser on your own machine). This step only needs to happen once; after it completes, the app keeps itself logged in.

## Guest access

Once set up, guests connect directly at `http://<your-ha-box-lan-ip>:8085` from any device on your LAN — no Home Assistant login involved. See `docs/LAN_ACCESS.md` in the repository for details on finding your HA box's LAN IP and sharing it with guests, and `docs/BRIDGE_SETUP.md` for anything more advanced.
