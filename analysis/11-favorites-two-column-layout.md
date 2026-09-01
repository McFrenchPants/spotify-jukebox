# Analysis: item 11 — Favorites alongside search on wide screens

## Original ask (as written in BACKLOG.md)

> On tablet/desktop widths, Favorites shouldn't be a separate tab a guest
> has to switch to — it should display side-by-side with search in a
> two-column layout (search/queue on one side, favorites on the other).
> ... Should follow the same `lg` (1024px) breakpoint convention used
> elsewhere for reflowing to side-by-side layouts (see item 2).

## Problem it's actually solving, and for whom

Today [SearchAndQueue.tsx](../frontend/src/components/search/SearchAndQueue.tsx)
renders Search and Favorites as two mutually-exclusive tabs
([SearchAndQueue.tsx:26](../frontend/src/components/search/SearchAndQueue.tsx:26)
for the tab state, buttons at
[SearchAndQueue.tsx:149-166](../frontend/src/components/search/SearchAndQueue.tsx:149),
conditional rendering at
[SearchAndQueue.tsx:168](../frontend/src/components/search/SearchAndQueue.tsx:168)/
[246](../frontend/src/components/search/SearchAndQueue.tsx:246)) — a guest
switching between "find something new" and "re-queue a favorite" has to
fully swap views, losing sight of the other, regardless of viewport size.

This is a real cost specifically on wide screens: item 2 (landscape/
responsive layout) already established that this app should use the extra
horizontal room on tablet/desktop rather than rendering a stretched phone
layout, and did so consistently for HistoryPage (Recently Played / Top
Tracks), SettingsPage (its three settings-group pairs), and NowPlaying's
expanded detail — all via the same `flex flex-col gap-6 lg:flex-row` +
`lg:w-1/2` pattern at the `lg` (1024px) breakpoint. Find Music is the one
remaining primary page still tab-switching instead of reflowing at that
breakpoint, which is inconsistent with a pattern the app already committed
to elsewhere. On phone widths (the dominant real case, unchanged per item
2's own non-goals), tab-switching is still the right interaction — there's
no width to spare for two columns, and nothing about this changes that.

Who benefits: guests on tablet/desktop (the project owner's own stated
regular use case, per item 2's reframing) who want to browse favorites and
search results without losing one to view the other.

## Value vs. cost

Low cost: this is a pure reflow reusing an already-proven, three-times-used
pattern (`lg:flex-row` / `lg:w-1/2`) rather than inventing new layout
mechanics, on a page that already cleanly separates its two sections into
`SearchAndQueue`'s own tab body and the `FavoritesSection` subcomponent —
the two halves are already discrete render trees, not intertwined markup
that would need restructuring first.

Value is real but modest: this only changes behavior at `lg`+ widths,
narrower-screen guests (still the majority case) see no change at all. It
brings Find Music in line with the rest of the app's already-adopted
responsive convention rather than leaving it as the one page that doesn't
reflow — a consistency fix as much as a new capability.

## Alternatives considered

- **Do nothing / leave as tabs at every width.** Legitimate option — tab
  switching is one tap, not a severe cost. Rejected as the recommendation
  here only because item 2 already set the expectation that this app
  reflows at `lg`, and Find Music is now the outlier; the marginal cost of
  extending an already-built pattern to one more page is small enough that
  "already scoped and asked for" outweighs "not strictly necessary."
- **A user-toggleable column view instead of an automatic breakpoint
  switch.** Would let a guest force single-column focus even on a wide
  screen. No precedent for this kind of user-facing layout toggle anywhere
  else in the app, and it adds real state/UI to design, test, and maintain
  for a benefit (focus on one column) that a guest can already get for free
  by narrowing their browser window. Not pursued.
- **Reflow at a narrower breakpoint than `lg` (e.g. `md`, 768px)** so
  tablets in portrait also get two columns. Rejected: would put two
  columns in less width than the rest of the app's `lg`-gated reflows
  use, likely cramping both columns on a mid-size tablet; also breaks the
  "same breakpoint convention used elsewhere" requirement the backlog
  entry explicitly asked for.

## Is this a good idea?

Yes — small, well-precedented, consistent with a pattern this project has
already built and validated three times elsewhere, and directly requested
by the project owner as part of item 2's original wide-screen push (this
item was carved out of that broader work rather than invented fresh).

## Scope, confirmed via check-in (2026-09-01)

- **At `lg` (1024px)+, the Search/Favorites toggle buttons disappear
  entirely** — both sections render simultaneously, side-by-side, matching
  the item's own wording ("alongside," not "still tabbed but wider") and
  the existing `lg` reflow precedent elsewhere in the app, which doesn't
  keep an equivalent toggle either. Below `lg`, today's tab behavior is
  unchanged.
- **Column order: Search on the left, Favorites on the right** — matches
  the current tab order (Search first) and search/discovery as the primary
  action, favorites as secondary/reference.

## What this does NOT change

- Nothing below the `lg` breakpoint — phone-portrait behavior (the
  dominant case) is untouched, per item 2's own non-goals, which this item
  inherits.
- No new features, sort options, or data — this is purely a layout reflow
  of the two sections that already exist.
- `SongCard`, `FavoritesSection`'s own sort/filter controls, and the
  add-to-queue/favorite-toggle flows are unaffected — they're reused as-is
  in whichever layout renders them.

## Open questions for implementation (not blocking, but worth a task note)

- Whether the search input/results column and the favorites filter/sort
  column need any width-specific tuning beyond `lg:w-1/2` (e.g. the
  favorites sort `<Select>` currently uses `sm:w-56` — should stay as-is
  inside its half-width column, but worth confirming during
  implementation that nothing looks cramped at exactly 1024px).
- Whether `activeTab` state becomes entirely dead at `lg`+ (both sections
  simply always render) or still needs to exist for narrower widths — the
  straightforward answer is that the state and toggle buttons stay exactly
  as today below `lg`, and above `lg` the component renders both sections
  regardless of `activeTab`'s value, which needs no new state, just a
  width-gated render branch.
