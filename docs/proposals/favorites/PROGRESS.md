# Favorites — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (approved).

All work happens on `feature/favorites` — confirm you're on that branch
before making any changes.

## Status: Phase F0-F4 done (all implementation complete); F5 (verification/close-out) next

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| F0.1 | Schema (guest_sessions columns + favorites table) | done | `addColumnIfMissing()` helper in `backend/src/db/index.ts` for the idempotent `ALTER TABLE`; `favorites` table + 2 indexes added to the existing migration block |
| F0.2 | DB module (`favorites.ts` + `guestSessions.ts` updates) | done | `backend/src/db/favorites.ts` (add/remove/list/batch-status) + `updateGuestProfile()` in `guestSessions.ts`; 16 new tests, all passing (272 total backend tests green) |
| F1.1 | Favorites routes | done | `backend/src/routes/favorites.ts`: `GET/POST /api/favorites`, `DELETE /api/favorites/:trackId`, `GET /api/favorites/status` (never 400s even with no session — always safe for heart-coloring) |
| F1.2 | Guest profile route + queue attribution join | done | `PATCH /api/session/me` (nickname/avatar); `POST /api/session` now returns them too; `listQueueEntries()` left-joins `guest_sessions`, adding `adderNickname`/`adderAvatar` (null when unset/unattributed) — **these are the exact field names F3.3 must consume** |
| F2.1 | API client + avatar palette | done | `getFavorites`/`addFavorite`/`removeFavorite`/`getFavoritesStatus`/`updateGuestProfile` added to `frontend/src/lib/api.ts`; `frontend/src/lib/avatars.ts` exports `AVATAR_PALETTE` (20 emoji) |
| F2.2 | "Me" page + nav entry | done | `frontend/src/pages/MePage.tsx` + `/me` route; `NAV_ITEMS` gained a 5th "Me" entry; `SessionContext` now carries `nickname`/`avatar`/`setProfile()`. Verified live (nickname/avatar round-trip survives reload); screenshot compositing unavailable this session, verification was DOM/network-inspection based |
| F3.1 | `FavoriteButton` + `useFavoritesStatus` hook | done | `frontend/src/components/favorites/FavoriteButton.tsx` (gray/amber/red heart) + `frontend/src/hooks/useFavoritesStatus.ts` (batch fetch, SSE re-sync on new `favorites-update` event, optimistic toggle w/ rollback). Verified via temporary StyleGuide mount (removed after), DOM/computed-style inspection |
| F3.2 | Now Playing integration | done | Heart next to the title in `NowPlaying.tsx`; its `stopPropagation` (built into `FavoriteButton`) confirmed to not also toggle the card's expand/collapse |
| F3.3 | Queue + attribution integration | done | `QueueList.tsx` heart per row + adder avatar/nickname (rendered only when set) via `adderNickname`/`adderAvatar` added to the frontend `QueueEntry` type. **Not fully live-verified** — see Open Questions below |
| F3.4 | History (Leaderboard + Recently Played) integration | done | Heart added to both `LeaderboardRow` and `RecentlyPlayedRow`, each with its own independent `useFavoritesStatus` instance (both sync via the shared SSE event) |
| F4.1 | Favorites list on Find Music | done | `SearchAndQueue.tsx` gained a Search/Favorites tab toggle; Favorites tab has sort (recent/name/artist), substring filter, two distinct empty states, optimistic unfavorite-removal, and reuses the existing add-to-queue toast flow via a new `FavoriteRow.tsx` (sibling to `TrackRow`, not a rework) |
| F5.1 | Backend test sweep | done | `npm test` in `backend/`: 35 files, 292 tests, all green; `tsc --noEmit` clean. No backend changes since F1, so this just reconfirms nothing regressed |
| F5.2 | Manual verification pass | todo | Unblocked — Spotify credentials fixed (root cause: stored refresh token belonged to a different/rotated Spotify app than `.env`'s current client_id, producing `invalid_client`; fixed by redoing the one-time OAuth consent flow at `/api/auth/login`). Confirmed live: search, `/api/now-playing`, `/api/device` (including the real Pixel 7 Pro bridge device) all working, no more refresh errors |
| F5.3 | Close out (backlog, PROGRESS.md, merge) | todo | Depends on F5.2; requires explicit user go-ahead to merge regardless |

## Open Questions / Blockers

*(none currently — the dev-environment Spotify credentials issue below was
resolved and no longer blocks anything)*

**Resolved:** dev environment's Spotify credentials were broken
(`invalid_client` on token refresh) from F3.3 through the start of this
session. Root cause: the stored `spotify_refresh_token` had been issued
under a different (or since-rotated) Spotify Developer app than the
`client_id`/`client_secret` currently in `.env` — Spotify rejects a
refresh-token exchange with `invalid_client` when the token doesn't belong
to the presenting client, confirmed by testing the exact stored refresh
token directly against Spotify's token endpoint. Fixed by the user redoing
the one-time admin OAuth consent flow at `/api/auth/login`, which mints a
fresh refresh token tied to the current app. Confirmed working: search,
`/api/now-playing`, `/api/device` (including the real Pixel 7 Pro bridge
device) all responding correctly with no new refresh errors.

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-08-29** — F4.1 complete via a subagent (Favorites tab on Find
  Music: sort/filter/empty-states/optimistic-unfavorite/add-to-queue, plus
  the new `FavoriteRow.tsx` component and `SearchPage.tsx`/`SearchAndQueue.tsx`
  threading `subscribe` through for the first time), verified (diff read +
  `tsc -b` clean + live browser check of the real, Spotify-independent parts:
  tab toggle, real `GET /api/favorites` empty state, sort/filter against
  mocked data since this dev environment can't produce real favorites right
  now, real `DELETE /api/favorites/:id` unfavorite) and committed
  (`69b04c6`). Then ran F5.1 (backend test sweep) directly myself since it
  needed no new code — `npm test`: 35 files/292 tests green, `tsc --noEmit`
  clean, unchanged since F1 as expected.
  **All implementation (F0-F4) is now complete.** Only F5.2 (manual
  verification) and F5.3 (close-out/merge) remain. F5.2 is marked `blocked`
  in the task table — this dev environment's Spotify credentials are broken
  (discovered during F3.3, confirmed again during F4.1), which blocks real
  search/queue/playback and therefore a genuine continuous end-to-end
  walkthrough of the guest flow. The user is checking on this separately in
  parallel with this session. Once credentials are working, F5.2 is just a
  live click-through per its IMPLEMENTATION_PLAN.md acceptance criteria —
  no code changes expected unless it surfaces a real bug.
- **2026-08-29** — Phase F3 complete (F3.1 solo, then F3.2/F3.3/F3.4 as three
  parallel subagents touching disjoint files — `NowPlaying.tsx`,
  `QueueList.tsx`+`api.ts`, `Leaderboard.tsx`+`RecentlyPlayed.tsx` — no
  conflicts), verified (diff read + combined `tsc -b` clean across all
  three) and committed (`5028cfc` for F3.1, `4d29351` for F3.2-F3.4). Hearts
  now appear on every surface the design spec calls for: Now Playing hero,
  each Up Next row (plus adder attribution — avatar/nickname, shown only
  when the adder set one), and both History sub-lists. F3.4's subagent
  found the current seed data has zero track-id overlap between Leaderboard
  and Recently Played, so cross-list sync couldn't be visually demonstrated
  end-to-end this session — only that both independently call the same
  `GET /api/favorites/status` endpoint, which is what makes that sync work;
  not a code gap, just an unexercised path with current data.
  **Worth flagging:** F3.3's subagent discovered this session's shared dev
  backend has broken Spotify credentials (`GET /api/search` → 502
  `invalid_client`), which blocks queueing anything for real and prevented
  a full live click-through of the queue-row heart+attribution. See Open
  Questions above — this will likely also affect F5.2's planned manual
  verification pass and may be worth checking with the user before then.
  F4 (Favorites list on Find Music) is next — no blockers for starting it,
  though its own live verification may hit the same Spotify-credentials
  wall for the "Add to Queue" part of that page specifically (favoriting/
  listing/sorting/filtering don't depend on Spotify search, only requeueing
  does).
- **2026-08-29** — F2.1+F2.2 complete via one subagent (small, tightly
  sequential tasks — F2.2 depends directly on F2.1's API functions, so
  handled together rather than as two round-trips), verified (diff read +
  `tsc -b` clean + live browser check: nickname/avatar set via the "Me" page
  round-trip through `PATCH /api/session/me` and survive a reload via
  `POST /api/session`'s response; "Me" nav item confirmed present in both
  `BottomNav` and `SideNav`) and committed (`75be324`). Screenshot
  compositing was unavailable in the subagent's Browser pane session (a
  recurring environment limitation also seen on the landscape-layout
  proposal), so verification was DOM/network-inspection based, not visual —
  flagged explicitly, not overstated. Two transient 502s appeared in console
  logs during verification with no matching failed request in the network
  log and didn't reproduce on reload; judged unrelated to the change
  (likely a brief hiccup from the subagent's own accidental concurrent dev
  server start), not a regression, but worth a second look if it recurs.
  Avatar palette landed as 20 fixed emoji (🐱🐶🦊🐼🐸🐵🦁🐨🐯🐙🎸🎧🎹⚡🌟🍕🌵🚀🎲👑).
  F3 (heart control + integration across Now Playing/Queue/History) is
  next — F3.1 (the shared `FavoriteButton` + status hook) has no blockers.
- **2026-08-29** — F1.1+F1.2 complete via two parallel subagents (independent
  files — favorites.ts/app.ts vs. session.ts/queueEntries.ts/queue.ts — no
  merge conflict), verified together (diff read + `tsc --noEmit` clean +
  full backend suite: 35 files/292 tests passing) and committed (`e7cf0df`).
  Backend is now fully done: `GET/POST /api/favorites`,
  `DELETE /api/favorites/:trackId`, `GET /api/favorites/status` (the last one
  deliberately never 400s even with no guest session, since heart-coloring
  in the UI must work for every guest regardless of session state);
  `PATCH /api/session/me` for nickname/avatar (and `POST /api/session` now
  echoes them back); `GET /api/queue` rows now carry `adderNickname`/
  `adderAvatar` (null when the adder never set a profile, or the entry has
  no attributed guest at all) via a `LEFT JOIN` in `listQueueEntries()`.
  **Stopping here** — this is a clean phase boundary (all of Phase F0+F1,
  i.e. the entire backend, done and tested) before starting the frontend
  phases (F2-F4), which are more visually/subjectively driven (new nav tab,
  heart controls across 5 render sites, avatar picker) and worth a natural
  checkpoint. No blockers — F2.1 has everything it needs from the API.
- **2026-08-29** — F0.1+F0.2 complete via a subagent, verified (diff read +
  `tsc --noEmit` clean + full backend test suite: 34 files/272 tests
  passing) and committed (`f3b96ae`). Data model is now in place: `favorites`
  table with a `UNIQUE(guest_session_id, spotify_track_id)` constraint (so
  `addFavorite` is a safe no-op on a repeat call via `ON CONFLICT DO
  NOTHING`), `nickname`/`avatar` columns added to `guest_sessions`
  idempotently (checked via `PRAGMA table_info` since that table already
  exists in production DBs predating this migration — plain `CREATE TABLE IF
  NOT EXISTS` wouldn't retrofit columns onto it). `getFavoriteStatusForTracks`
  does the batch "mine vs. anyone's" lookup needed for the heart-coloring UI
  in one query. F1 (backend routes) is next — no blockers, F0.2 is complete.
- **2026-08-29** — Plan created (`IMPLEMENTATION_PLAN.md`) and this tracker
  initialized, via `/continue-development` picking up BACKLOG.md item 3 per
  explicit user request (design spec was already pre-approved, so scaffolding
  skipped straight from spec to plan without a review gate). Branch
  `feature/favorites` created off `master`. An exploration pass mapped the
  existing codebase first: notably, the app already has a guest
  identification mechanism (`guest_sessions` table + `x-guest-token` header +
  `SessionContext`) that covers everything DESIGN_SPEC's "Guest ID" section
  asks for — the plan reuses it (adds `nickname`/`avatar` columns) rather
  than inventing a parallel identity system. `queue_entries` already has
  `added_by_session_id`, so the "who queued this" attribution feature is
  mostly a join + column exposure, not new tracking. Avatar set resolved to
  a fixed emoji palette (spec's suggested fallback). No implementation
  started yet — F0.1 is next.
