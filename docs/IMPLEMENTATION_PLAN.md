# Guest Jukebox — Master Implementation Plan

Reference: [DESIGN_SPEC.md](DESIGN_SPEC.md). Progress is tracked in [PROGRESS.md](../PROGRESS.md) at the repo root — that file is the source of truth for "what's done and what's next," not this one. This file defines scope per task; don't duplicate status here.

Stack decision for implementation: **Node.js/Express backend, React (Vite) PWA frontend, better-sqlite3 for storage, Server-Sent Events for live updates (no WebSockets, no external message broker).** (Chosen over FastAPI/Next.js for a single-language repo and simpler Docker image; revisit only if a strong reason emerges.)

Each task below has an ID (`P<phase>.<n>`), a scope, and acceptance criteria. An agent picking up a task should read the linked spec section, implement just that scope, update PROGRESS.md, and stop — don't bleed into the next task.

---

## Phase 0 — Scaffolding

- **P0.1 — Repo skeleton**: `backend/`, `frontend/`, `docs/` layout; root `.gitignore`, `.editorconfig`, `README.md` with run instructions stub. Git repo initialized with an initial commit.
  - Accept: `git status` clean, `git log` shows initial commit, folders exist.
- **P0.2 — Backend project init**: Express app skeleton (`backend/`), TypeScript config, health check route (`GET /api/health`), dotenv loading, npm scripts (`dev`, `build`, `start`).
  - Accept: `npm run dev` serves `/api/health` → 200 locally.
- **P0.3 — Frontend project init**: Vite + React + Tailwind skeleton (`frontend/`), PWA manifest stub, npm scripts (`dev`, `build`).
  - Accept: `npm run dev` serves a placeholder page locally.
- **P0.4 — Env & secrets template**: `.env.example` covering Spotify client ID/secret, redirect URI, admin PIN, port, DB path. `.env` gitignored.
  - Accept: file exists, README references it, no real secrets committed.
- **P0.5 — Design system & style guide**: Tailwind theme config for the dark, album-art-driven palette (DESIGN_SPEC §9a) — color/typography/spacing/radius/motion tokens; build the component primitives (button variants incl. pressed state, card, toast, skeleton loader, modal/sheet); write `docs/DESIGN_SYSTEM.md` documenting the tokens and when to use each primitive; add a dev-only `/style-guide` route rendering every primitive/token for visual review.
  - Accept: `/style-guide` route renders all primitives against the documented tokens; no component built in later phases introduces a one-off color/spacing/font value outside this system.

## Phase 1 — Backend Core: Spotify Auth & Proxy

Spec ref: DESIGN_SPEC §8.

- **P1.1 — PKCE auth flow**: `/api/auth/login` (redirect to Spotify), `/api/auth/callback` (exchange code, persist tokens). One-time admin-run flow, not per-guest.
  - Accept: manual run against a real Spotify app completes and access+refresh tokens are persisted (see P2.1 for storage).
- **P1.2 — Token refresh worker**: background interval refreshing access token every 50 min using stored refresh token; safe on process restart (reads persisted refresh token).
  - Accept: unit test mocks the timer/refresh call; manual test confirms a forced refresh updates the stored access token.
- **P1.3 — Search proxy**: `GET /api/search?q=` → proxies `GET /v1/search` (tracks only), shapes response to {id, name, artist, albumArt, durationMs, explicit}.
  - Accept: integration test against a mocked Spotify client returns shaped results; explicit-filter and blacklist are NOT applied here (that's P2.4) — this is the raw proxy.
- **P1.4 — Device resolution**: `GET /v1/me/player/devices` polling + endpoint `GET /api/device` returning resolved bridge device, `POST /api/device/select` for admin override when multiple devices are visible.
  - Accept: with a mocked device list, resolution picks a configured/previously-selected device id; override endpoint persists the choice to `app_settings`.
- **P1.5 — Real-time push (SSE)**: `GET /api/events` SSE endpoint (DESIGN_SPEC §6a/§7a) — internal 3–5s poll of Spotify's currently-playing endpoint, diffed and broadcast as a `now-playing` event to connected clients only on change; `queue-update` and `leaderboard-update` events broadcast from P2.5/P2.6/P3.4 write paths (in-process event emitter, no external broker needed at this scale); periodic heartbeat comment to keep connections alive.
  - Accept: connecting a test SSE client and then triggering a queue add (via P2.5) delivers a `queue-update` event within ~1s; an idle connection stays open past typical proxy/browser timeouts via heartbeat.

## Phase 2 — Database & Guardrails

Spec ref: DESIGN_SPEC §6, §7.

- **P2.1 — SQLite schema & migrations**: create `play_history`, `guest_sessions`, `track_stats`, `app_settings` tables per spec. Migration runner (even a simple idempotent "create if not exists" script is fine for v1).
  - Accept: fresh DB file created on first run with all 4 tables; schema matches spec column list.
- **P2.2 — Guest session issuance**: `POST /api/session` creates/returns an ephemeral guest token + row in `guest_sessions`; middleware resolves token from a header/cookie on subsequent requests.
  - Accept: repeated calls without a token create new sessions; calls with a valid token reuse and update `last_request_at`/`total_requests`.
- **P2.3 — Rate limiter**: token-bucket per `guest_sessions.session_id`, default 1/10min, values read from `app_settings`.
  - Accept: unit test — Nth request within window is rejected with a clear error, request after window succeeds.
- **P2.4 — Content guardrails on queue submission**: explicit filter, duration bounds, duplicate-in-queue check, blacklist check, all reading live values from `app_settings` — applied in `POST /api/queue` before calling Spotify.
  - Accept: unit tests, one per guardrail, covering both the "blocked" and "allowed" path.
- **P2.5 — Queue endpoint & analytics write**: `POST /api/queue` (guest-facing, guarded by P2.3+P2.4) calls `POST /v1/me/player/queue` with the resolved device id, then writes `play_history` and upserts `track_stats`.
  - Accept: end-to-end test (mocked Spotify) — a valid request results in one Spotify call, one `play_history` row, `track_stats.play_count` incremented.
- **P2.6 — Leaderboard & recently-played reads**: `GET /api/leaderboard` (top `track_stats` by play_count, excluding blacklisted), `GET /api/recent` (latest `play_history`).
  - Accept: returns correctly ordered/filtered results against seeded test data.

## Phase 3 — Admin & Trust Mode

Spec ref: DESIGN_SPEC §3, §4.

- **P3.1 — Admin PIN auth**: `POST /api/admin/login` (PIN → short-lived signed session token), PIN hashed in `app_settings` (set on first run from `.env` or a setup step), middleware protecting all `/api/admin/*` routes.
  - Accept: wrong PIN rejected, correct PIN issues a token, protected route rejects requests without a valid admin token.
- **P3.2 — Settings CRUD**: `GET/PUT /api/admin/settings` for all `app_settings` (rate limit window, explicit filter, duration bounds, trust mode + individual toggle overrides).
  - Accept: PUT persists and is reflected in subsequent guardrail behavior (P2.4) without a server restart.
- **P3.3 — Trust-mode-gated playback controls**: `POST /api/playback/{pause,resume,skip}`, `POST /api/playback/volume`, guarded by current trust mode/toggles (checked for every request, not just at session start).
  - Accept: with Restricted mode active, guest calls are rejected; with Trusted mode (or the specific toggle) active, calls succeed and hit the Spotify player API.
- **P3.4 — Queue moderation**: admin-only `GET /api/admin/queue` (list, needed so an admin can address entries by id), `DELETE /api/admin/queue/:id`, `POST /api/admin/blacklist` (track or artist), `POST /api/admin/queue/clear`.
  - Since Spotify's API has no remove-single/clear-queue endpoint, this task also introduces the `queue_entries` local queue mirror and the resync-via-replace mechanism described in DESIGN_SPEC §6b — decided with the user 2026-08-23 (hybrid local+Spotify sync, full resync on any moderation action, rejected feeding Spotify one track at a time due to desync risk on disconnect). This revises P2.5's `POST /api/queue` (adds a `queue_entries` insert) and P1.5's now-playing poller (dequeues on track advance) as a side effect — both still keep their original behavior otherwise.
  - Artist blacklist uses the `app_settings` JSON-array approach (option 2 from the P2.4-era open question), not a dedicated artist table.
  - Accept: blacklist add is immediately enforced by P2.4; clear empties `queue_entries` and Spotify's live queue via resync; remove-by-id does the same for a single entry.

## Phase 4 — Frontend PWA

Spec ref: DESIGN_SPEC §3–§5.

- **P4.1 — App shell & session bootstrap**: PWA manifest/icons, on-load calls `/api/session`, persists guest token in localStorage, global mobile-first layout built on the P0.5 design system (dark theme, base layout with the dynamic album-art background container).
  - Accept: loads on a mobile viewport using P0.5 tokens/primitives (no ad hoc styling), session token visible in localStorage after first load.
- **P4.2 — Search & queue UI**: debounced search box (P0.5 skeleton-loader state while a query is in flight, designed empty/no-results states), result list (art/name/artist/duration), "Add to queue" action wired to `POST /api/queue` with optimistic UI, inline error surfacing with distinct copy per guardrail (rate-limited / explicit / duplicate / too short / too long / blacklisted).
  - Accept: manual test — search shows a skeleton then results (not a blank flash), queueing a track appears instantly with a success toast, and each guardrail rejection shows its own distinct, understandable message.
- **P4.3 — Now playing & queue view (SSE-driven)**: subscribes to `/api/events` (P1.5) for now-playing/queue updates — no client-side polling; animated crossfade transition on track change (art/title/artist), elapsed/remaining progress indicator; manual-refresh fallback affordance if the SSE connection drops and doesn't auto-recover within a few seconds.
  - Accept: reflects a manually-queued track and a real playback change within ~1s via a pushed event, not a fixed poll interval; verified working after backgrounding/resuming the browser tab (reconnect path).
- **P4.4 — Leaderboard & recently played views**: two list views wired to P2.6 endpoints, updating live from `leaderboard-update` SSE events rather than requiring a manual reload.
  - Accept: renders seeded data correctly; a new queue event visibly updates the leaderboard without a page refresh.
- **P4.5 — Trust-mode-aware playback controls**: pause/resume/skip/volume buttons, shown/enabled based on current mode (fetched from a public-safe subset of settings), calling P3.3 endpoints, with pressed/active touch feedback states from P0.5.
  - Accept: controls hidden/disabled in Restricted mode, functional in Trusted mode.
- **P4.6 — Admin panel UI**: PIN entry screen, settings form (P3.2), queue moderation actions (P3.4), device selector (P1.4), QR code display/print view for the guest URL.
  - Accept: manual walkthrough of PIN login → change a setting → see it take effect on the guest side.
- **P4.7 — Micro-interactions & motion pass**: dedicated polish pass across P4.1–P4.6 — verify every transition uses P0.5's motion tokens (no per-component ad hoc timing), toast queueing/stacking behaves when multiple fire in quick succession, `prefers-reduced-motion` disables non-essential animation, and all touch targets meet a minimum comfortable size for phone use.
  - Accept: a manual pass through every screen confirms consistent motion/timing and touch-target sizing; reduced-motion setting verified to visibly change behavior.

## Phase 5 — Audio Bridge, Packaging & Hardening

Spec ref: DESIGN_SPEC §2, §9.

- **P5.1 — Bridge phone setup runbook**: written doc (`docs/BRIDGE_SETUP.md`) — steps to prep the dedicated phone (Spotify login, Bluetooth pairing, keep-alive settings, auto-reconnect behavior) and how to verify it shows up in `GET /api/device`.
  - Accept: doc exists and a fresh phone can be set up by following it without additional help.
- **P5.2 — Dockerfile & Compose**: multi-stage Dockerfile (backend build + serve frontend static build), `docker-compose.yml` with LAN-only port publish, volume for SQLite + token persistence, env passthrough.
  - Accept: `docker compose up` on the target host serves the full app end-to-end against a real Spotify account.
- **P5.3 — LAN discovery**: decide and implement `jukebox.local` (avahi/mDNS) or document static LAN IP:port fallback; QR code generation in admin panel encodes the resolved URL.
  - Accept: QR code scanned from a phone on the same wifi opens the guest app.
- **P5.4 — Resilience pass**: handle Spotify token expiry mid-session, bridge device going offline (clear error state + admin notice), backend restart recovering DB/token state from the mounted volume.
  - Accept: manual fault-injection checklist in `docs/BRIDGE_SETUP.md` or a new `docs/RUNBOOK.md`, each item verified once.
- **P5.5 — End-to-end smoke test**: real-world test with 2+ devices queuing concurrently, verifying rate limiting, guardrails, leaderboard, and admin controls all behave under real network conditions.
  - Accept: checklist in PROGRESS.md session log, signed off manually by the user.

---

## Working agreements for agents picking up tasks

1. Read [PROGRESS.md](../PROGRESS.md) first — find the next `todo` task in order (phases are meant to be roughly sequential, but P4.x can start once its P1–P3 dependency endpoints exist).
2. Do one task at a time. Update its status to `in-progress` before starting and `done` (with a one-line note) when finished, per the format in PROGRESS.md.
3. If a task turns out to need something not yet specified here, add it as a new sub-task in this file rather than silently expanding scope, and note it in PROGRESS.md's session log.
4. Don't invent new phases/tasks ahead of need — this plan can be amended as we learn things, but resist speculative work.
