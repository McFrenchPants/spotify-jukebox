# Lyrics Integration — Implementation Plan

Scoped tasks for [DESIGN_SPEC.md](DESIGN_SPEC.md). Task IDs use the `LY`
prefix (unused by any other proposal so far). Phased: LY0 (backend
foundation) → LY1 (backend wiring into the poller) → LY2 (frontend) → LY3
(verification/close-out). LY0/LY1 have no frontend dependency and can run
before LY2 starts; LY2's three tasks touch different files and can run in
parallel once LY1 is done.

## LY0 — Backend foundation

### LY0.1 — Lyrics DB table + LRCLIB client
**Files:** `backend/src/db/index.ts` (migration), `backend/src/db/lyrics.ts` (new),
`backend/src/lyrics/lrclib.ts` (new)

- Add a `lyrics` table to the migration block in `backend/src/db/index.ts`,
  same style as the existing `favorites`/`play_history` tables (`CREATE
  TABLE IF NOT EXISTS`). Columns: `spotify_track_id TEXT PRIMARY KEY`,
  `synced_lyrics TEXT` (nullable — LRCLIB's LRC-format synced lyrics, null
  if only plain lyrics exist), `plain_lyrics TEXT` (nullable — null if no
  lyrics at all were found, distinct from "not yet looked up"), `found
  INTEGER NOT NULL` (0/1 — distinguishes "looked up, nothing found" from a
  row not existing at all, so a real "no lyrics" result doesn't trigger a
  repeat LRCLIB lookup on every subsequent play), `fetched_at TEXT NOT
  NULL`. This table is written to for **every** track that gets a lyrics
  lookup (see LY0.2), not only favorited ones — see LY0.2 for how eviction
  of non-favorited rows works.
- `backend/src/db/lyrics.ts`: `getCachedLyrics(spotifyTrackId): CachedLyrics
  | null`, `saveLyrics(spotifyTrackId, result): void`,
  `deleteLyricsIfNotFavorited(spotifyTrackId): void` (used by LY0.2's
  eviction — checks `favorites` for any row with this track id before
  deleting, i.e. a track favorited by *anyone* is exempt from eviction, not
  just the guest who originally triggered the lookup). Follow
  `backend/src/db/favorites.ts`'s existing style (typed row interface +
  snake_case→camelCase mapping function, prepared statements).
- `backend/src/lyrics/lrclib.ts`: `fetchLyricsFromLrclib(params: { trackName:
  string; artistName: string; albumName?: string; durationMs?: number
  }): Promise<{ syncedLyrics: string | null; plainLyrics: string | null }
  | null>` — calls LRCLIB's `GET https://lrclib.net/api/get` (query params:
  `track_name`, `artist_name`, `album_name`, `duration` in seconds) with a
  fallback to `GET https://lrclib.net/api/search` if the exact-match `get`
  endpoint 404s (LRCLIB's own documented pattern for partial-metadata
  matches). Returns `null` on a genuine "not found" (never throws for that
  case); throws for actual network/5xx failures so the caller can decide
  how to log it. Takes an injectable `fetchFn` param (default global
  `fetch`), matching this codebase's existing testability convention (see
  `nowPlaying.ts`'s `fetchFn` param).
- **Acceptance:** new backend tests for `lyrics.ts` (save/get/delete,
  including the "favorited → not evicted" case) and `lrclib.ts` (mocked
  fetch: exact match, search fallback, genuine not-found → null, a non-2xx
  non-404 → throws). Full backend suite green, `tsc --noEmit` clean.

### LY0.2 — Lyrics lookup + cache orchestration
**Files:** `backend/src/lyrics/lyricsService.ts` (new)
**Notes:** depends on LY0.1

- `getLyricsForTrack(spotifyTrackId, trackMeta): Promise<LyricsResult>` —
  the single entry point LY1 calls. Checks `getCachedLyrics()` first
  (cache hit, including a cached "not found," returns immediately with no
  LRCLIB call). On a cache miss, calls `fetchLyricsFromLrclib()`, saves the
  result via `saveLyrics()` (including saving a "not found" result, so a
  track LRCLIB genuinely has nothing for isn't re-queried every time it
  plays), and returns it.
- Eviction for non-favorited tracks: rather than a separate TTL/LRU
  mechanism, piggyback on the natural "a new track started playing" signal
  already available in `nowPlaying.ts` — when `getLyricsForTrack` is about
  to cache a **new** track's lookup result, first call
  `deleteLyricsIfNotFavorited()` for the **previous** track (the one that
  was just replaced), passed in as a param. This keeps the table bounded to
  "currently playing + favorited" rather than growing forever, without a
  cron job or background sweep. (Simpler than a true LRU; acceptable since
  this cache's only job is avoiding a repeat LRCLIB call for the track
  that's actually playing right now.)
- **Acceptance:** unit tests covering cache-hit (no LRCLIB call), cache-miss
  fetch-and-save, cached-not-found (no repeat LRCLIB call), and the
  evict-previous-unless-favorited behavior. Full backend suite green, `tsc
  --noEmit` clean.

## LY1 — Wire into the now-playing poller + expose to frontend

### LY1.1 — Trigger lookup on track change, emit SSE event
**Files:** `backend/src/spotify/nowPlaying.ts`, `backend/src/db/lyrics.ts` (from LY0.1)
**Notes:** depends on LY0.2

- In `pollNowPlaying()`'s existing `if (hasChanged(...))` branch (where
  `now-playing` is already emitted), when `nextState.trackId` is set, call
  `getLyricsForTrack()` for the new track (fire-and-forget from the poll's
  perspective — don't block the `now-playing` emit on it; see below for the
  exact sequencing) and emit a new `lyrics-update` event
  (`{ trackId, syncedLyrics, plainLyrics, found }`) once it resolves. Pass
  the previous `lastState.trackId` through to `getLyricsForTrack` for
  LY0.2's evict-previous-track step.
- Sequencing: emit `now-playing` immediately (unchanged latency for the
  existing UI), then kick off the lyrics lookup async and emit
  `lyrics-update` when it resolves — a slower LRCLIB response should never
  delay the now-playing update guests already depend on. A LRCLIB
  failure (thrown error, not a normal not-found) should be caught and
  logged (`logError`, same pattern as the poller's other error handling)
  rather than crashing the poll or emitting anything — the frontend's
  "still loading" state just persists a bit longer, no error surfaced to
  guests for what's ultimately a nice-to-have.
- Add a `getLyricsSnapshot(trackId): LyricsResult | null` accessor (mirrors
  `getNowPlayingState()`) so a route (LY1.2) can serve the current track's
  lyrics on demand instead of only via the SSE push, for a guest who opens
  the Lyrics panel for a track that already started before they connected.
- **Acceptance:** new/updated tests in `nowPlaying.test.ts` confirming
  `lyrics-update` fires on track change (mocked lyrics service), does not
  delay `now-playing`'s own emit, and a lyrics-lookup failure doesn't throw
  out of `pollNowPlaying`. Full backend suite green, `tsc --noEmit` clean.

### LY1.2 — `GET /api/lyrics` route
**Files:** `backend/src/routes/lyrics.ts` (new), `backend/src/app.ts`
**Notes:** depends on LY1.1

- `GET /api/lyrics` (no params — always answers for whatever's currently
  playing, mirroring `GET /api/now-playing`'s own shape/precedent) returns
  `{ trackId, syncedLyrics, plainLyrics, found }` for the current track via
  `getLyricsSnapshot()`, or a `{ trackId: null }`-shaped "nothing playing"
  response if there's no current track — never a 404/500 for the normal
  "no lyrics yet fetched" case. Public, like `/api/now-playing` (no guest
  token required — the same lyrics are shown to every guest regardless of
  identity).
- **Acceptance:** route test covering nothing-playing, lyrics-not-yet-ready
  (lookup still in flight or track has no cache entry yet), and
  lyrics-found. Full backend suite green, `tsc --noEmit` clean. **Phase LY0
  + LY1 (all backend) is now fully done.**

## LY2 — Frontend

These three tasks touch disjoint files and can be delegated in parallel
once LY1 is merged/committed.

### LY2.1 — API client + types
**Files:** `frontend/src/lib/api.ts`

- Add `getLyrics(): Promise<LyricsSnapshot>` calling `GET /api/lyrics`, and
  the `LyricsSnapshot` type (`{ trackId: string | null; syncedLyrics:
  string | null; plainLyrics: string | null; found: boolean }`), matching
  the backend response shape from LY1.2.
- **Acceptance:** `tsc -b` clean. No behavior to live-verify yet (no
  consumer until LY2.2/LY2.3).

### LY2.2 — LRC parsing + auto-scroll hook
**Files:** `frontend/src/lib/lrc.ts` (new), `frontend/src/hooks/useSyncedLyrics.ts` (new)

- `parseLrc(syncedLyrics: string): Array<{ timeMs: number; text: string }>`
  — parses LRCLIB's standard `[mm:ss.xx]` line-prefix format into an
  ordered array. Malformed/unparseable lines are skipped rather than
  thrown on (LRCLIB's data is community-sourced, treat it defensively).
- `useSyncedLyrics(lines, progressMs)` — given parsed lines and the same
  live `progressMs` value `NowPlaying.tsx` already computes for its
  progress bar, returns the index of the currently-active line (the last
  line whose `timeMs <= progressMs`). Pure derivation, no polling/timer of
  its own — it rides the existing progress clock rather than starting a
  second one.
- **Acceptance:** unit tests for `parseLrc` (well-formed input, a line with
  no timestamp, an empty string, out-of-order timestamps) and
  `useSyncedLyrics` (boundary cases: before the first line, exactly on a
  timestamp, after the last line). This project has no frontend test
  runner for components, but these two are plain functions/hooks —
  add them under whatever lightweight test setup, if any, already exists
  in `frontend/`; if none exists, verify via manual/console checks in the
  dev server instead and say so explicitly rather than claiming automated
  coverage that doesn't exist.

### LY2.3 — `LyricsPanel` + wiring into `NowPlaying.tsx`
**Files:** `frontend/src/components/nowplaying/LyricsPanel.tsx` (new),
`frontend/src/components/nowplaying/NowPlaying.tsx`
**Notes:** depends on LY2.1, LY2.2

- New `LyricsPanel` component: fetches `getLyrics()` on mount for the
  initial snapshot, then subscribes to the `lyrics-update` SSE event (add
  `'lyrics-update'` to `useEventStream.ts`'s `NAMED_EVENTS` allowlist —
  **do this explicitly**, per this project's own PROGRESS.md note that a
  missing allowlist entry silently drops an otherwise-correct SSE
  subscription with no typecheck/build error to catch it) to stay live as
  the track/lyrics change.
  - Collapsed (default) state: fixed-height scrolling window, auto-scrolls
    the active line (from `useSyncedLyrics`) into view, active line
    visually emphasized (full-opacity/accent) against dimmer surrounding
    lines per the design spec.
  - Tapping the panel expands it to full size; in the expanded state the
    guest can scroll freely and auto-scroll pauses while they're actively
    scrolling (e.g. gated on a recent-manual-scroll timestamp, resuming
    once it's been idle a couple seconds — small implementation-level
    call, per the design spec's open question).
  - No-lyrics-found state: plain empty-state message, not an error.
  - Unsynced-lyrics state (has `plainLyrics` but no `syncedLyrics`): render
    as static text, no auto-scroll/highlight.
  - Loading state (nothing cached yet, lookup still in flight): a plain
    loading indicator, not the not-found state.
- `NowPlaying.tsx`: add a "Lyrics" button (separate control from the
  existing card-body tap-to-expand handler — needs its own
  `stopPropagation`, same pattern already used for `FavoriteButton` and the
  artist `<Link>` in this file) that toggles rendering `<LyricsPanel>`
  below the existing song-info block. Panel visibility state resets
  (closes) is **not** required to reset on track change per the design
  spec — if open, it stays open and just updates to the new track's
  lyrics.
- Visual styling: reuse `Card`, existing color tokens/spacing conventions
  from this file and `Card.tsx` — no new visual language.
- **Acceptance:** live-verify via the Browser pane per this project's own
  `<verification_workflow>` — open Now Playing with something actually
  playing, tap "Lyrics," confirm the panel appears and (if the current
  track has synced lyrics on LRCLIB) the active line updates as playback
  progresses; confirm tapping the panel expands it and manual scroll
  doesn't fight the auto-scroll; confirm a track with no LRCLIB match shows
  the empty state, not an error. If screenshot compositing isn't available
  in-session (a recurring limitation in this project, per multiple past
  proposals' session logs), fall back to DOM/computed-style inspection via
  `javascript_tool` and say so explicitly rather than claiming a visual
  check that didn't happen.

## LY3 — Verification + close-out

### LY3.1 — Cross-cutting regression pass
**Files:** none (verification only)
**Notes:** depends on LY2.3

- Full backend suite + `tsc --noEmit` (backend and frontend), `npm run
  build`/`npm run lint` (frontend) — confirm no regressions and no new
  warning categories vs. the existing baseline.
- Spot-check a handful of real tracks (a mainstream one likely to have
  LRCLIB data, an obscure/local one likely not to) to confirm both the
  found and not-found paths behave as designed against live LRCLIB, not
  just mocked tests.
- **Acceptance:** all green; any regression found gets fixed before moving
  to close-out.

### LY3.2 — Close out
**Files:** `BACKLOG.md`, `PROGRESS.md`, `CHANGELOG.md`, `config.yaml`
**Notes:** depends on LY3.1; **requires explicit user go-ahead before
merging to `master`**, per this project's standing process

- Mark BACKLOG.md item 1 `done` with a short summary of what shipped.
- Add a Post-Launch row to the root `PROGRESS.md` (this feature is
  significant enough to warrant one, matching the precedent set by
  Favorites/Master Device Mode/landscape-layout).
- Bump `config.yaml`'s add-on version with a matching `CHANGELOG.md` entry,
  per this project's standing process note about Supervisor rebuild
  detection.
- Merge `feature/lyrics-integration` into `master` — **only after** the
  user explicitly says to.
