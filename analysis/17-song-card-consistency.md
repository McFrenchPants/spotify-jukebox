# Analysis: item 17 — song card consistency

## Original ask (as written in BACKLOG.md)

> Every list currently has its own bespoke row component with a different
> subset of behavior — no shared `TrackCard`/`SongCard` exists, so the same
> song looks and behaves differently depending on which list it's found
> in... Requested: every list should support the same three actions —
> expand for details, favorite, add to queue. Likely needs a shared card
> component... rather than bolting the missing actions onto each row
> individually.

## Problem it's actually solving, and for whom

Confirmed directly in the code, not just as claimed in the backlog entry:
guests hit real, inconsistent behavior across the app's four song lists.

- [TrackRow.tsx](../frontend/src/components/search/TrackRow.tsx) (Search
  results) has **no favorite button at all** — only add-to-queue.
- [Leaderboard.tsx](../frontend/src/components/leaderboard/Leaderboard.tsx)
  and [RecentlyPlayed.tsx](../frontend/src/components/recent/RecentlyPlayed.tsx)
  have a favorite toggle but **no add-to-queue**.
- [FavoriteRow.tsx](../frontend/src/components/favorites/FavoriteRow.tsx)
  has both, and its own doc comment already admits it's "a deliberate
  copy of `TrackRow`" rather than a shared component.
- None of the four support "tap to expand for artist info + play count" —
  that interaction only exists on the
  [NowPlaying.tsx](../frontend/src/components/nowplaying/NowPlaying.tsx)
  hero card.

Concretely: a guest who wants to favorite a search result today has to
add it to the queue first, then find it in another list to favorite it.
That's a real, avoidable rough edge for guests — not cosmetic.

## User check-in (2026-08-30) — scope narrowed

Shared the above problem/value read plus a specific skepticism: unlike
the favorite/add-to-queue gaps (clear, low-ambiguity value), "expand for
details on every row" was flagged as a genuine open question rather than
an obvious win. Now Playing's expand makes sense because it's the one
track a guest is actively engaged with; whether a guest wants to expand a
row mid-scroll in a list of search results or leaderboard entries for
artist bio info is unproven, and it would introduce a new whole-row-tap
interaction these lists don't have today, with a real risk of feeling
cluttered if several rows are expanded at once in a scrolling list.

**User agreed and narrowed scope accordingly**: this item now covers
**favorite + add-to-queue consistency only**, across all four lists.
"Expand for details everywhere" is deliberately deferred — not rejected,
just not built now, pending more signal it's actually wanted. If that
signal shows up later, it should be scoped as its own follow-up item
rather than folded back into this one.

**Component approach — also settled by the check-in**: one flexible
shared `SongCard` component, consumed by all four lists, with optional
props for what varies per list (`rank?`, `timestamp?`, `showFavorite?`,
`showAddToQueue?`) — matches the literal backlog ask and maximizes actual
consistency, over a lighter "shared pieces, separate wrapper components"
alternative that was also considered.

## What already exists vs. what's new

Already exists, reusable:
- [FavoriteButton](../frontend/src/components/favorites/FavoriteButton.tsx)
  and [useFavoritesStatus](../frontend/src/hooks/useFavoritesStatus.ts) —
  already used by 3 of the 4 lists (everything except Search), same
  gray/amber/red convention throughout the app.
- The `Card`/`Button` primitives and the shared placeholder-art SVG
  (currently duplicated verbatim across all four row components — a
  second, smaller consolidation opportunity while touching these files).
- `QueueRowStatus` (`'idle' | 'adding' | 'added'`) already shared between
  `TrackRow` and `FavoriteRow` for the add-to-queue button's state.

New/changed:
- A shared `SongCard` component (exact location TBD, likely
  `frontend/src/components/songs/SongCard.tsx` or similar — no existing
  directory for genuinely shared song-row UI, unlike the per-feature
  directories today) taking a normalized track shape plus the optional
  per-list props above.
- `TrackRow` gains a favorite toggle (Search results don't currently
  fetch favorite status for the result set at all — `SearchAndQueue.tsx`
  would need a `useFavoritesStatus` call added, mirroring the pattern the
  other three lists already use).
- `Leaderboard`/`RecentlyPlayed` gain an add-to-queue action and the
  `adding`/`added` per-row status state that `TrackRow`/`FavoriteRow`
  already have but these two don't.
- The four existing bespoke row components (`LeaderboardRow`,
  `RecentlyPlayedRow`, `TrackRow`, `FavoriteRow`) get replaced by
  `SongCard` usages in their parent list components. `FavoriteRow`'s
  always-true favorite state (`favoritedByMe favoritedByAnyone` as fixed
  props) is a special case of `SongCard`'s normal favorite props, not a
  different code path.

## Value vs. cost

Real value (closes a genuine, confirmed inconsistency guests can hit
today), moderate cost — this touches four list components plus their
parent data-fetching (Search needs a new favorites-status fetch; two
lists need a new add-to-queue path with its own pending-state handling).
Bigger than the recent single-file post-launch fixes (items 10/12/13),
smaller than a design-spec-tier feature — no `docs/proposals/` folder
needed, but likely warrants a short flat implementation task list broken
out per list (rather than one giant task), since each list's parent
component needs its own wiring even though `SongCard` itself is shared.

## Open questions

- Exact `SongCard` prop shape — not fully nailed down yet, reasonable to
  finalize during implementation rather than in this analysis (this is
  the kind of file/prop-level detail a design spec would normally avoid
  anyway, and this item doesn't need a design spec tier).
- Whether the shared placeholder-art SVG and `formatDuration` (currently
  duplicated in `TrackRow.tsx` and `FavoriteRow.tsx`) should be pulled
  into shared utilities as part of this work, or left alone as a
  separate, smaller cleanup — low-stakes either way, decide during
  implementation.
- Deferred, not resolved: whether "expand for details" should eventually
  come to these lists too. Worth revisiting as its own backlog item if
  real user demand shows up, not assumed here.
