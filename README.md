# Guest Jukebox

A self-hosted, Spotify-backed party jukebox: guests scan a QR code, search tracks, and queue songs from their phones; a dedicated host device plays via Spotify Connect.

**Status: MVP shipped and verified on real hardware (2026-08-25).** See [docs/DESIGN_SPEC.md](docs/DESIGN_SPEC.md) for the full requirements and [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) / [PROGRESS.md](PROGRESS.md) for build status. **PROGRESS.md is the source of truth for what's currently working and what's next.**

## How it works

- A **bridge device** (a phone or computer, kept logged into Spotify and connected to speakers/a Bluetooth output) is what actually plays audio via Spotify Connect. This app never plays audio itself — it only tells Spotify what to play, on that device.
- The **backend** (Express/TypeScript) holds the one-time Spotify OAuth (PKCE) token for the household's Spotify Premium account, proxies search, applies guardrails (explicit filter, duration bounds, duplicate/blacklist checks, per-guest rate limiting) before adding a track to Spotify's queue, and pushes live now-playing/queue/leaderboard updates to clients over Server-Sent Events (no WebSockets, no external broker).
- The **frontend** (Vite + React PWA) is what guests load by scanning a QR code: search, queue, see what's playing next, and (in "trusted" mode) basic playback controls. A separate admin panel (PIN-protected) manages settings, the blacklist, and queue moderation.
- State lives in a single **SQLite** file (via `better-sqlite3`) — play history, guest sessions, track stats, and app settings. No external database.
- Spotify's Web API has no "remove one queued track" endpoint, so the backend keeps a local `queue_entries` mirror and does a full resync (replace Spotify's live queue with the mirror) whenever an admin removes/clears an entry — see DESIGN_SPEC §6b.

## Repo layout

- `backend/` — Express/TypeScript API server (Spotify auth proxy, queue, guardrails, admin, SSE)
- `frontend/` — Vite + React PWA (guest and admin UI)
- `docs/` — design spec, implementation plan, progress tracker, and deployment/setup runbooks
- `Dockerfile` / `docker-compose.yml` — standalone Docker deployment
- `config.yaml` / `repository.yaml` / `DOCS.md` (repo root) — Home Assistant OS Add-on manifest (installed via the Supervisor's Add-on Store, not Docker Compose directly — see below)

## Requirements

- Node.js 18+ and npm (only needed for local dev — the Docker/Add-on deployments bundle their own)
- A Spotify **Premium** account (queueing/playback control requires Premium) and a [Spotify Developer app](https://developer.spotify.com/dashboard) (client ID + secret)
- A device to act as the audio bridge — see [docs/BRIDGE_SETUP.md](docs/BRIDGE_SETUP.md) for prepping a dedicated phone. For local dev, any device signed into the same Spotify account showing up under Spotify Connect works.

## Deploying

Three ways to run this, depending on your setup:

1. **Local dev** (this machine only) — see "Running locally" below.
2. **Standalone Docker container** (any Linux host with Docker) — see [docs/DEPLOY.md](docs/DEPLOY.md). Manual, SSH-based.
3. **Home Assistant OS Add-on** (if you're running HA OS and want to avoid SSH entirely) — push this repo to your own GitHub repository, then add it as a custom repository in Settings → Add-ons → Add-on Store → Repositories, and install/configure/start it entirely through the HA UI. The add-on's in-UI docs (`DOCS.md` at the repo root) cover the Spotify setup steps; `docs/DESIGN_SPEC.md` §9 has the architecture rationale (notably: it does **not** use HA's Ingress proxy, so guests still connect directly with no Home Assistant login involved).

Either deployment method serves guests at `http://<host-lan-ip>:8085` — see [docs/LAN_ACCESS.md](docs/LAN_ACCESS.md) for finding that URL and getting the admin panel's QR code to point at it.

**Tip for either Docker-based method**: if you've already completed the one-time Spotify consent for that *same* Spotify Developer app somewhere else (e.g. another deployment using the same client ID/secret), you can skip repeating that browser flow — copy the `spotify_refresh_token` value out of that setup's SQLite `app_settings` table and paste it into the new deployment's `SPOTIFY_REFRESH_TOKEN` config (env var for Docker Compose, or the Add-on's options form). See `backend/src/config/seedRefreshToken.ts`. This only works across deployments sharing the same client ID — a refresh token is bound to the app that issued it, so it can't be reused with a *different* Spotify app's credentials (see the "use a separate Spotify app for local dev" note below). Don't use this to reuse local dev's token for production, or vice versa.

## Running locally

1. Create a Spotify Developer app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and note its client ID/secret. Add a redirect URI matching what you'll set below (e.g. `http://127.0.0.1:8085/api/auth/callback`).

   **Use a separate Spotify app for local dev than whatever your production deployment (Docker/HA Add-on) uses**, even though it's the same Spotify account either way. Spotify rate-limits per client ID, not per account, so two instances sharing one client ID/refresh token and polling simultaneously can trip and share the same 429 window — this happened in practice (local dev + the HA Add-on both polling at once) and is why `backend/src/spotify/rateLimitBackoff.ts` exists. Registering a second app for dev gives it its own independent rate-limit bucket, so leaving a dev backend running never risks production's polling (or vice versa). Everything else (`ADMIN_PIN`, `PORT`, `SPOTIFY_REDIRECT_URI`) can safely be identical between the two — only `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` (and therefore each one's own `spotify_refresh_token`, obtained separately per Step 5 below) need to differ.
2. Copy the env template and fill in real values — **never commit `.env`**:
   ```bash
   cd backend
   cp .env.example .env
   ```
   Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` (must exactly match the Spotify app's registered redirect URI), `ADMIN_PIN` (whatever PIN unlocks the admin panel), `PORT` (must be a valid TCP port, 1–65535), and `DB_PATH` (SQLite file location, created automatically).
3. Install and run the backend:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
4. Install and run the frontend (separate terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The Vite dev server proxies `/api/*` to the backend, so the frontend calls relative paths — no CORS config needed in dev.
5. **One-time Spotify authorization**: with the backend running, open `http://<host>:<PORT>/api/auth/login` in a browser and complete the Spotify consent screen. This is a one-time admin action (not per-guest) — it persists a refresh token in the SQLite `app_settings` table, which the backend uses to keep itself authorized indefinitely (auto-refreshed roughly every 50 minutes).
6. Open the frontend dev URL (printed by `npm run dev`, typically `http://localhost:5173`) to use the guest UI, or `/style-guide` for the design-system reference page.

### Running tests

```bash
cd backend
npm test
```

Backend tests run against an in-memory SQLite database (`vitest.config.ts` sets `DB_PATH=:memory:`), so they never touch your real `.env`/`data/` files.

## Notes for anyone picking this up

- **Backend port**: `PORT` in `.env` must be ≤ 65535 and must match the port baked into `SPOTIFY_REDIRECT_URI` and whatever the Spotify dashboard has registered — mismatches cause silent auth failures.
- **`better-sqlite3` version**: pinned to `^11.10.0` in `backend/package.json` — newer major versions have been observed to segfault on some Windows x64 setups.
- **Admin auth**: a PIN (set via `ADMIN_PIN`) exchanges for a short-lived signed token (`x-admin-token` header) used by all `/api/admin/*` and playback-control routes; it's independent of guest sessions (`x-guest-token`), which are anonymous and created automatically on first load.
- **Trust mode**: playback controls (pause/resume/skip/volume) are gated by a global "restricted" vs "trusted" mode plus per-capability overrides, configurable from the admin panel — this determines what guests (not admins, who can always act) are allowed to do.
- **Docker image runs as root**: an earlier non-root `USER` directive broke the Home Assistant Add-on deployment (EACCES reading the Supervisor-managed `/data` mount, whose ownership isn't under this project's control) — accepted tradeoff for a LAN-only, single-household app rather than adding entrypoint-script complexity to fix it properly. Revisit if this project ever needs to run somewhere with untrusted multi-tenant exposure.
