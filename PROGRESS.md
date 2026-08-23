# Guest Jukebox — Progress Tracker

**Read this file first in any new session.** It's the source of truth for what's done, what's next, and any context needed to resume. Task scopes/acceptance criteria live in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md); the frozen requirements are in [docs/DESIGN_SPEC.md](docs/DESIGN_SPEC.md).

## Status: Not started — spec & plan finalized, no code written yet

**Next task: P0.1 — Repo skeleton**

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| P0.1 | Repo skeleton | todo | |
| P0.2 | Backend project init | todo | |
| P0.3 | Frontend project init | todo | |
| P0.4 | Env & secrets template | todo | |
| P0.5 | Design system & style guide | todo | Dark, album-art-driven theme; tokens + primitives + `/style-guide` route |
| P1.1 | PKCE auth flow | todo | Needs a real Spotify Developer app (client ID/secret) — see Open Questions |
| P1.2 | Token refresh worker | todo | |
| P1.3 | Search proxy | todo | |
| P1.4 | Device resolution | todo | |
| P1.5 | Real-time push (SSE) | todo | `/api/events`; replaces client-side polling |
| P2.1 | SQLite schema & migrations | todo | |
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

- **Spotify Developer app**: need a Client ID/Secret from [developer.spotify.com](https://developer.spotify.com/dashboard) with a redirect URI matching the backend's callback route, before P1.1 can be completed end-to-end (it can still be coded against mocks first).
- **Admin PIN value**: not yet chosen — needed before P3.1's first real run (can default to a placeholder in `.env.example`).

## Session Log

Newest entry on top. One entry per work session — what got done, what's next, anything a future session needs to know that isn't obvious from the task table.

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
