# Guest Jukebox — Progress Tracker

**Read this file first in any new session.** It's the source of truth for what's done, what's next, and any context needed to resume. Task scopes/acceptance criteria live in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md); the frozen requirements are in [docs/DESIGN_SPEC.md](docs/DESIGN_SPEC.md).

## Status: Phase 0 complete

**Next task: P1.2 — Token refresh worker** (P1.1's real end-to-end consent run still needs the user, once `PORT` in `.env` is fixed — see Open Questions)

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| P0.1 | Repo skeleton | done | |
| P0.2 | Backend project init | done | Express+TS, tsx dev server, port 3001 default |
| P0.3 | Frontend project init | done | Vite+React+Tailwind v4 (Vite plugin, no config file) |
| P0.4 | Env & secrets template | done | `backend/.env.example`; admin PIN defaults to placeholder `change-me` |
| P0.5 | Design system & style guide | done | Tailwind v4 `@theme` tokens (no config.js); accent `#2fd66f`; primitives in `frontend/src/components/ui/` |
| P1.1 | PKCE auth flow | done | Code complete & verified up to the redirect; real browser consent still needed once `PORT` is fixed — see Open Questions |
| P1.2 | Token refresh worker | todo | |
| P1.3 | Search proxy | todo | |
| P1.4 | Device resolution | todo | |
| P1.5 | Real-time push (SSE) | todo | `/api/events`; replaces client-side polling |
| P2.1 | SQLite schema & migrations | done | `better-sqlite3` pinned to 11.10.0 (13.x segfaults on Windows x64 in this env); tokens stored in `app_settings` k/v |
| P2.2 | Guest session issuance | todo | |
| P2.3 | Rate limiter | todo | |
| P2.4 | Content guardrails | todo | |
| P2.5 | Queue endpoint & analytics write | todo | Also emits `queue-update` SSE event (P1.5) |
| P2.6 | Leaderboard & recently-played reads | todo | |
| P3.1 | Admin PIN auth | todo | |
| P3.2 | Settings CRUD | todo | |
| P3.3 | Trust-mode-gated playback controls | todo | |
| P3.4 | Queue moderation | todo | Also emits `queue-update`/`leaderboard-update` SSE events |
| P4.1 | App shell & session bootstrap | todo | Built on P0.5 design system |
| P4.2 | Search & queue UI | todo | Skeleton loaders, optimistic UI, toasts |
| P4.3 | Now playing & queue view (SSE-driven) | todo | Depends on P1.5; no client polling |
| P4.4 | Leaderboard & recently played views | todo | Live via SSE |
| P4.5 | Trust-mode-aware playback controls | todo | |
| P4.6 | Admin panel UI | todo | |
| P4.7 | Micro-interactions & motion pass | todo | Polish pass across P4.1–P4.6 |
| P5.1 | Bridge phone setup runbook | todo | |
| P5.2 | Dockerfile & Compose | todo | |
| P5.3 | LAN discovery | todo | |
| P5.4 | Resilience pass | todo | |
| P5.5 | End-to-end smoke test | todo | Requires real hardware + user sign-off |

## Open Questions / Blockers

- **`backend/.env` `PORT=80085` is invalid** — TCP ports max out at 65535; the server crashes immediately (`ERR_SOCKET_BAD_PORT`) with this value. Likely a typo (maybe `8085`?). Needs fixing before the server can run normally or P1.1's real consent flow can be completed — update both `PORT` and the port in `SPOTIFY_REDIRECT_URI` to match (and update the redirect URI registered in the Spotify dashboard to match too).
- **P1.1 real end-to-end run still needed**: code is complete and verified as far as possible without a browser (server starts, `/api/auth/login` redirects to Spotify with correct params, `/api/auth/callback` error-handles correctly). Once `PORT`/`SPOTIFY_REDIRECT_URI` are fixed, start the backend (`npm run dev` in `backend/`) and visit `http://192.168.50.179:<port>/api/auth/login` in a browser to complete the one-time Spotify consent and confirm real tokens get persisted.
- **Admin PIN value**: now set (`8282` in `.env`) — resolved.
- **Process note**: subagent prompts touching `backend/.env` must be told never to overwrite/reset it, and to back it up + restore byte-for-byte if they need to test with different values (a past subagent lost the user's real credentials this way once already; P1.1's subagent handled it correctly by using a shell-level env override instead).

## Session Log

Newest entry on top. One entry per work session — what got done, what's next, anything a future session needs to know that isn't obvious from the task table.

### 2026-08-23 — P1.1 PKCE auth flow
- Added `backend/src/spotify/pkce.ts` (verifier/challenge/state generation via Node `crypto`) and `backend/src/routes/auth.ts` (`GET /api/auth/login`, `GET /api/auth/callback`), mounted at `/api/auth` in `app.ts`.
- One-time admin flow: module-level `pendingAuth` holds the code_verifier/state between login and callback (deliberately no session store — not concurrent/multi-user by design). Callback validates CSRF `state`, exchanges the code for tokens via HTTP Basic auth + PKCE verifier, persists `spotify_access_token`/`spotify_refresh_token`/`spotify_token_expires_at` via the existing `setSetting` helper (P2.1).
- Verified as far as possible without a browser: server boots, `/api/auth/login` redirects to `accounts.spotify.com/authorize` with correct client_id/scopes/redirect_uri/PKCE challenge sourced from real `.env`, `/api/auth/callback` correctly rejects missing/mismatched state. `.env` was read-only throughout (confirmed byte-identical after) — the subagent used a shell-level env override instead of editing the file, avoiding the P2.1 incident.
- **Found but out of scope to fix**: `.env`'s `PORT=80085` is an invalid TCP port (>65535), so `npm run dev` crashes without an override. Flagged in Open Questions.
- Real end-to-end verification (actual Spotify consent screen, confirming tokens land in `app_settings`) requires a human with a browser — see Open Questions for the exact steps once `PORT` is fixed.
- Next: P1.2 (token refresh worker) can be built now — it just needs the persisted refresh token, which P1.1 already provides a path for, independent of whether the real consent run has happened yet.

### 2026-08-23 — P2.1 SQLite schema & migrations
- Added `backend/src/db/index.ts`: `better-sqlite3` singleton, `runMigrations()` (idempotent `CREATE TABLE IF NOT EXISTS` for all 4 spec tables + 2 indexes on `play_history`), called from `src/index.ts` before `app.listen`. WAL mode + foreign keys pragma enabled.
- Added generic `getSetting`/`setSetting(key, value)` helpers on `app_settings` — P1.1 will store Spotify tokens there (`spotify_access_token`/`spotify_refresh_token`/`spotify_token_expires_at`) since the spec's table list has no dedicated tokens table.
- **Pinned `better-sqlite3` to `^11.10.0`** — the latest (13.0.3) segfaults on load on this Windows x64 environment (prebuilt binary and from-source rebuild both crash); 11.10.0 works cleanly. Worth re-checking on a future Node/toolchain upgrade.
- **Incident**: the subagent overwrote `backend/.env` with test values while verifying server boot, and could not restore the user's real Spotify credentials/redirect-URI/port afterward (gitignored file, no history). See Open Questions — user needs to re-enter them. Added a process note there for future subagent prompts.
- Next: once `.env` is restored, P1.1 (PKCE auth flow) can proceed using the `getSetting`/`setSetting` helpers for token persistence.

### 2026-08-23 — P0.5 design system & style guide (Phase 0 complete)
- Tailwind v4 tokens defined via `@theme` block in `frontend/src/index.css` (no `tailwind.config.js` — v4 doesn't use one): dark neutral scale (`bg`/`surface`/`surface-raised`/`surface-overlay`/`border` tiers), accent `#2fd66f` (distinct from Spotify's `#1DB954`), semantic success/error/warning colors, 4-step type scale (display/title/body/caption), radius scale (sm/md/lg/xl/full), one easing + 3 duration tokens (fast/base/slow, exposed as `.transition-fast/base/slow` utility classes since Tailwind v4 has no themeable duration namespace). Spacing scale: deliberately reused Tailwind's default numeric scale rather than a parallel custom one.
- Primitives in `frontend/src/components/ui/`: `Button` (primary/secondary/danger × md/lg, strong pressed state via scale+color since touch-only), `Card`, `Toast` (success/error/warning/info), `Skeleton` (line/circle/block), `Modal` (modal/sheet, portal-rendered, closes on backdrop/Escape). Global `prefers-reduced-motion` handling in `index.css`.
- Added `react-router-dom`; `/style-guide` route (`frontend/src/pages/StyleGuide.tsx`) renders all tokens/primitives — registered always-on (not `import.meta.env.DEV`-gated), noted as an easy-to-revisit simplicity choice. `docs/DESIGN_SYSTEM.md` documents tokens + primitive usage.
- `App.tsx` placeholder at `/` left untouched (still uses ad hoc `neutral-*` classes) — flagged in DESIGN_SYSTEM.md that Phase 4 should switch it to tokens when building the real UI.
- Phase 0 (scaffolding) is now fully done. Next: Phase 1 backend core, starting with P1.1 (PKCE auth flow) — **blocked** on Spotify Developer app credentials from the user (see Open Questions).

### 2026-08-23 — P0.4 env & secrets template
- Added `backend/.env.example` (Spotify client ID/secret, redirect URI, admin PIN placeholder `change-me`, port, DB path). `backend/.gitignore` already ignored `.env`; added `/data/` too (SQLite file destination). Root `README.md` already referenced it from P0.1.
- Next: P0.5 (design system/style guide) — last Phase 0 task before Phase 1 backend/auth work can start.

### 2026-08-23 — P0.2/P0.3 backend & frontend init
- P0.2: Express/TypeScript backend skeleton (`backend/`) — `createApp()` in `src/app.ts`, entrypoint `src/index.ts`, dotenv loading, `GET /api/health` → `{status:"ok"}`, npm scripts `dev`/`build`/`start` (tsx watch / tsc / node dist). Default port 3001. Verified: build clean, dev server returns 200 on `/api/health`.
- P0.3: Vite+React+TS frontend skeleton (`frontend/`) via `npm create vite@latest`, Tailwind CSS v4 wired through `@tailwindcss/vite` (no separate `tailwind.config.js` — v4 style), placeholder page, PWA `public/manifest.json` stub linked from `index.html`. Verified: `npm run build` succeeds, dev server serves HTML + manifest.
- Note for later phases: Tailwind v4 has no `tailwind.config.js`; theme tokens for P0.5 (design system) go via CSS `@theme` directive in `src/index.css` instead of a JS config file.
- Next: P0.4 (env/secrets template), then P0.5 (design system) before Phase 4 frontend work.

### 2026-08-23 — P0.1 repo skeleton
- Added root `.gitignore`, `.editorconfig`, `README.md` (run-instructions stub) and created `backend/`/`frontend/` dirs. Committed (`46b717c`).
- Next: P0.2 (backend init) and P0.3 (frontend init) in parallel.

### 2026-08-23 — Design/UX & real-time revision
- User feedback: plan was engineering-only, missing visual design, kiosk vs. mobile layout consideration, micro-interaction/polish detail, and relied on sluggish 5s client polling.
- Clarified: no kiosk display for v1 (phones only, but tokens shouldn't preclude one later), dark album-art-driven ambient theme, SSE (not WebSockets) for live updates.
- Updated DESIGN_SPEC.md to v1.2.0: added §6a (SSE real-time sync), §9a (UI/UX design system — theme, tokens, primitives, micro-interactions), kiosk non-goal in §11, §12 revision history.
- Updated IMPLEMENTATION_PLAN.md: added P0.5 (design system/style guide) and P1.5 (SSE endpoint); reworked P4.1–P4.4 to build on the design system and consume SSE instead of polling; added P4.7 (micro-interactions/motion pass).
- Still no code written. Next: start Phase 0 (P0.1 repo skeleton), now including P0.5 design system before Phase 4 frontend work begins.

### 2026-08-23 — Planning session
- Read the source design doc, clarified requirements with the user (access model, trust model, hosting, audio bridge, admin auth).
- Wrote [docs/DESIGN_SPEC.md](docs/DESIGN_SPEC.md) (finalized, with a deviations table vs the original draft) and [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) (5 phases, task IDs P0.1–P5.5).
- No code written yet. Repo not yet git-initialized.
- Next: start Phase 0 (repo/project scaffolding).
