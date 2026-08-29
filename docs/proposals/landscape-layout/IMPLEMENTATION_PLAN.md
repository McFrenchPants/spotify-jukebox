# Responsive / Landscape Layout — Implementation Plan

Reference: [DESIGN_SPEC.md](DESIGN_SPEC.md) (all decisions in its §7 are final —
`sm` nav pivot, three content-width tiers capped at 1200px, icon+label fixed
side rail). Progress will be tracked in `PROGRESS.md` in this folder once a
task below is actually picked up, per the [proposals process](../README.md)
step 5 — not created yet since nothing has started.

Each task has an ID (`L<phase>.<n>`), a scope, and acceptance criteria,
mirroring the root [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md)'s
format. An agent picking up a task should read the linked spec section,
implement just that scope, and stop — don't bleed into the next task.

All work here happens on `feature/landscape-layout` and merges to `master`
only once the phases below are done and verified (proposals process step 6).

---

## Phase L0 — Foundations (no visual change)

- **L0.1 — Extract shared nav items/icons.** `BottomNav.tsx` currently owns
  both `NAV_ITEMS` and all four icon components
  ([BottomNav.tsx:10-55](../../../frontend/src/components/nav/BottomNav.tsx:10)).
  Move these into a shared module (e.g.
  `frontend/src/components/nav/navItems.tsx`) so the new side-rail component
  (L1.1) can reuse them without duplicating four inline SVGs.
  - Accept: `BottomNav` imports from the new module, renders pixel-identical
    to before, existing behavior/tests unaffected.

- **L0.2 — Shared content-width classes.** Define the three-tier width
  (`max-w-lg` / `sm:max-w-2xl` / `lg:max-w-[1200px]`) as a single reusable
  string/constant (plain TS export is enough — no new CSS token needed per
  DESIGN_SPEC §5.4) so `AppShell`'s header and `<main>` apply the exact same
  value instead of copy-pasted class lists drifting apart later.
  - Accept: both wrappers reference the same constant; no visual change yet
    (still resolves to `max-w-lg` everywhere until L2.1 widens the other
    tiers in place).

## Phase L1 — Side rail navigation

Spec ref: DESIGN_SPEC §5.1, §7.1, §7.3, §7.4.

- **L1.1 — Build `SideNav`.** New component, `frontend/src/components/nav/SideNav.tsx`,
  using the shared `NAV_ITEMS`/icons from L0.1. Fixed left rail
  (`fixed inset-y-0 left-0 z-20`, matching `BottomNav`'s `fixed inset-x-0
  bottom-0 z-20` pattern — see decision §7.4), vertical list of the four
  items (icon + label side-by-side per row, not stacked), same active-state
  treatment as today (`.glass-pill` behind the icon on the active route).
  Hidden below `sm`, visible `sm:flex` and up. Suggested width: `w-48`
  (12rem/192px) — comfortably fits "Now Playing" (the longest label) with
  icon + padding; adjust if it looks cramped or excessive once built.
  - Accept: navigating between routes updates the active item the same way
    `BottomNav` does today; rail is only visible at `sm` (640px) and above
    in the browser's responsive device toolbar.

- **L1.2 — Wire both nav variants side by side.** In `RootLayout.tsx`
  (wherever `BottomNav` is currently passed to `AppShell`'s `bottomBar`
  prop), render both `BottomNav` and `SideNav` — add `sm:hidden` to
  `BottomNav`'s root `<nav>` so exactly one is visible at any given
  viewport width, both mounted so route-active state is consistent
  regardless of which is showing.
  - Accept: resizing the browser across the `sm` boundary swaps nav styles
    live with no flash of both/neither being visible.

- **L1.3 — Adjust `AppShell` spacing for the rail.** `<main>`'s bottom
  padding is currently a hardcoded `5.5rem` reservation for the bottom bar
  ([AppShell.tsx:135-137](../../../frontend/src/components/AppShell.tsx:135)).
  At `sm`+, the bottom bar is gone (L1.2), so that reservation should drop
  to the "no bottom bar" value (`1.5rem` + safe-area) and a left padding
  matching the rail's width (`sm:pl-48`, or whatever L1.1 settles on) should
  apply instead — to both `<main>` and the header's inner wrapper
  ([AppShell.tsx:119](../../../frontend/src/components/AppShell.tsx:119)),
  since the rail is a full-height overlay that would otherwise sit on top of
  the header's left edge too.
  - Accept: at `sm`+, page content and the header title never render under
    the rail; below `sm`, spacing is pixel-identical to before this
    proposal.

## Phase L2 — Content width scaling

Spec ref: DESIGN_SPEC §5.2, §7.2.

- **L2.1 — Apply the three-tier width to the shell.** Swap `AppShell`'s
  hardcoded `max-w-lg` (header + main,
  [AppShell.tsx:119](../../../frontend/src/components/AppShell.tsx:119) and
  [AppShell.tsx:133](../../../frontend/src/components/AppShell.tsx:133)) for
  the shared constant from L0.2, now actually resolving to the full
  `max-w-lg` → `sm:max-w-2xl` → `lg:max-w-[1200px]` progression.
  - Accept: viewport at 500px wide renders at 512px content width (unchanged
    from today); at 700px renders at 672px; at 1400px renders capped at
    1200px, centered, not edge-to-edge.

- **L2.2 — QA sweep at the new widths.** With L2.1 live, click through all
  four pages at each tier (resize_window presets: mobile, tablet, desktop,
  plus a manual ~700px width for the `sm` tier) and fix anything that was
  only ever laid out assuming ~512px — e.g. a track row, card, or control
  that stretches awkwardly rather than just having more breathing room
  around it. This is adjustment of existing components' internal layout
  (e.g. a flex item that should get a `max-w` of its own so it doesn't
  stretch full-width), not new components.
  - Accept: no page has a control or card that reads as "stretched" rather
    than "given more room" at the `lg` tier; screenshot each page at each
    tier for the record.

## Phase L3 — Per-page reflow at `lg`

Spec ref: DESIGN_SPEC §5.3, §7.2 (side-by-side reflows land at `lg`, not `sm`).

- **L3.1 — HistoryPage side-by-side.** `HistoryPage.tsx`'s `flex flex-col`
  stack of `Leaderboard` then `RecentlyPlayed`
  ([HistoryPage.tsx:11](../../../frontend/src/pages/HistoryPage.tsx:11))
  becomes `lg:flex-row` with each section roughly half the 1200px column
  (`lg:w-1/2` or `lg:flex-1` on each, whichever reads better once built).
  - Accept: below `lg`, unchanged stacked layout; at `lg`+, both sections
    visible side by side without either feeling cramped.

- **L3.2 — SettingsPage pairing.** Lowest priority (admin-only, lower
  traffic than guest-facing pages per DESIGN_SPEC §5.3). At `lg`+, pair
  `SettingsForm` + `DeviceSelector` and `QueueModeration` + `GuestUrlCard`
  into two two-card rows instead of one column of four
  ([SettingsPage.tsx:33-36](../../../frontend/src/pages/SettingsPage.tsx:33)).
  Can be cut from v1 of this proposal if L3.1 + L2 already feel sufficient —
  flag that call to the user before spending time here.
  - Accept: below `lg`, unchanged single column; at `lg`+, two cards per row
    with consistent card heights not required (cards can differ in height,
    same as any two-column card grid).

- **L3.3 — NowPlaying expanded-card revisit (optional/stretch).** Once L2 is
  live, check whether the expanded Now Playing card (album art + artist
  info,
  [NowPlaying.tsx:225-230](../../../frontend/src/components/nowplaying/NowPlaying.tsx:225))
  looks sparse at the wider `lg` column. If so, a side-by-side art/detail
  arrangement at `lg`+ is in scope; if it still reads fine at 1200px (likely,
  since it's already a fairly full card), skip this — DESIGN_SPEC §5.3
  explicitly frames this as a "worth a look," not a committed requirement.
  - Accept: either a documented decision to skip (card reads fine as-is), or
    a `lg:flex-row` treatment matching the same pattern as L3.1.

## Phase L4 — Verification

- **L4.1 — Cross-size manual pass.** Using the Browser pane's device presets
  (mobile/tablet/desktop) plus a manual resize to the `sm` (640px) and `lg`
  (1024px) boundaries themselves, verify: phone portrait is pixel-identical
  to pre-proposal behavior (DESIGN_SPEC §8, success criterion 3); phone
  landscape (~700-800px wide, short height) shows the side rail with
  visibly more content height available; tablet both orientations and a
  maximized desktop window read as intentionally laid out, not a stretched
  phone screen.
  - Accept: screenshots at each tier attached to the PR/handoff; no
    regressions at the base (phone-portrait) tier specifically, since that's
    the dominant real-world case and the one thing this proposal must not
    touch.
  - Caveat: this can only be verified via browser emulation in this
    environment — a final pass on the actual bridge Pixel 7 Pro (real
    hardware, real Bluetooth-speaker setup) is worth doing before calling
    this fully done, same spirit as Master Device Mode's success criteria.

- **L4.2 — Close out.** Update [BACKLOG.md](../../../BACKLOG.md) item 2 to
  `done`, update root [PROGRESS.md](../../../PROGRESS.md) if this is judged
  significant enough to belong there (proposals process step 6), and merge
  `feature/landscape-layout` into `master`.
