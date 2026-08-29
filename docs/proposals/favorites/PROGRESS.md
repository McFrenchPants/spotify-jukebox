# Favorites — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (approved).

All work happens on `feature/favorites` — confirm you're on that branch
before making any changes.

## Status: Phase F0 in progress

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| F0.1 | Schema (guest_sessions columns + favorites table) | todo | |
| F0.2 | DB module (`favorites.ts` + `guestSessions.ts` updates) | todo | Depends on F0.1 |
| F1.1 | Favorites routes | todo | Depends on F0.2 |
| F1.2 | Guest profile route + queue attribution join | todo | Depends on F0.2 |
| F2.1 | API client + avatar palette | todo | Depends on F1.1/F1.2 (calls the new endpoints) |
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
