# Lyrics Integration — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (approved by the user 2026-08-30).

All work happens on `feature/lyrics-integration` — confirm you're on that
branch before making any changes.

## Status: Implementation starting — LY0 (backend foundation) in progress

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| LY0.1 | Lyrics DB table + LRCLIB client | todo | |
| LY0.2 | Lyrics lookup + cache orchestration | todo | Depends on LY0.1 |
| LY1.1 | Trigger lookup on track change, emit SSE event | todo | Depends on LY0.2 |
| LY1.2 | `GET /api/lyrics` route | todo | Depends on LY1.1. **Phase LY0+LY1 (backend) complete once done.** |
| LY2.1 | API client + types | todo | Depends on LY1.2 |
| LY2.2 | LRC parsing + auto-scroll hook | todo | Depends on LY1.2 (types only, can start alongside LY2.1) |
| LY2.3 | `LyricsPanel` + wiring into `NowPlaying.tsx` | todo | Depends on LY2.1, LY2.2 |
| LY3.1 | Cross-cutting regression pass | todo | Depends on LY2.3 |
| LY3.2 | Close out (backlog, PROGRESS.md, merge) | todo | Depends on LY3.1. Needs explicit user go-ahead to merge |

## Open Questions / Blockers

*(none currently — DESIGN_SPEC.md's open questions were all judged small
enough to resolve during implementation, per the spec itself)*

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-08-30** — Plan created (`IMPLEMENTATION_PLAN.md`) and this tracker
  initialized via `/continue-development`, picking up BACKLOG.md item 1.
  Design spec was reviewed and approved by the user before this. No
  implementation started yet — LY0.1 is next, no blockers.
