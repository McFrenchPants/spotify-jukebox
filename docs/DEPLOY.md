# Deploying to the Home Assistant Server

Manual runbook for getting Guest Jukebox running as a Docker container on
the Home Assistant host box, for real end-to-end testing from other devices
on the LAN (P5.5). Assumes the HA box is a Linux machine you can SSH into,
with Docker (with Compose v2, the `docker compose` subcommand) already
installed — install Docker first if it isn't.

Replace `<ha-host>` with the box's LAN IP or hostname and `<ssh-user>`
with your SSH username throughout.

---

## 1. One-time Spotify dashboard change

The container always listens on port **3001** internally (hardcoded in
`docker-compose.yml`'s `environment:` block, regardless of what's in
`.env`), but your currently-registered Spotify redirect URI is
`http://127.0.0.1:8085/api/auth/callback` (matching local dev's port 8085).
Spotify only accepts plain-HTTP redirects at the literal `127.0.0.1`
loopback address, and the port must match exactly what's registered.

1. Go to your app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → Settings.
2. Under **Redirect URIs**, **add** (don't replace) a second entry:
   ```
   http://127.0.0.1:3001/api/auth/callback
   ```
3. Save. Local dev's existing `127.0.0.1:8085` entry is untouched, so
   `npm run dev` keeps working exactly as before.

## 2. Copy the project to the HA box

From this machine (`C:\Dev\Projects\spotify-jukebox`), excluding
`node_modules`, `.git`, build output, and the local dev database
(the deployment gets a fresh DB via its own Docker volume):

```bash
rsync -av --exclude node_modules --exclude .git --exclude 'backend/dist' \
  --exclude 'frontend/dist' --exclude 'backend/data' --exclude 'backend/.env' \
  ./ <ssh-user>@<ha-host>:~/guest-jukebox/
```

(No `rsync` on Windows? Use `scp -r`, it's just slower and won't skip
excluded folders automatically — delete `node_modules`/`.git` from a throwaway
copy first, or just tolerate a bigger transfer.)

## 3. Create `backend/.env` directly on the HA box

**Don't copy your local `.env`** — the redirect URI must be the new
port-3001 one from Step 1. On the HA box:

```bash
ssh <ssh-user>@<ha-host>
cd ~/guest-jukebox/backend
cp .env.example .env
nano .env   # or vim/whatever's available
```

Fill in:
```
SPOTIFY_CLIENT_ID=<same client id as local dev>
SPOTIFY_CLIENT_SECRET=<same client secret as local dev>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/callback
ADMIN_PIN=<pick a real PIN — don't leave "change-me">
PORT=3001
DB_PATH=./data/jukebox.db
```
(`PORT`/`DB_PATH` here don't actually matter — `docker-compose.yml` pins
both regardless — but fill them in for consistency in case that ever
changes.)

## 4. Build and start the container

```bash
cd ~/guest-jukebox
docker compose up -d --build
docker compose logs -f jukebox   # watch for "Guest Jukebox backend listening on port 3001", then Ctrl+C
```

Confirm it's up: `curl http://localhost:3001/api/health` on the HA box
should return `{"status":"ok"}`.

## 5. Complete the one-time Spotify consent (via SSH tunnel)

The container's fresh volume has no Spotify auth yet — this is a **new,
separate consent** from local dev's, even though it's the same Spotify
account. From **this machine** (not the HA box):

```bash
ssh -L 3001:localhost:3001 <ssh-user>@<ha-host>
```

Leave that running, then in a browser on this machine, visit:

```
http://127.0.0.1:3001/api/auth/login
```

Log into Spotify and approve. You should land on a success response and
the callback should complete. You can close the SSH tunnel afterward — the
refresh token is now persisted in the container's Docker volume and
survives restarts (already verified separately that the volume persists
across `docker compose down`/`up`).

## 6. Resolve the bridge device

Still on the HA box (or via the tunnel):

```bash
curl http://localhost:3001/api/device
```

If `resolved` is `null` with multiple/zero devices, use the admin panel
(see Step 7) to pick the bridge phone manually, same as local dev.

## 7. Find the LAN URL and test from another device

Per [docs/LAN_ACCESS.md](LAN_ACCESS.md):

```bash
hostname -I   # on the HA box, or check its known LAN IP
```

From **any other device on the same wifi**, open:

```
http://<ha-box-lan-ip>:3001
```

Log into the admin panel (Settings tab, the PIN you set in Step 3), check
the Guest Link card's QR code now encodes this same LAN URL, and confirm
the device selector shows the bridge phone as resolved.

## Troubleshooting

- **`docker compose up` fails on `better-sqlite3`**: the image was already
  verified to build and run correctly on this project's dev machine
  (x86_64 Windows via Docker Desktop) — if the HA box is a different
  architecture (e.g. arm64 Raspberry Pi), see the "not yet exercised"
  caveat in `PROGRESS.md`'s P5.2 notes; the Dockerfile has a source-compile
  fallback but it's untested on arm64.
- **Redirect URI mismatch error from Spotify**: double check Step 1's URI
  was saved exactly as `http://127.0.0.1:3001/api/auth/callback` (no
  trailing slash, exact port) and that `backend/.env` on the HA box
  (Step 3) matches it exactly.
- **Can't reach the app from another device**: confirm the HA box's
  firewall allows inbound connections on port 3001 from the LAN, and that
  you're using the HA box's actual LAN IP, not `localhost`/`127.0.0.1`
  (which only work from the HA box itself or through the SSH tunnel).
