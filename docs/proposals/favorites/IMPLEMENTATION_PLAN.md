# Favorites — Implementation Plan

Reference: [DESIGN_SPEC.md](DESIGN_SPEC.md) (approved). Progress tracked in
[PROGRESS.md](PROGRESS.md) in this folder, per the
[proposals process](../README.md) step 5.

Each task has an ID (`F<phase>.<n>`), a scope, and acceptance criteria,
mirroring the root [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md)'s
format. An agent picking up a task should read the linked spec section(s),
implement just that scope, and stop.

All work happens on `feature/favorites` and merges to `master` only once the
phases below are done and verified (proposals process step 6).

## Scoping decisions made while planning (filling DESIGN_SPEC's open questions)

- **Guest ID reuse.** The app already has exactly the guest-identification
  mechanism DESIGN_SPEC's "Guest ID" section describes: the `guest_sessions`
  table + `x-guest-token` header + `jukebox_guest_token` localStorage key,
  wired up via `frontend/src/lib/session.ts` / `SessionContext` and
  `backend/src/middleware/guestSession.ts`. This plan does **not** invent a
  new identifier — "Guest ID" throughout this plan and the spec means the
  existing `guest_sessions.session_id`. Nickname/avatar are added as new
  columns on that existing table, not a new identity system.
- **Avatar set.** Curated emoji palette (spec's suggested fallback option) —
  free, zero new asset/dependency weight, trivial to render as text at any
  size, fits the "simple, not photo uploads" requirement. A fixed list of
  ~20 emoji (people/animals/objects mix, no duplicates-in-meaning) defined
  once in frontend code (F2.1).
- **Favorites list cap.** None enforced (per spec's Behavior notes — "no
  limit is proposed"). No pagination in v1; revisit only if it proves to be
  a real problem.

---

## Phase F0 — Data model

- **F0.1 — Schema.** In `backend/src/db/index.ts`'s `runMigrations()`:
  - Add `nickname TEXT` and `avatar TEXT` columns to `guest_sessions` via
    their own `ALTER TABLE ... ADD COLUMN` statements guarded with a
    pragma/try pattern *or*, simpler and consistent with this codebase's
    "no migrations, just idempotent `CREATE TABLE IF NOT EXISTS`" style —
    check whether `better-sqlite3`'s `ALTER TABLE ADD COLUMN` can be made
    idempotent (SQLite errors on a duplicate column; wrap in a check against
    `PRAGMA table_info(guest_sessions)` before altering, run once at
    `runMigrations()` time, same idempotent spirit as the rest of the file).
  - Add a new `favorites` table: `id INTEGER PRIMARY KEY AUTOINCREMENT`,
    `guest_session_id TEXT NOT NULL`, `spotify_track_id TEXT NOT NULL`,
    `track_name TEXT NOT NULL`, `artist_name TEXT NOT NULL`,
    `album_art_url TEXT`, `duration_ms INTEGER NOT NULL`,
    `favorited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ',
    'now'))`, with a `UNIQUE(guest_session_id, spotify_track_id)` constraint
    (a guest can only favorite a track once — toggling is add/remove, not
    accumulating rows) and indexes on `guest_session_id` and
    `spotify_track_id` (the latter needed for the "did *anyone* favorite
    this track" lookup behind the amber heart state).
  - Accept: fresh DB boots clean; existing DB with data survives a restart
    and gains the new columns/table with no data loss (test by running
    against a DB file that already has rows in `guest_sessions`).

- **F0.2 — DB module.** New `backend/src/db/favorites.ts`, mirroring
  `trackStats.ts`'s row/mapper/exported-functions shape:
  - `addFavorite({guestSessionId, spotifyTrackId, trackName, artistName,
    albumArtUrl, durationMs})` — insert, `ON CONFLICT DO NOTHING` (idempotent
    toggle-on).
  - `removeFavorite(guestSessionId, spotifyTrackId)` — delete.
  - `listFavoritesForGuest(guestSessionId)` — all rows for one guest, newest
    `favorited_at` first (default sort per spec).
  - `getFavoriteStatusForTracks(guestSessionId, trackIds: string[])` — batch
    lookup returning, per track id, `{ favoritedByMe: boolean, favoritedByAnyone: boolean }`
    (two queries or one `GROUP BY spotify_track_id` query — needed so the
    heart-coloring UI (F3.1) doesn't do one request per row).
  - Also extend `backend/src/db/guestSessions.ts`: add `nickname`/`avatar` to
    `GuestSessionRow`/`GuestSession`/`mapRow`, and a new
    `updateGuestProfile(sessionId, { nickname?, avatar? })` function
    (`UPDATE guest_sessions SET ... WHERE session_id = ?`, partial update —
    only set columns actually provided).
  - Accept: unit tests (mirroring `queueEntries.test.ts`'s direct-against-`db`
    style) covering add/remove/list/batch-status/profile-update, including
    the unique-constraint idempotency case (favoriting twice doesn't error
    or duplicate).

## Phase F1 — Backend API

Spec ref: DESIGN_SPEC "Where 'Favorite' shows up", "The Favorites list",
"Guest ID and the new 'Me' tab".

- **F1.1 — Favorites routes.** New `backend/src/routes/favorites.ts`
  (`favoritesRouter`), registered in `backend/src/app.ts` as
  `app.use("/api/favorites", favoritesRouter)`:
  - `GET /api/favorites` — `resolveGuestSession` gated (400
    `session_required` if missing, same pattern as `queue.ts:50-57`), returns
    `listFavoritesForGuest(req.guestSession.sessionId)`.
  - `POST /api/favorites` — body `{ trackId }`; re-fetches track metadata
    server-side via `getTrack` (same trust boundary as `queue.ts:80-86` —
    don't trust client-supplied name/artist/art), calls `addFavorite`, emits
    `emitEvent("favorites-update", { trackId, guestSessionId })`, responds
    201.
  - `DELETE /api/favorites/:trackId` — calls `removeFavorite`, emits the same
    event, responds 204.
  - `GET /api/favorites/status?trackIds=a,b,c` — batch status endpoint for
    heart coloring; parses the comma-separated query param, calls
    `getFavoriteStatusForTracks`, returns a map keyed by track id. Works
    without a guest session too (all `favoritedByMe: false`, so an
    unresolvable/missing session still renders correct gray/amber hearts,
    just never red) — do NOT 400 here the way the mutating routes do.
  - Accept: route tests (mirroring `leaderboard.test.ts`'s spin-up-real-app
    style) covering add, duplicate add (idempotent), remove, remove-nonexistent
    (no error), status batch for a mix of mine/others'/nobody's favorites,
    and the missing-session 400 on the two mutating routes only.

- **F1.2 — Guest profile route + queue attribution join.**
  - Extend `backend/src/routes/session.ts`: add `PATCH /api/session/me`
    (`resolveGuestSession` gated), body `{ nickname?, avatar? }`, calls
    `updateGuestProfile`, returns the updated `GuestSession` (now including
    `nickname`/`avatar`). The existing `POST /api/session` response should
    also start including `nickname`/`avatar` (both `null` until set) since
    that's the "Me" tab's read path on load.
  - Extend `GET /api/queue`'s response (`listQueueEntries` in
    `backend/src/db/queueEntries.ts` + `queue.ts:14-16`): join
    `queue_entries.added_by_session_id` against `guest_sessions` to include
    the adder's `nickname`/`avatar` (both `null` if the guest never set
    them, or if `added_by_session_id` is null/unresolvable — spec: "Guests
    who haven't set a nickname/avatar show no attribution"). Keep the
    existing response shape otherwise — add fields, don't rename any.
  - Accept: route tests for `PATCH /api/session/me` (sets nickname only,
    avatar only, both, verifies partial-update doesn't clobber the other
    field) and an updated `queue.test.ts` (or equivalent) case confirming a
    queued track shows the adder's nickname/avatar when set and `null`s when
    not.

## Phase F2 — Frontend: guest identity

Spec ref: DESIGN_SPEC "Guest ID and the new 'Me' tab".

- **F2.1 — API client + avatar palette.** In `frontend/src/lib/api.ts`, add:
  `getFavorites()`, `addFavorite(trackId, token)`,
  `removeFavorite(trackId, token)`, `getFavoritesStatus(trackIds: string[])`,
  `updateGuestProfile({ nickname?, avatar? }, token)` — following the
  existing plain-`fetch` + `ApiError`-on-failure pattern (see
  `queueTrack` around api.ts:267 as the closest analog for a
  guest-token-bearing call). Also add a new small module (e.g.
  `frontend/src/lib/avatars.ts`) exporting the fixed ~20-emoji palette
  decided above, as a plain `string[]` constant.
  - Accept: typechecks; no behavior to verify yet (no UI wired up).

- **F2.2 — "Me" page + nav entry.** New `frontend/src/pages/MePage.tsx` and
  route (mirror how `SearchPage`/`HistoryPage` are wired into the router).
  Add a 5th entry to `NAV_ITEMS` in
  [navItems.tsx](../../../frontend/src/components/nav/navItems.tsx) (a new
  simple line-art avatar/person icon, `currentColor` stroke, matching the
  existing four — see `HomeIcon`/`SearchIcon` etc. at navItems.tsx:9-47),
  labeled "Me" — `BottomNav`/`SideNav` pick it up automatically since both
  just `.map()` over `NAV_ITEMS`.
  - Page contents (per spec): auto-generated device label ("iPhone ·
    Safari" style — derive from `navigator.userAgent`, best-effort, no new
    dependency) shown alongside the raw Guest ID (`sessionId` from
    `useSession()`); a nickname text input; an avatar grid picker built from
    the F2.1 palette; calls `updateGuestProfile` on change (debounced or
    on-blur for the nickname field, immediate on avatar tap). Use existing
    `Card`/`Button`/glass styling conventions, not new visual language (spec
    "Visual theming").
  - Accept: navigating to "Me" from either nav variant shows the current
    device label + Guest ID; setting a nickname and picking an avatar
    persists across a page reload (verifies the PATCH round-trips and
    `GET /api/session` on next `bootstrapSession()` reflects it).

## Phase F3 — Frontend: heart control + integration

Spec ref: DESIGN_SPEC "Where 'Favorite' shows up", "Attribution".

- **F3.1 — `FavoriteButton` + `useFavoritesStatus` hook.** New
  `frontend/src/components/favorites/FavoriteButton.tsx` — a heart icon
  button (reuse `Button`'s `icon` size variant, or a bare styled `<button>`
  if `Button`'s chrome is too heavy for an inline row control — judgment
  call, match whichever reads better against the existing row designs) with
  three visual states (gray/amber/red per spec) driven by props
  (`favoritedByMe: boolean`, `favoritedByAnyone: boolean`), calling
  `onToggle` on tap — the button itself is presentational/controlled, not
  self-fetching.
  New `frontend/src/hooks/useFavoritesStatus.ts` — given a list of track
  ids, fetches `getFavoritesStatus` on mount/list-change and exposes
  `{ status, toggle(trackId, track) }` where `toggle` does the optimistic
  local flip + `addFavorite`/`removeFavorite` call + rollback on failure
  (mirrors the optimistic-update spirit already used in `SearchAndQueue`'s
  `handleAdd`). Subscribe to a new `favorites-update` SSE event (add it to
  `NAMED_EVENTS` in `useEventStream.ts:8`) to re-sync `favoritedByAnyone`
  when *other* guests toggle a track this guest is currently looking at.
  - Accept: a standalone check (e.g. temporarily mounted in `StyleGuide.tsx`,
    removed after) shows all three heart states rendering distinctly and
    toggling on click; typecheck clean.

- **F3.2 — Now Playing.** Wire `FavoriteButton` into
  [NowPlaying.tsx](../../../frontend/src/components/nowplaying/NowPlaying.tsx)
  near the track title (around NowPlaying.tsx:242-244, close to the "Played
  N times" pill at 254-258).
  - Accept: heart reflects and toggles the currently-playing track's
    favorite state live in the browser.

- **F3.3 — Queue + attribution.** Wire `FavoriteButton` into
  [QueueList.tsx](../../../frontend/src/components/queue/QueueList.tsx)'s
  `QueueRow` (around lines 51-56). Also render the adder's avatar (emoji) +
  nickname next to each row using the `nickname`/`avatar` fields added to
  the queue response in F1.2 — render nothing (not a placeholder) when both
  are `null`, per spec.
  - Accept: queueing a track from Search shows a heart in the queue row
    immediately; a guest who has set a nickname/avatar (via "Me") sees their
    own attribution appear on a track they queue, without a page reload
    (relies on the existing `queue-update` SSE re-fetch already wired up).

- **F3.4 — History (Leaderboard + Recently Played).** Wire `FavoriteButton`
  into
  [Leaderboard.tsx](../../../frontend/src/components/leaderboard/Leaderboard.tsx)'s
  `LeaderboardRow` (near the play-count badge, lines 59-61) and
  [RecentlyPlayed.tsx](../../../frontend/src/components/recent/RecentlyPlayed.tsx)'s
  `RecentlyPlayedRow` (near the relative-time badge, lines 56-58).
  - Accept: hearts appear and toggle correctly in both History sub-lists,
    consistent with state shown elsewhere for the same track (favorite a
    track from History, see it reflected on Now Playing/Queue for the same
    track without reload).

## Phase F4 — Frontend: Favorites list

Spec ref: DESIGN_SPEC "The Favorites list (on Find Music)".

- **F4.1 — Favorites section on Find Music.** Extend
  [SearchPage.tsx](../../../frontend/src/pages/SearchPage.tsx) /
  `SearchAndQueue.tsx` with a second section/tab "Favorites" alongside
  search (simple tab toggle is enough — no new routing needed). Contents:
  - List of the guest's favorited tracks (via `getFavorites()`), each row
    reusing `TrackRow`-equivalent layout (art, name, artist) plus a filled
    heart (tap → unfavorite, calls the same `toggle` as F3.1's hook) and an
    "Add to Queue" action (reuse the existing `handleAdd` queueing flow from
    `SearchAndQueue.tsx:115-131`).
  - Sort control: Song Name A–Z/Z–A, Artist A–Z/Z–A, default
    most-recently-favorited (the list's natural DB order from F0.2, no sort
    param needed for the default).
  - Filter/search text box, client-side substring match against name+artist
    (list sizes here don't warrant a server round-trip).
  - Empty state per spec's suggested copy when the guest has no favorites.
  - Accept: favoriting a track anywhere in the app makes it appear in this
    list (live, via the same `favorites-update` SSE event from F3.1);
    sorting and filtering both work against a list of favorites containing
    several familiar and similarly-named tracks; unfavoriting from this list
    removes the row; "Add to Queue" here behaves identically to the existing
    search-page queue flow (same toasts/rate-limit/guardrail error copy).

## Phase F5 — Verification & close-out

- **F5.1 — Backend test sweep.** Confirm all new/changed backend tests pass
  together (`npm test` in `backend/`) — F0.2's db-layer tests and F1.1/F1.2's
  route tests. Fix anything that only breaks under the full suite (shared
  DB state between test files).
  - Accept: full backend test suite green.

- **F5.2 — Manual verification pass.** Using the Browser pane, walk the
  full guest flow end to end: set a nickname/avatar on "Me" → favorite a
  track from Now Playing → confirm it shows red there, amber/gray correctly
  elsewhere depending on a second simulated guest session (e.g. a second
  browser tab with its own token) → confirm attribution shows on a newly
  queued track → browse/sort/filter/unfavorite/re-queue from the Favorites
  list on Find Music. Per this project's own verification conventions,
  prefer live DOM/computed-style/network inspection; note explicitly if
  screenshot compositing isn't available this session (a real, recurring
  limitation in this environment per the landscape-layout proposal's
  session log) rather than asserting visual confirmation that wasn't
  actually obtained.
  - Accept: no functional regressions found in the flow above; any found
    are fixed and re-verified before this task is marked done.

- **F5.3 — Close out.** Update [BACKLOG.md](../../../BACKLOG.md) item 3 to
  `done` with a shipped-summary note (mirroring how item 2 was closed out),
  update root [PROGRESS.md](../../../PROGRESS.md) if judged significant
  enough (proposals process step 6 — this is a multi-surface guest-facing
  feature, likely yes), and **stop for explicit user go-ahead** before
  merging `feature/favorites` into `master` — do not merge automatically
  just because F5.1/F5.2 passed.
