# Guest Jukebox

A self-hosted, LAN-only party music queueing app: guests browse and add songs to a shared Spotify queue from their own phones, no login required, while an admin keeps control via a PIN-protected panel.

## Before you start it

Fill in all four options on the add-on's **Configuration** tab before pressing Start:

- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — from a Spotify Developer app you create at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard).
- `SPOTIFY_REDIRECT_URI` — leave as the default (`http://127.0.0.1:8085/api/auth/callback`) unless you have a reason to change it, and add this exact URI to your Spotify app's Redirect URIs list in its dashboard settings. Spotify only accepts the literal `127.0.0.1` loopback address for plain-HTTP redirects — this is a Spotify platform restriction, not something this add-on can work around.
- `ADMIN_PIN` — a real PIN, not the `change-me` default. Guests never see this; only whoever opens the admin panel needs it.
- `SPOTIFY_REFRESH_TOKEN` — **optional, but recommended if you're avoiding SSH.** See below.

## One-time Spotify login — two ways to do it

The app needs one Spotify login to authorize itself. There are two ways to complete it:

**Option A — no SSH needed, if you already have a working local setup.** If you've already connected this app to Spotify somewhere else (e.g. running it locally on your computer during development/testing), that setup already has a `spotify_refresh_token` value stored. Paste that same value into this add-on's `SPOTIFY_REFRESH_TOKEN` option before starting it, and the add-on reuses that authorization directly — no browser consent flow, no SSH, nothing else to do. (Where to find it: it's stored in that other setup's local SQLite database, under `app_settings` → `spotify_refresh_token`.)

**Option B — via SSH tunnel, if you don't have that.** Leave `SPOTIFY_REFRESH_TOKEN` blank, start the add-on, and visit:

```
http://127.0.0.1:8085/api/auth/login
```

Because of the `127.0.0.1`-only redirect restriction above, this has to be done from a browser running on the Home Assistant host itself, or by SSH-tunneling port 8085 from your own machine to the HA box and visiting the URL locally (`ssh -L 8085:localhost:8085 <user>@<ha-host>`, then open that URL in a normal browser on your own machine). This step only needs to happen once; after it completes, the app keeps itself logged in.

## Guest access

Once set up, guests connect directly at `http://<your-ha-box-lan-ip>:8085` from any device on your LAN — no Home Assistant login involved. See `docs/LAN_ACCESS.md` in the repository for details on finding your HA box's LAN IP and sharing it with guests, and `docs/BRIDGE_SETUP.md` for anything more advanced.
