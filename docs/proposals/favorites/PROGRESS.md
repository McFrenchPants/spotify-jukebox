# Favorites — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (approved).

All work happens on `feature/favorites` — confirm you're on that branch
before making any changes.

## Status: Phase F0+F1 (backend) done, starting F2 (frontend)

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| F0.1 | Schema (guest_sessions columns + favorites table) | done | `addColumnIfMissing()` helper in `backend/src/db/index.ts` for the idempotent `ALTER TABLE`; `favorites` table + 2 indexes added to the existing migration block |
| F0.2 | DB module (`favorites.ts` + `guestSessions.ts` updates) | done | `backend/src/db/favorites.ts` (add/remove/list/batch-status) + `updateGuestProfile()` in `guestSessions.ts`; 16 new tests, all passing (272 total backend tests green) |
| F1.1 | Favorites routes | done | `backend/src/routes/favorites.ts`: `GET/POST /api/favorites`, `DELETE /api/favorites/:trackId`, `GET /api/favorites/status` (never 400s even with no session — always safe for heart-coloring) |
| F1.2 | Guest profile route + queue attribution join | done | `PATCH /api/session/me` (nickname/avatar); `POST /api/session` now returns them too; `listQueueEntries()` left-joins `guest_sessions`, adding `adderNickname`/`adderAvatar` (null when unset/unattributed) — **these are the exact field names F3.3 must consume** |
| F2.1 | API client + avatar palette | todo | Depends on F1.1/F1.2 (done) — calls `GET/POST/DELETE /api/favorites`, `GET /api/favorites/status`, `PATCH /api/session/me` |
| F2.2 | "Me" page + nav entry | todo | Depends on F2.1 |
| F3.1 | `FavoriteButton` + `useFavoritesStatus` hook | todo | Depends on F2.1 |
| F3.2 | Now Playing integration | todo | Depends on F3.1 |
| F3.3 | Queue + attribution integration | todo | Depends on F3.1, F1.2 |
| F3.4 | History (Leaderboard + Recently Played) integration | todo | Depends on F3.1 |
| F4.1 | Favorites list on Find Music | todo | Depends on F3.1 |
| F5.1 | Backend test sweep | todo | Depends on F1.1, F1.2 |
| F5.2 | Manual verification pass | todo | Depends on all F2-F4 |
| F5.3 | Close out (backlog, PROGRESS.md, merge) | todo | Requires explicit user go-ahead to merge |

## Open Questions / Blockers

*(none currently — the "Scoping decisions made while planning" section of
IMPLEMENTATION_PLAN.md resolved DESIGN_SPEC's two open questions before this
plan was written)*

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-08-29** — F1.1+F1.2 complete via two parallel subagents (independent
  files — favorites.ts/app.ts vs. session.ts/queueEntries.ts/queue.ts — no
  merge conflict), verified together (diff read + `tsc --noEmit` clean +
  full backend suite: 35 files/292 tests passing) and committed (`e7cf0df`).
  Backend is now fully done: `GET/POST /api/favorites`,
  `DELETE /api/favorites/:trackId`, `GET /api/favorites/status` (the last one
  deliberately never 400s even with no guest session, since heart-coloring
  in the UI must work for every guest regardless of session state);
  `PATCH /api/session/me` for nickname/avatar (and `POST /api/session` now
  echoes them back); `GET /api/queue` rows now carry `adderNickname`/
  `adderAvatar` (null when the adder never set a profile, or the entry has
  no attributed guest at all) via a `LEFT JOIN` in `listQueueEntries()`.
  **Stopping here** — this is a clean phase boundary (all of Phase F0+F1,
  i.e. the entire backend, done and tested) before starting the frontend
  phases (F2-F4), which are more visually/subjectively driven (new nav tab,
  heart controls across 5 render sites, avatar picker) and worth a natural
  checkpoint. No blockers — F2.1 has everything it needs from the API.
- **2026-08-29** — F0.1+F0.2 complete via a subagent, verified (diff read +
  `tsc --noEmit` clean + full backend test suite: 34 files/272 tests
  passing) and committed (`f3b96ae`). Data model is now in place: `favorites`
  table with a `UNIQUE(guest_session_id, spotify_track_id)` constraint (so
  `addFavorite` is a safe no-op on a repeat call via `ON CONFLICT DO
  NOTHING`), `nickname`/`avatar` columns added to `guest_sessions`
  idempotently (checked via `PRAGMA table_info` since that table already
  exists in production DBs predating this migration — plain `CREATE TABLE IF
  NOT EXISTS` wouldn't retrofit columns onto it). `getFavoriteStatusForTracks`
  does the batch "mine vs. anyone's" lookup needed for the heart-coloring UI
  in one query. F1 (backend routes) is next — no blockers, F0.2 is complete.
- **2026-08-29** — Plan created (`IMPLEMENTATION_PLAN.md`) and this tracker
  initialized, via `/continue-development` picking up BACKLOG.md item 3 per
  explicit user request (design spec was already pre-approved, so scaffolding
  skipped straight from spec to plan without a review gate). Branch
  `feature/favorites` created off `master`. An exploration pass mapped the
  existing codebase first: notably, the app already has a guest
  identification mechanism (`guest_sessions` table + `x-guest-token` header +
  `SessionContext`) that covers everything DESIGN_SPEC's "Guest ID" section
  asks for — the plan reuses it (adds `nickname`/`avatar` columns) rather
  than inventing a parallel identity system. `queue_entries` already has
  `added_by_session_id`, so the "who queued this" attribution feature is
  mostly a join + column exposure, not new tracking. Avatar set resolved to
  a fixed emoji palette (spec's suggested fallback). No implementation
  started yet — F0.1 is next.
