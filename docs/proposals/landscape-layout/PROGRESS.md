# Responsive / Landscape Layout — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (all resolved, §7).

All work happens on `feature/landscape-layout` — confirm you're on that
branch before making any changes.

## Status: L4.1 done, L4.2 (close-out/merge) needs a user go-ahead

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
| L3.1 | HistoryPage side-by-side at `lg` | done | `Leaderboard`/`RecentlyPlayed` wrapped in `lg:w-1/2` divs inside `flex flex-col gap-6 lg:flex-row`; even 50/50 split chosen (both are single-column Card-row lists with no internal grid) |
| L3.2 | SettingsPage pairing at `lg` | done | User confirmed doing it rather than cutting it. Two `flex flex-col gap-6 lg:flex-row` rows: `SettingsForm`+`DeviceSelector`, `QueueModeration`+`GuestUrlCard`, each child `lg:w-1/2`. Verified by code review only — PIN gate blocks live rendering without entering a credential, which is out of bounds |
| L3.3 | NowPlaying expanded-card revisit | done | Did NOT resolve to "no change needed" — measured the expanded card's track-info column stretching to ~767px with a disproportionate hairline progress bar at 1200px, judged as genuine dead space (unlike sibling Card-rows). Applied `lg:flex`/`lg:w-1/2` split (art+info left, artist+genre right, `lg:border-l`) gated on `expanded && detailArtist` so collapsed/loading states are untouched |
| L4.1 | Cross-size manual verification pass | done | Checked all 4 pages at 375×812, 750×400, 768×1024, 1024×768, 640×900, 1440×900 via DOM/computed-style inspection (screenshot compositing unavailable all session — acceptance criteria's "screenshots attached" couldn't be literally satisfied in this environment, flagged as a gap below). No regressions found; phone-portrait (375px) confirmed pixel-identical (nav, padding, width all match pre-proposal values). Real-hardware bridge-phone check still not done — non-blocking caveat, carried forward |
| L4.2 | Close out (backlog, PROGRESS.md, merge) | todo | depends on L4.1 (done) — ready, but ends in a merge to `master`; supervisor is holding for explicit user go-ahead before executing the merge (and before deciding whether root `PROGRESS.md` needs an entry) rather than doing it unattended |

## Open Questions / Blockers

*(none currently — DESIGN_SPEC §7 resolved all of them before this plan was written)*

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-08-29** — L4.1 complete (verification-only, no code changes) via
  a subagent, swept all four pages at six widths (375×812 phone
  portrait, 750×400 phone landscape, 768×1024 and 1024×768 tablet both
  orientations, 640×900 and 1024×768 as the exact `sm`/`lg` boundaries,
  1440×900 maximized desktop) using DOM/computed-style/bounding-rect
  inspection — screenshot compositing has been unavailable in this
  Browser pane for the entire proposal, so the acceptance criteria's
  literal "screenshots attached" couldn't be met; this is a real gap
  against the written acceptance bar, worth noting explicitly rather
  than quietly substituting DOM checks and calling it equivalent. No
  regressions found at any tier; phone-portrait (375px) confirmed
  pixel-identical to pre-proposal (bottom bar visible/rail hidden,
  16px/88px padding, 512px content width — unchanged). Phone-landscape
  confirmed the rail replaces the bottom bar and the freed bottom
  padding (88px→24px) gives real usable height back, with no
  clipping/overflow despite the short 400px viewport. `lg`+ reflows
  (HistoryPage side-by-side, search input capping) confirmed live;
  NowPlaying's expanded split and SettingsPage's admin pairing could
  not be live-triggered this pass (no active track in dev; PIN gate)
  and rely on the code-review verification already done in L3.2/L3.3 —
  not re-verified live here. Real-hardware bridge-phone check remains
  an explicit non-blocking caveat, not attempted. Only remaining task is
  L4.2 (backlog update, possible root PROGRESS.md entry, merge to
  `master`) — **stopping here to get explicit user go-ahead before
  executing the merge**, per this session's own standing guidance on
  hard-to-reverse/shared-state actions, rather than doing it
  unattended.
- **2026-08-29** — Phase L3 complete (L3.1, L3.2, L3.3), each via a
  narrowly-scoped subagent, verified (diff read + `tsc -b` clean) and
  committed separately (`0185dd8`, `551d74e`, `a8227c5`). L3.1
  (HistoryPage) and L3.3 (NowPlaying) were live-verified via browser
  DOM/computed-rect inspection at `lg` and sub-`lg` widths (screenshot
  compositing still unavailable this session). L3.2 (SettingsPage) is
  code-review-verified only — its content sits behind the admin PIN
  gate, and entering a PIN/credential to get past it is off-limits per
  this session's security policy; the diff mirrors the exact pattern
  already live-verified in L3.1, which is a reasonable but weaker
  confidence level, flagged explicitly. The user was asked and
  confirmed doing L3.2 rather than cutting it (it had been flagged
  cuttable in the plan). L3.3 is worth calling out: it did NOT resolve
  to "no change needed" as the plan considered likely — the subagent
  measured the expanded card's progress bar stretching to ~767px with
  disproportionate whitespace at the 1200px cap and applied a
  `lg:flex-row` split, same pattern as L3.1/L3.2, gated so it only
  activates once the artist-detail data has loaded. Phase L4
  (verification/close-out) is next: L4.1 is a cross-size manual pass
  (mostly mechanical, already exercised piecemeal during L0-L3's own
  verification, though a comprehensive pass hasn't been done as one
  sweep) with a real-hardware bridge-phone check flagged as a caveat,
  not a blocker; L4.2 is close-out (backlog note, final PROGRESS.md
  update, merge) and depends on L4.1. Given L4.2 ends in a merge to
  master, that's a natural point to loop the user in before it happens
  rather than doing it unattended.
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
