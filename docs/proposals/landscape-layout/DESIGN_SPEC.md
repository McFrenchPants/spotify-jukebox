# Responsive / Landscape Layout — Design Specification

Status: Reviewed — open questions resolved, ready for implementation planning
Branch: `feature/landscape-layout` (not yet created — see note at end)
Related: [BACKLOG.md #2](../../../BACKLOG.md), root [DESIGN_SPEC.md](../../DESIGN_SPEC.md) §9a/§9b/§11

## 1. Problem

The app is built portrait-mobile-only, structurally. Confirmed by direct
read of the shell:

- `AppShell.tsx` is a single flex column with no wide/narrow branch anywhere.
  Header and `<main>` both cap at `max-w-lg` (512px) — the app's only width
  constraint, applied unconditionally regardless of viewport
  ([AppShell.tsx:119](../../../frontend/src/components/AppShell.tsx:119),
  [AppShell.tsx:133](../../../frontend/src/components/AppShell.tsx:133)).
- Primary navigation is `BottomNav.tsx` — a fixed, full-width bottom tab bar
  with icon-over-label per tab
  ([BottomNav.tsx:63-98](../../../frontend/src/components/nav/BottomNav.tsx:63)).
  `<main>`'s bottom padding is a hardcoded `5.5rem` offset to clear it
  ([AppShell.tsx:135-137](../../../frontend/src/components/AppShell.tsx:135)),
  not derived from the nav's actual size.
- Every page (`NowPlaying`, `SearchAndQueue`, `HistoryPage`, `SettingsPage`)
  stacks its sections in a single `flex flex-col` column with no alternate
  layout.
- A grep of `frontend/src` for Tailwind's `sm:`/`md:`/`lg:`/`xl:` prefixes
  turns up 4 incidental hits (a modal, a button, the style guide) and *zero*
  in the shell, nav, or any of the four main pages. Responsive layout isn't
  partially built — it doesn't exist yet.
- Root [DESIGN_SPEC.md §9a/§9b](../../DESIGN_SPEC.md) explicitly scoped v1 to
  "guest phones only" and listed "no dedicated kiosk/TV/landscape display
  layout" as a non-goal — this proposal is what revisits that.

Concretely: a bottom tab bar that stacks icon+label per tab costs real
vertical space regardless of viewport width. On a phone held in landscape,
where total viewport height might only be ~360-420px, that fixed bar eats a
much bigger proportion of the screen than it does in portrait — and nothing
today changes its treatment based on orientation or size. The same is true,
differently, on a tablet or a desktop browser window: nothing is wrong
functionally, but a 512px-wide card centered in a 1600px window with a
mobile-style tab bar at the bottom reads as a phone screen that was merely
stretched, not a layout that was designed for the space.

## 2. Reframed scope

The backlog entry that prompted this (`#2`) was written as "landscape mode
for the bridge device." In conversation, the actual requirement turned out
to be broader: **phone is still the primary target for both the bridge
device and guests, but tablets and desktop browsers are real, regular usage
too** (the project owner uses a desktop PC directly) and the app should
respond well to all of them — not just handle one specific orientation flip.
This spec treats "landscape" as the motivating case but designs for
viewport size generally, the same way the rest of the web does, rather than
adding an orientation-specific special case.

## 3. Goals

1. **A navigation pattern that scales.** The bottom tab bar is right for
   narrow/tall viewports (phone portrait — the primary case, unchanged). At
   wider viewports it should stop consuming a fixed slice of vertical space
   and move to a layout better suited to the extra horizontal room.
2. **Content width that uses the space it's given**, without becoming an
   uncomfortably wide single column of text/controls on a large screen. The
   fixed `max-w-lg` everywhere should become a value that scales with
   viewport size, capped at something intentional rather than growing
   unbounded.
3. **No regression to the current phone-portrait experience.** This is the
   dominant real-world case (both the bridge device and most guests) and
   must look and behave exactly as it does today at those sizes.
4. **Same design language at every size.** The glass-surface aesthetic
   (`.glass`, `.glass-chrome`, `.glass-inset`, `.glass-pill` —
   [index.css](../../../frontend/src/index.css)) carries through unchanged;
   this is a layout/structure proposal, not a re-skin. No new colors,
   surfaces, or motion tokens should be needed.
5. **Standard, width-based responsive breakpoints**, not custom
   orientation-detection logic — using Tailwind's ordinary `sm`/`md`/`lg`/
   `xl` prefixes (already available, currently just unused) keeps this
   consistent with how the rest of the ecosystem — and any future
   contributor — expects a React/Tailwind app to be responsive.

## 4. Non-goals (for this proposal)

- **Per-device layout switching based on which physical role a device plays**
  (bridge vs. guest). The layout should respond to viewport size alone, the
  same way for anyone — a guest on a tablet and a bridge phone rotated to
  landscape get the same treatment if their viewports match. There's no
  "bridge mode" flag involved here (that concept doesn't currently exist in
  the app and this proposal doesn't introduce one).
- **A distinct desktop-only feature set.** Nothing new is being added for
  wide screens beyond reflowing existing content — no new desktop-only
  panels, keyboard shortcuts, or drag-and-drop. Scope is layout, not
  features.
- **Native app / Capacitor work.** Unrelated to
  [Master Device Mode](../master-device-mode/DESIGN_SPEC.md) — this is
  purely the existing web app's CSS/layout.
- **Print layout changes.** The existing print-only QR code view
  ([GuestUrlCard](../../../frontend/src/components/admin/GuestUrlCard.tsx))
  already has its own print stylesheet handling and isn't part of this.
- **Foldables / unusual aspect ratios as a distinct target.** They'll get
  whatever the nearest standard breakpoint gives them; no bespoke handling.

## 5. Requirements

### 5.1 Navigation

- Below the chosen pivot breakpoint (open question §7.1): today's
  `BottomNav` unchanged — fixed bottom bar, icon-over-label, full width.
- At and above the pivot: navigation moves to a **left side rail** —
  vertical stack of the same four items, using the freed-up vertical space
  and the (now available) horizontal space. This is a routing/layout change
  only; `NAV_ITEMS` and the four icons are reused as-is
  ([BottomNav.tsx:50-55](../../../frontend/src/components/nav/BottomNav.tsx:50)).
- The active-tab treatment (`.glass-pill` behind the icon,
  [BottomNav.tsx:84-88](../../../frontend/src/components/nav/BottomNav.tsx:84))
  carries over to the rail unchanged — same visual language, just laid out
  vertically instead of horizontally.
- `AppShell`'s hardcoded bottom-padding offset
  ([AppShell.tsx:135-137](../../../frontend/src/components/AppShell.tsx:135))
  needs a side-rail equivalent (left padding/margin on `<main>`) at the same
  breakpoint, so content never sits under or gets pushed by the rail.
- The header (`AppShell.tsx:115-130` — title + search shortcut) stays a top
  bar at all sizes; it's cheap enough on vertical space that it doesn't need
  its own breakpoint behavior.

### 5.2 Content width

- Below the pivot: unchanged, `max-w-lg` (512px), single column — today's
  exact behavior.
- Above the pivot: the content column widens in steps rather than jumping
  straight to "fill the window" — see §7.2 for the resolved three-tier
  values (512px / 672px / capped at 1200px).

### 5.3 Per-page reflow

Two pages currently stack two independent sections vertically and are
natural candidates for a side-by-side layout once there's width to spare —
called out here for the implementation plan, not decided in detail now:

- **HistoryPage** ([HistoryPage.tsx:11](../../../frontend/src/pages/HistoryPage.tsx:11)):
  `Leaderboard` and `RecentlyPlayed`, currently `flex flex-col`. Natural fit
  for `flex-row` (two columns) once width allows.
- **SettingsPage** ([SettingsPage.tsx:25](../../../frontend/src/pages/SettingsPage.tsx:25)):
  `SettingsForm`, `DeviceSelector`, `QueueModeration`, `GuestUrlCard`,
  currently one column. These could pair up (e.g. two cards per row) at
  wide sizes, though settings is admin-only and lower-traffic than the
  guest-facing pages, so this is the least urgent piece.
- **NowPlaying** and **SearchAndQueue** are effectively single-purpose,
  single-card flows already sized reasonably for their content — likely
  just get the wider `max-w` treatment from §5.2 with no structural
  reflow, but worth a look once the shell/nav work lands, in case the
  extra width leaves the expanded Now Playing card (art +
  artist/genre section) looking sparse and worth a side-by-side art/detail
  arrangement.

### 5.4 No new tokens

Spacing, radius, color, and glass-surface tokens
([index.css:10-79](../../../frontend/src/index.css:10)) are sufficient as-is.
This proposal should not need to add anything to the `@theme` block —
`sm`/`lg` are Tailwind defaults, and the 1200px cap can be applied inline
(`max-w-[1200px]`) the same way arbitrary values are already used elsewhere
in this codebase (e.g. `Switch.tsx`'s `w-[5.5rem]`).

## 6. Constraints & assumptions

- No `tailwind.config.js` exists — this is Tailwind v4's CSS-first
  config, so any custom breakpoint value would be defined in
  `index.css`'s `@theme` block, not a JS config file.
- Tailwind's default breakpoints (`sm` 640px / `md` 768px / `lg` 1024px /
  `xl` 1280px) are currently completely unused, so there's no existing
  convention in this codebase to stay consistent with beyond Tailwind's own
  defaults.
- This is a CSS/JSX layout change to existing components (`AppShell`,
  `BottomNav`, the four page components) — no backend, API, or data-model
  changes are anticipated anywhere in this proposal.
- Real device testing matters more than usual here: the actual failure mode
  motivating this (bottom nav eating too much of a short viewport) is best
  judged on a real or accurately-emulated phone in landscape, not just a
  resized desktop browser window.

## 7. Decisions (resolved during review)

1. **Nav pivot: `sm` (640px).** Confirmed — this is the standard Tailwind
   breakpoint for a phone's landscape rotation, catches phone-landscape /
   tablet / desktop without ever firing for phone-portrait, and is easy to
   move later if it turns out wrong in practice.

2. **Content width: multiple steps, hard-capped around 1200px.** Chosen over
   a single cap (former option A) because a maximized desktop window
   genuinely benefits from more breathing room than a landscape phone does —
   but capped well short of "fill the window," since past roughly 1200px
   there just isn't more real content to show; it would only be whitespace
   or overstretched controls. Three tiers:
   - **< `sm` (640px):** `max-w-lg` (512px) — today's exact phone-portrait
     value, unchanged.
   - **`sm` – `lg` (640-1023px):** `max-w-2xl` (672px) — phone landscape and
     narrow tablet/desktop windows; also where the side rail kicks in (§7.1),
     so this tier already has the extra horizontal room to spend.
   - **`lg`+ (1024px and up):** `max-w-[1200px]` — the hard ceiling,
     covering tablet-landscape through full desktop regardless of how wide
     the window gets beyond that.
   - The side-by-side reflows from §5.3 (History's two sections, etc.) land
     at the `lg` tier, where there's enough width for two columns to each
     stay comfortably readable — not at `sm`, where 672px split in half
     would cramp both sides.

3. **Side rail: icons + labels.** Confirmed, and reinforced by the pivot
   decision itself — the rail only ever appears once the viewport is wider
   than it is tall (§7.1's `sm` pivot), so by construction there's always
   more spare horizontal room than a portrait phone has, which is exactly
   the room a label needs.

4. **Side rail stays `fixed`.** Confirmed — matches `BottomNav`'s current
   fixed positioning, so primary nav stays visible at every size rather than
   scrolling away at some sizes and not others.

No open questions remain blocking the implementation plan.

## 8. Success criteria

- On an actual phone (or accurately emulated one) rotated to landscape, the
  bottom tab bar is gone, the four destinations are reachable from a side
  rail, and visibly more of the screen height is available to page content
  than before.
- On a tablet (both orientations) and a desktop browser window, the app
  reads as intentionally laid out for the space — no giant fixed-width card
  floating in a sea of empty background, no controls stretched
  uncomfortably wide either.
- Phone portrait — resized down to the smallest supported width — is
  pixel-for-pixel the same as before this change (verified by comparing
  against the current deployed behavior, not just "looks fine").
- No new design tokens, colors, or components outside `AppShell`, the nav,
  and the four page components' layout wrappers.

## 9. Next step

With §7's decisions settled, this is ready for an `IMPLEMENTATION_PLAN.md`
in this same folder, per the [proposals process](../README.md). Per that
process this work is also meant to live on a `feature/landscape-layout`
branch — not yet created, since this repo's working directory currently has
other proposal work ([master-device-mode](../master-device-mode/DESIGN_SPEC.md))
in progress from a separate session, and branching here isn't done casually
while that's in flight. Flagging that as a housekeeping step for whenever
you're ready to move this to implementation.
