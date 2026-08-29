# Responsive / Landscape Layout — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (all resolved, §7).

All work happens on `feature/landscape-layout` — confirm you're on that
branch before making any changes.

## Status: not started

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| L0.1 | Extract shared nav items/icons | todo | |
| L0.2 | Shared content-width classes | todo | |
| L1.1 | Build `SideNav` | todo | depends on L0.1 |
| L1.2 | Wire both nav variants side by side | todo | depends on L1.1 |
| L1.3 | Adjust `AppShell` spacing for the rail | todo | depends on L1.1/L1.2 |
| L2.1 | Apply three-tier width to the shell | todo | depends on L0.2 |
| L2.2 | QA sweep at the new widths | todo | depends on L2.1 |
| L3.1 | HistoryPage side-by-side at `lg` | todo | depends on L2 |
| L3.2 | SettingsPage pairing at `lg` | todo | depends on L2; cuttable, confirm with user before spending time |
| L3.3 | NowPlaying expanded-card revisit | todo | optional/stretch — may resolve to "no change needed" |
| L4.1 | Cross-size manual verification pass | todo | depends on L1-L3; real-hardware check flagged as a caveat, not blocking |
| L4.2 | Close out (backlog, PROGRESS.md, merge) | todo | depends on L4.1 |

## Open Questions / Blockers

*(none currently — DESIGN_SPEC §7 resolved all of them before this plan was written)*

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-08-29** — Plan created (`IMPLEMENTATION_PLAN.md`) and this tracker
  initialized. No implementation started yet.
