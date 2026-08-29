# Responsive / Landscape Layout — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (all resolved, §7).

All work happens on `feature/landscape-layout` — confirm you're on that
branch before making any changes.

## Status: Phase L0 done, L1 next

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| L0.1 | Extract shared nav items/icons | done | `frontend/src/components/nav/navItems.tsx`; `BottomNav.tsx` now imports `NAV_ITEMS` from it |
| L0.2 | Shared content-width classes | done | `CONTENT_MAX_WIDTH` in `frontend/src/lib/layout.ts`, currently just `'max-w-lg'`; `AppShell.tsx` header + `<main>` both reference it. L2.1 is the task that actually widens the constant's value |
| L1.1 | Build `SideNav` | todo | depends on L0.1 (done) — ready to start |
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

- **2026-08-29** — Phase L0 complete (L0.1, L0.2), each via a narrowly-scoped
  subagent, verified (diff read + `tsc --noEmit` clean) and committed
  separately (`7272d9d`, `ae58750`). Zero visual change, as intended — this
  phase was pure foundation-laying. L1 (side rail nav) is next; L1.1 has no
  remaining blockers now that L0.1 is done.
- **2026-08-29** — Plan created (`IMPLEMENTATION_PLAN.md`) and this tracker
  initialized. No implementation started yet.
