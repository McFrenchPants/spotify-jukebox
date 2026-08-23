# Guest Jukebox — Progress Tracker

**Read this file first in any new session.** It's the source of truth for what's done, what's next, and any context needed to resume. Task scopes/acceptance criteria live in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md); the frozen requirements are in [docs/DESIGN_SPEC.md](docs/DESIGN_SPEC.md).

## Status: Phase 1 complete

**Next task: P2.6 — Leaderboard & recently-played reads**

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
| P1.2 | Token refresh worker | done | vitest added; 6 unit tests pass; real refresh still needs P1.1's consent to complete first |
| P1.3 | Search proxy | done | `GET /api/search?q=`; unfiltered raw proxy (P2.4 does filtering); 20 tests pass |
| P1.4 | Device resolution | done | `GET /api/device`, `POST /api/device/select`; 18 new tests (38 total in backend) |
| P1.5 | Real-time push (SSE) | done | `/api/events`; generic `emitEvent`/`subscribe` bus for P2.5/P2.6/P3.4 to use; now-playing poller (4s) |
| P2.1 | SQLite schema & migrations | done | `better-sqlite3` pinned to 11.10.0 (13.x segfaults on Windows x64 in this env); tokens stored in `app_settings` k/v |
| P2.2 | Guest session issuance | done | `POST /api/session`; `resolveGuestSession` middleware (resolve-only, never creates/blocks) for P2.3/P2.5 to build on |
| P2.3 | Rate limiter | done | `checkRateLimit`/`recordAllowedRequest` split + `rateLimitGuestSession` middleware; P2.5 must call `recordAllowedRequest` itself after other guardrails pass |
| P2.4 | Content guardrails | done | `runQueueGuardrails()` in `guardrails/queueGuardrails.ts`; duplicate check takes now-playing/queue state as injected params (P2.5 supplies); blacklist is track-level only, see Open Questions |
| P2.5 | Queue endpoint & analytics write | done | `POST /api/queue`; re-fetches track+queue state from Spotify server-side (never trusts client metadata); emits `queue-update` SSE event |
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

- **Track-vs-artist blacklist gap**: DESIGN_SPEC §7 says admins can ban a "track or artist," but `track_stats` (P2.1 schema) only has a track-level `is_blacklisted` flag — no artist table/column exists. P2.4 implemented track-level blacklist only. Needs a decision before P3.2 (Settings CRUD) / P4.6 (admin panel UI) expose blacklist management: either add an artist-level table (join against track's artist on check) or do artist blacklisting via a simple `app_settings`-stored name list. Flagging for the user/a future session to decide, not blocking current work.
- **`backend/.env` `PORT` fixed to `8085`** (was invalid `80085`, >65535 max); `SPOTIFY_REDIRECT_URI` updated to match. **User still needs to**: (1) update the redirect URI registered in the Spotify dashboard to `http://192.168.50.179:8085/api/auth/callback`, (2) run the backend and visit `http://192.168.50.179:8085/api/auth/login` in a browser to complete the one-time consent — this persists a real `spotify_refresh_token`, which both P1.1 and P1.2 are coded against but haven't been exercised for real yet. Once done, P1.2's refresh worker can be spot-checked for real by calling `refreshAccessToken()` once and confirming `spotify_access_token` changes.
- **Admin PIN value**: now set (`8282` in `.env`) — resolved.
- **Process note**: subagent prompts touching `backend/.env` must be told never to overwrite/reset it, and to back it up + restore byte-for-byte if they need to test with different values (a past subagent lost the user's real credentials this way once already; P1.1's subagent handled it correctly by using a shell-level env override instead).

## Session Log

Newest entry on top. One entry per work session — what got done, what's next, anything a future session needs to know that isn't obvious from the task table.

### 2026-08-23 — P2.5 queue endpoint; test-suite isolation fix
- Added `backend/src/spotify/queue.ts`: `getQueueState()` (`GET /v1/me/player/queue`, shaped to `{currentlyPlayingTrackId, queuedTrackIds}`) and `addTrackToQueue(trackId, deviceId)` (`POST /v1/me/player/queue?uri=...&device_id=...`).
- Extended `backend/src/spotify/client.ts` with `getTrack(trackId)` (`GET /v1/tracks/{id}`, shaped to the existing `ShapedTrack`) and `backend/src/db/trackStats.ts` with `recordTrackPlay(spotifyTrackId)` (upsert incrementing `play_count`).
- Added `backend/src/db/playHistory.ts` (`insertPlayHistory`) and `backend/src/routes/queue.ts` (`POST /api/queue`, mounted in `app.ts`): resolves guest session → rate-limit check (`rateLimitGuestSession` middleware) → re-fetches track + live queue state from Spotify server-side (deliberately never trusts client-supplied `explicit`/`durationMs`, so a guest can't spoof past the guardrails) → `runQueueGuardrails` → only on full pass, `recordAllowedRequest` (consumes the rate-limit bucket) → calls Spotify's queue-add → writes `play_history` + `track_stats` → emits `queue-update` SSE event → `201`.
- 7 new tests — 94 total passing. `npx tsc --noEmit` clean.
- **Test-suite isolation fix (supervisor-level, not part of P2.5's scope)**: the shared real SQLite file (`data/jukebox.db`) that all prior tests wrote to directly turned out to still cause a rare cross-file race even after P2.3/P2.4's per-test setting resets (~1-in-4 runs failing `rateLimiter.test.ts`'s default-window test with a polluted value) once P2.5 added a 7th settings-touching test file. Root-caused and fixed properly instead of patching another symptom: added `backend/vitest.config.ts` + `backend/vitest.setup.ts` pointing `DB_PATH` at `:memory:` during tests, so every test file gets its own fresh, fully isolated in-memory database — eliminates the whole class of shared-state bugs (the individual per-test `setSetting` resets added in P2.3/P2.4 are now just harmless redundant belt-and-braces, not load-bearing). Verified clean across 5 consecutive full `npm test` runs at unchanged (~5s) speed.
- Next: P2.6 (leaderboard/recently-played reads) — read-only, should be the simplest remaining Phase 2 task, no new guardrail/integration concerns.

### 2026-08-23 — P2.4 content guardrails
- Added `backend/src/db/trackStats.ts`: `isTrackBlacklisted(spotifyTrackId)` — first code to read `track_stats`.
- Added `backend/src/guardrails/queueGuardrails.ts`: four pure guardrail functions — `checkExplicitFilter` (`app_settings["explicit_filter_enabled"]`, default `"true"`, fail-restrictive), `checkDurationBounds` (`min_duration_ms`/`max_duration_ms`, defaults 60000/480000), `checkDuplicate` (takes `currentlyPlayingTrackId`/`queuedTrackIds` as injected params — does NOT fetch Spotify state itself; P2.5 must supply these), `checkBlacklist` (track-level only, see Open Questions) — plus `runQueueGuardrails(track, context)` combining runner that short-circuits in that order (explicit → duration → duplicate → blacklist, cheapest/no-DB first).
- 17 new tests — 87 total passing, confirmed deterministic across two consecutive `npm test` runs (the shared-DB isolation issue P2.3 hit was avoided here — settings reset per test). `npx tsc --noEmit` clean. Verified independently.
- Flagged track-vs-artist blacklist schema gap in Open Questions — needs a decision before admin panel (P3.2/P4.6) exposes blacklist management.
- Next: P2.5 (queue endpoint) — `POST /api/queue` will be the first thing to actually wire together P2.2 (session)/P2.3 (rate limiter)/P2.4 (guardrails) plus the real Spotify queue call and `play_history`/`track_stats` writes. It will need to supply `checkDuplicate`'s now-playing/queue context somehow — likely via `nowPlaying.ts`'s state (may need a small exported getter added, or a fresh `GET /v1/me/player/queue` call) and will need to call P2.3's `recordAllowedRequest` only after guardrails pass.

### 2026-08-23 — P2.3 rate limiter
- Added `rate_limit_state` table (`session_id` PK, `last_allowed_at`) to `runMigrations()` in `backend/src/db/index.ts`.
- Added `backend/src/guardrails/rateLimiter.ts`: `checkRateLimit(sessionId)` (read-only, reads window from `app_settings["rate_limit_window_ms"]`, default `600000`/10min), `recordAllowedRequest(sessionId)` (the only state-mutating call, upserts `last_allowed_at`), and `rateLimitGuestSession` Express middleware (429s with `{error, retryAfterMs}` when limited; passes through if `req.guestSession` absent; deliberately never calls `recordAllowedRequest` itself). **Load-bearing for P2.5**: the route handler must call `recordAllowedRequest` itself, after P2.4's guardrails also pass — not from this middleware — so a request rejected by a later guardrail doesn't consume the rate-limit bucket.
- Fixed a test-isolation bug found during my own verification pass (not introduced by scope, just needed fixing): `rateLimiter.test.ts`'s "default window" test could read a stale `rate_limit_window_ms` value left in the shared real SQLite file (`data/jukebox.db`, no `:memory:` or per-run reset in this project) by an earlier override test/run. Added an explicit reset of that setting to the default in both `beforeEach` blocks in that file. Worth remembering for future guardrail tests that touch `app_settings`: always reset any setting you override, since the DB file persists across test files and across separate `npm test` invocations.
- 8 new tests — 70 total passing (verified independently after the isolation fix). `npx tsc --noEmit` clean.
- Next: P2.4 (content guardrails: explicit filter, duration bounds, duplicate-in-queue, blacklist) — likely lives alongside this in `backend/src/guardrails/`.

### 2026-08-23 — P2.2 guest session issuance
- Added `backend/src/db/guestSessions.ts`: shared helpers `findGuestSession`, `touchGuestSession` (bumps `last_request_at`/`total_requests`, returns `undefined` on no match), `createGuestSession` (new row, `randomUUID()` as `session_id`) — used by both the route and the middleware so the touch-session SQL isn't duplicated.
- Added `backend/src/middleware/guestSession.ts`: `resolveGuestSession` — reads `x-guest-token` header, attaches resolved session to `req.guestSession` if found, always calls `next()` (resolve-only, never creates a session, never blocks the request). This is the extension point P2.3 (rate limiter) and P2.5 (queue endpoint) should mount/build on.
- Added `backend/src/routes/session.ts`: `POST /api/session` — valid token → 200 (reuse + touch), missing/unrecognized token → 201 (create new). Response: `{ token, sessionId, createdAt }`.
- Added `backend/src/types/express.d.ts` augmenting `Express.Request` with optional `guestSession`. Mounted `sessionRouter` in `app.ts` alongside the existing routers.
- 7 new tests (4 route + 3 middleware) — 62 total passing across the backend. `npx tsc --noEmit` clean. Verified independently.
- Next: P2.3 (rate limiter) — token-bucket keyed on `guest_sessions.session_id`, will likely mount `resolveGuestSession` on guest-facing routes to get `req.guestSession` for free.

### 2026-08-23 — P1.5 SSE real-time push (Phase 1 complete)
- Added `backend/src/events/bus.ts`: generic in-process pub/sub (`emitEvent(name, data)` / `subscribe(listener) -> unsubscribe`, Node `EventEmitter`-backed, domain-agnostic) — this is what P2.5 (queue add), P2.6 (leaderboard), and P3.4 (queue moderation) will call into later to broadcast `queue-update`/`leaderboard-update`.
- Added `backend/src/routes/events.ts`: `GET /api/events` SSE endpoint — sets SSE headers, subscribes to the bus, writes `event:`/`data:` frames per emitted event, 15s heartbeat comments, cleans up subscription + heartbeat timer on client disconnect.
- Added `backend/src/spotify/nowPlaying.ts`: `pollNowPlaying()` polls `/v1/me/player/currently-playing` every 4s (default), diffs against last-seen state (re-emits only on track-id change or play/pause flip — progress ticking alone doesn't re-emit), calls `emitEvent('now-playing', ...)` on change. Handles 204/nothing-playing and not-yet-connected (no refresh token) gracefully, mirrors the `startTokenRefreshWorker`/`stopTokenRefreshWorker` pattern. Wired into `src/index.ts`.
- Since P2.5 (queue endpoint) doesn't exist yet, the "queue add delivers a queue-update event" acceptance criterion was validated via a test that calls `emitEvent('queue-update', ...)` directly against a connected SSE client (exercises the same bus→route path P2.5 will use) — full acceptance will be re-confirmed naturally once P2.5 lands and calls `emitEvent` for real.
- 55 tests total passing across the backend (17 new this task). One SSE disconnect test takes ~4s due to Node socket-teardown latency (not a failure, just slow) — noted here in case it's worth a `testTimeout` bump later if it ever gets flaky in CI.
- Phase 1 (Backend Core: Spotify Auth & Proxy) is now fully done: PKCE auth, token refresh, search proxy, device resolution, SSE. Still pending from the user: complete the real one-time Spotify consent at `http://192.168.50.179:8085/api/auth/login` (see Open Questions) — nothing has been exercised against the live Spotify API yet, only against mocks/unit tests.
- Next: Phase 2 (guardrails & guest-facing endpoints), starting at P2.2 (P2.1 schema was already done earlier this session, out of order, since P1.1 depended on its `app_settings` storage).

### 2026-08-23 — P1.4 device resolution
- Added `backend/src/spotify/device.ts`: `listDevices()` (fetches `/v1/me/player/devices`, drops any device with a null id), `resolveDevice()` — prefers a previously-selected `spotify_device_id` if still present in the live list (returns live info, not stale stored copy); else auto-resolves and persists if exactly one device is visible; else returns `resolved: null` with the full list for ambiguous (0 or 2+ device) cases.
- Added `backend/src/routes/device.ts`: `GET /api/device` (200 resolution result, 503 if not connected, 502 on other Spotify errors), `POST /api/device/select` (validates the given id against a fresh live fetch, not stale state; 400 if not found; persists + 200 on success).
- 18 new tests (10 resolution logic + 8 route) — 38 total passing across the backend. `npx tsc --noEmit` clean. Verified independently.
- Next: P1.5 (SSE) is the last Phase 1 task — after that, real playback-control endpoints (Phase 3) will pin `device_id` from this resolution into their calls.

### 2026-08-23 — P1.3 search proxy
- Added `backend/src/spotify/client.ts`: `getValidAccessToken()` (reads access token/expiry from `app_settings`, refreshes via `refreshAccessToken()` if missing or expiring within 60s) and `searchTracks(query, limit, fetchFn?, getTokenFn?)` (calls Spotify `/v1/search?type=track`, shapes to `{id, name, artist, albumArt, durationMs, explicit}` — artists joined with ", ", largest album image used, no filtering applied). Both take injectable deps for testing.
- Added `backend/src/routes/search.ts`: `GET /api/search?q=` — 400 on missing/empty `q`, 503 "Spotify not connected yet" if no refresh token stored, 502 on other Spotify errors, 200 with shaped array otherwise. Mounted at `/api/search` in `app.ts`.
- 14 new tests (`client.test.ts` + `search.test.ts`, on top of P1.2's 6) — 20 total passing; explicitly asserts explicit-flagged tracks are NOT filtered (that's P2.4's job). `npx tsc --noEmit` clean. Verified independently.
- Next: P1.4 (device resolution) — same token-acquisition pattern (`getValidAccessToken`) will likely be reused for `/v1/me/player/devices` calls.

### 2026-08-23 — P1.2 token refresh worker; .env PORT fixed
- Added `backend/src/spotify/tokenRefresh.ts`: `refreshAccessToken()` (reads `spotify_refresh_token` fresh from `app_settings` every call — safe across restarts — exchanges it via Spotify's token endpoint, persists new access token/expiry, only overwrites the stored refresh token if Spotify rotated it), `startTokenRefreshWorker(intervalMs?, refreshFn?)` (default 50 min, catches/logs per-attempt errors so one failure doesn't kill the process, `.unref()`'d), `stopTokenRefreshWorker()`. Wired into `src/index.ts` after `runMigrations()`.
- Added `vitest` (new devDependency, `npm test` script) — first test framework in the backend. 6 unit tests cover request shape, success persistence, refresh-token rotation, missing-token/HTTP-error rejection paths, and interval scheduling via fake timers. All pass (verified independently).
- Fixed `backend/.env`: `PORT` was `80085` (invalid, >65535 max) — corrected to `8085`, `SPOTIFY_REDIRECT_URI` updated to match. **User action needed**: update the redirect URI in the Spotify dashboard to match, then complete the one-time consent (see Open Questions) — nothing in P1.1/P1.2 has been exercised against the real Spotify API yet, only unit/mock-verified.
- Next: P1.3 (search proxy) doesn't depend on the consent flow being done yet (uses the same token machinery once it exists) — can proceed in parallel with the user completing consent whenever convenient.

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
