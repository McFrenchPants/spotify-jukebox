# Responsive / Landscape Layout — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (all resolved, §7).

All work happens on `feature/landscape-layout` — confirm you're on that
branch before making any changes.

## Status: Phase L2 done, L3 next

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| L0.1 | Extract shared nav items/icons | done | `frontend/src/components/nav/navItems.tsx`; `BottomNav.tsx` now imports `NAV_ITEMS` from it |
| L0.2 | Shared content-width classes | done | `CONTENT_MAX_WIDTH` in `frontend/src/lib/layout.ts`, currently just `'max-w-lg'`; `AppShell.tsx` header + `<main>` both reference it. L2.1 is the task that actually widens the constant's value |
| L1.1 | Build `SideNav` | done | `frontend/src/components/nav/SideNav.tsx`; settled on `w-48` (12rem) rail width as suggested, no adjustment needed |
| L1.2 | Wire both nav variants side by side | done | `BottomNav` got `sm:hidden`; `SideNav` rendered as a sibling of `AppShell` in `RootLayout.tsx`. Both always mounted, CSS breakpoints toggle visibility |
| L1.3 | Adjust `AppShell` spacing for the rail | done | `<main>` + header inner wrapper get `sm:pl-48`; `<main>`'s bottom-bar padding reservation now drops to the no-bottom-bar value at `sm`+ via Tailwind arbitrary-value classes (replaced the old inline-style padding since inline styles can't express `sm:` overrides) |
| L2.1 | Apply three-tier width to the shell | done | `CONTENT_MAX_WIDTH` now `'max-w-lg sm:max-w-2xl lg:max-w-[1200px]'`; `AppShell.tsx` needed no changes, already consumed the shared constant |
| L2.2 | QA sweep at the new widths | done | Capped 4 naked `w-full`/`flex-1` controls with no max of their own (search input `max-w-2xl`; volume slider, rate-limit slider, blacklist input each `lg:max-w-sm`). Card-row layouts (NowPlaying, Search results, History) already truncate correctly via `min-w-0 flex-1`, no changes needed. Two admin-page fixes (SettingsForm, QueueModeration) verified by code-pattern equivalence rather than live render — PIN gate blocks reaching those controls without entering a credential, which is out of bounds |
| L3.1 | HistoryPage side-by-side at `lg` | todo | depends on L2 (done) — ready to start |
| L3.2 | SettingsPage pairing at `lg` | todo | depends on L2; cuttable, confirm with user before spending time |
| L3.3 | NowPlaying expanded-card revisit | todo | optional/stretch — may resolve to "no change needed" |
| L4.1 | Cross-size manual verification pass | todo | depends on L1-L3; real-hardware check flagged as a caveat, not blocking |
| L4.2 | Close out (backlog, PROGRESS.md, merge) | todo | depends on L4.1 |

## Open Questions / Blockers

*(none currently — DESIGN_SPEC §7 resolved all of them before this plan was written)*

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-08-29** — Phase L2 complete (L2.1, L2.2), each via a
  narrowly-scoped subagent, verified (diff read + `tsc -b` clean +
  browser DOM/computed-width checks — screenshot compositing still
  unavailable in this session's Browser pane) and committed separately
  (`f45da69`, `c23d96c`). L2.1: `CONTENT_MAX_WIDTH` now resolves through
  all three tiers (512px / 672px / capped 1200px), confirmed by
  measuring `<main>`'s rendered width at 600px/700px/1400px viewports.
  L2.2: swept all four guest+admin pages at four widths; found and fixed
  4 controls that had no `max-w` of their own and stretched
  full-column-width at the new wider tiers (search input, volume
  slider, rate-limit-window slider, blacklist input) — all other
  content uses `Card`-row flex-truncation patterns that already scale
  correctly (more breathing room, not stretching). Note: the two
  admin-page fixes (in `SettingsForm.tsx`, `QueueModeration.tsx`)
  couldn't be live-verified in the browser because reaching them
  requires entering the admin PIN, which is off-limits per the
  session's credential-entry policy — they were verified instead by
  confirming they use the exact same Tailwind pattern as the two
  live-verified fixes (deterministic CSS, not dynamic-content-dependent
  layout), so this is a reasonable but slightly weaker verification than
  the rest of this phase. Phase L3 (per-page reflow — HistoryPage
  side-by-side, optionally SettingsPage/NowPlaying) is next; L3.1 has no
  remaining blockers now that L2 is done. Note L3.2 is flagged
  "cuttable, confirm with user before spending time" and L3.3 is
  optional/stretch — worth checking with the user before spending
  effort on those two specifically, even though L3.1 itself is clear to
  start.
- **2026-08-29** — Phase L1 complete (L1.1, L1.2, L1.3), each via a
  narrowly-scoped subagent, verified (diff read + `tsc -b` clean +
  browser check of computed styles/DOM at 375px and 1200px — screenshot
  compositing wasn't available in this session's Browser pane, so
  verification used `javascript_tool` computed-style/display checks
  instead) and committed separately (`f92318f`, `6fbdc98`, `483d162`).
  Confirmed at 375px: `BottomNav` visible, `SideNav` hidden, padding
  pixel-identical to before (16px left / 88px bottom). At 1200px:
  `SideNav` visible (192px rail), `BottomNav` hidden, `<main>` picks up
  `sm:pl-48` (192px) and drops to the 24px/1.5rem bottom-bar-free
  padding. Rail width settled at the suggested `w-48` with no
  adjustment needed. This is a natural stopping point per the proposal's
  own guidance (phase boundary, width still unchanged until L2) — good
  spot for a user visual sanity check before L2 widens the content
  column. L2 (content width scaling) is next; L2.1 has no remaining
  blockers now that L0.2 is done.
- **2026-08-29** — Phase L0 complete (L0.1, L0.2), each via a narrowly-scoped
  subagent, verified (diff read + `tsc --noEmit` clean) and committed
  separately (`7272d9d`, `ae58750`). Zero visual change, as intended — this
  phase was pure foundation-laying. L1 (side rail nav) is next; L1.1 has no
  remaining blockers now that L0.1 is done.
- **2026-08-29** — Plan created (`IMPLEMENTATION_PLAN.md`) and this tracker
  initialized. No implementation started yet.
