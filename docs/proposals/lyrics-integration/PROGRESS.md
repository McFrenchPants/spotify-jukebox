# Lyrics Integration — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (approved by the user 2026-08-30).

All work happens on `feature/lyrics-integration` — confirm you're on that
branch before making any changes.

## Status: All implementation and verification done (LY0-LY3.1). LY3.2 close-out docs done. Only the merge to `master` remains, pending explicit user go-ahead.

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| LY0.1 | Lyrics DB table + LRCLIB client | done | `backend/src/db/lyrics.ts` (get/save-upsert/evict-if-not-favorited) + `backend/src/lyrics/lrclib.ts` (get→search fallback→null/throw); new `lyrics` table in `db/index.ts`'s migration block |
| LY0.2 | Lyrics lookup + cache orchestration | done | `backend/src/lyrics/lyricsService.ts`: `getLyricsForTrack()` (cache-then-LRCLIB, never caches a transient failure), `evictPreviousTrackLyrics()`. **Phase LY0 (backend foundation) now fully done.** |
| LY1.1 | Trigger lookup on track change, emit SSE event | done | `nowPlaying.ts`: evicts previous track's cache + fire-and-forget lookup on an actual track change (skips on a mere play/pause toggle); new `getLyricsSnapshot()` accessor |
| LY1.2 | `GET /api/lyrics` route | done | `routes/lyrics.ts` + registration in `app.ts`. `loading: true` present only while a track is playing but its lookup hasn't resolved yet; omitted otherwise. **Phase LY0+LY1 (backend) now fully done.** |
| LY2.1 | API client + types | done | `getLyrics()`/`LyricsSnapshot` in `frontend/src/lib/api.ts`, mirrors `getNowPlaying()` |
| LY2.2 | LRC parsing + auto-scroll hook | done | `frontend/src/lib/lrc.ts` (`parseLrc`) + `frontend/src/hooks/useSyncedLyrics.ts`; no frontend test runner exists in this project, verified manually (documented in session log) |
| LY2.3 | `LyricsPanel` + wiring into `NowPlaying.tsx` | done | New `LyricsPanel.tsx` + `NowPlaying.tsx` wiring + `NAMED_EVENTS` addition. Two issues found and fixed directly before accepting: a wide-screen layout squeeze against the artist-detail split, and an auto-scroll/manual-scroll detection bug. Live-verified via a temporary reverted debug fixture (no real Spotify session in this dev environment). **Phase LY2 (frontend) now fully done.** |
| LY3.1 | Cross-cutting regression pass | done | Backend: 45 files/387 tests green, `tsc --noEmit` clean. Frontend: `tsc -b`/`npm run build` clean. Real LRCLIB spot-check (throwaway script, deleted after) against live data: a mainstream track ("Bohemian Rhapsody") returned synced+plain lyrics, a nonsense track correctly returned not-found. Full Spotify-session smoke test not possible in this dev environment (no working credentials, documented recurring gap in this project — see session log) |
| LY3.2 | Close out (backlog, PROGRESS.md, merge) | in-progress | Backlog/root-PROGRESS.md/CHANGELOG.md/config.yaml done. Only the merge to `master` remains — needs explicit user go-ahead |

## Open Questions / Blockers

*(none currently — DESIGN_SPEC.md's open questions were all judged small
enough to resolve during implementation, per the spec itself)*

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-08-30** — LY2.3 done via a subagent, then LY3.1 done directly.
  LY2.3's diff was reviewed carefully (this is the most user-visible piece
  of the whole proposal) and two real issues were found and fixed before
  accepting, not just cosmetic nits: (1) the new `<LyricsPanel>` was nested
  as a third child inside the existing `lg:flex` wrapper that splits
  art/track-info and artist/genre 50/50 once the artist-detail section is
  open — opening both the Lyrics panel and the artist-info expand at once
  on a wide screen would have squeezed the lyrics panel between those two
  columns instead of sitting as its own full-width block below them;
  fixed by moving it outside that wrapper, still inside the same `Card`
  and still below all the existing song-info content, per the design
  spec's actual requirement. (2) The `onScroll` handler that arms the
  "guest is manually scrolling, pause auto-scroll" window was also firing
  on the scroll events `scrollIntoView({behavior:'smooth'})` itself
  generates — meaning every auto-scroll would immediately look like a
  manual scroll and re-arm its own pause, so auto-scroll would have
  effectively stopped working after the very first line change once
  expanded. Fixed with an `isAutoScrollingRef` flag set around each
  programmatic scroll. Both fixes verified: `tsc -b`/`npm run build`/
  `npm run lint` clean (same baseline), and — since this dev environment
  has no working Spotify session (a documented recurring gap across this
  project's past proposals) — via a temporary debug fixture (hardcoded
  `getNowPlaying()`/`getLyrics()` responses and a `NowPlayingState` seed in
  `NowPlaying.tsx`, all fully reverted before committing, confirmed via
  `git diff` showing no residual debug code) run against a real dev
  server: confirmed the "Lyrics" button renders and toggles the panel
  without also toggling the card's own artist-info expand state, the
  synced-lyrics view renders all lines and correctly highlights the line
  matching the ticking `progressMs`, and the panel's own expand toggle
  works independently and applies the wider max-height class. Dev servers
  (frontend 5173, `npm run dev` backend 8085) were both stopped and
  `netstat` confirmed neither port still listening, per this project's
  standing rule. Committed (`181bf4c`).
  LY3.1 (regression pass) done directly: full backend suite (45 files/387
  tests) and `tsc --noEmit` clean, frontend `tsc -b`/`npm run build`
  clean. Also ran a real (non-mocked) spot-check of `fetchLyricsFromLrclib`
  against LRCLIB's live API via a throwaway script (deleted after use, not
  committed) — a mainstream track ("Bohemian Rhapsody" / Queen) correctly
  returned both synced and plain lyrics, and a deliberately-nonsense
  track/artist pair correctly returned not-found. A full live smoke test
  through an actual Spotify now-playing session was NOT possible in this
  dev environment (no working refresh token configured for local dev,
  same recurring limitation documented across the Favorites and
  landscape-layout proposals) — flagged as a real, known gap rather than
  silently skipped. LY3.2 (close-out) is next — **requires the user's
  explicit go-ahead before merging to `master`**.
- **2026-08-30** — LY2.1 and LY2.2 done via two parallel subagents (disjoint
  files — `lib/api.ts` vs. new `lib/lrc.ts`/`hooks/useSyncedLyrics.ts` — no
  conflict). Both diffs verified directly: LY2.1's `getLyrics()`/
  `LyricsSnapshot` mirror `getNowPlaying()`'s exact pattern and correctly
  reflect the backend's `loading`-present-only-when-true wire shape (not
  normalized to `false` client-side). LY2.2's `parseLrc()` handles
  multi-leading-timestamp repeated lines, variable fraction-digit counts,
  and skips metadata/malformed lines without throwing, sorting
  defensively; `useSyncedLyrics()` is a pure `useMemo` derivation with no
  internal timer, keyed on the caller's own `progressMs` so it can't drift
  from the progress bar's existing clock. **No frontend test runner exists
  in this project** (confirmed again this session) — LY2.2 was verified via
  throwaway `npx tsx` scripts (deleted after use, not committed) covering
  well-formed input, repeated-timestamp lines, metadata lines, malformed
  lines, empty-text timestamps, 3-digit fractions, and `useSyncedLyrics`'s
  boundary cases; this is real but manual verification, flagged explicitly
  rather than implied to be automated. `tsc -b` clean after each, and
  again after both landed together. Committed separately (`fecea6a`,
  `f3528e9`). LY2.3 (the `LyricsPanel` component + `NowPlaying.tsx`
  wiring) is next — depends on both, no longer blocked.
- **2026-08-30** — LY1.2 done via a subagent — the last backend task.
  Diff reviewed: route reads `getNowPlayingState().trackId` internally
  (no query params, matching `/api/now-playing`'s own shape), never
  404s/500s for the normal not-ready case, and the `loading: true` field
  is present only in the genuinely-not-yet-resolved case (chosen
  convention: omitted otherwise, not `loading: false`) — worth remembering
  for LY2.1's frontend type. `app.ts` registration mirrors the existing
  `nowPlayingRouter` pattern exactly, nothing else touched. One full-suite
  run hit an unrelated one-off flake (`middleware/adminAuth.test.ts`, a
  different file than the previously-known `queue.test.ts` flake) — reran
  the full suite twice myself independently of the subagent's own run,
  both clean (45 files/387 tests). `tsc --noEmit` clean. Committed
  (`5e7c8d9`). **Phase LY0+LY1 (all backend work) is now fully done.**
  LY2 (frontend — three tasks: API client, LRC parsing/sync hook, the
  LyricsPanel component + NowPlaying wiring) is next; per the
  implementation plan LY2.1 and LY2.2 have no dependency on each other and
  could run in parallel, though LY2.3 depends on both.
- **2026-08-30** — LY1.1 done via a subagent. Diff reviewed directly
  against `nowPlaying.ts`'s existing careful structure: correctly
  distinguishes "track actually changed" (old vs. new trackId) from
  `hasChanged()`'s broader definition (which also fires on a same-track
  play/pause flip) so the lyrics lookup+eviction only runs on a real track
  change; eviction still runs when playback stops (trackId → null) but no
  new lookup is kicked off in that case; the lyrics lookup is genuinely
  fire-and-forget (`.then()/.catch()`, never awaited) so it cannot delay
  the existing synchronous `now-playing` emit; a lookup failure is caught
  and logged via the file's existing `logError` convention, never
  rethrown or turned into an emitted event. New `getLyricsSnapshot()`
  mirrors `getNowPlayingState()`'s existing accessor pattern for LY1.2 to
  use. Re-ran the full suite and typecheck myself: 44 files/383 tests
  green, `tsc --noEmit` clean. Committed (`f20333e`). LY1.2 (the
  `GET /api/lyrics` route) is next, no blockers.
- **2026-08-30** — LY0.2 done via a subagent, depended on LY0.1 (done just
  before). Diff verified directly: `getLyricsForTrack()` matches the
  cache-then-LRCLIB-then-cache-result design exactly, including not
  caching a transient LRCLIB failure; `evictPreviousTrackLyrics()` is a
  thin null-guarded wrapper as specified. Re-ran the full backend suite
  and typecheck myself: 44 files/376 tests green (no flake this run),
  `tsc --noEmit` clean. Committed (`263135c`). **Phase LY0 (backend
  foundation) is now fully done.** LY1.1 (wire into the now-playing
  poller) is next, no blockers.
- **2026-08-30** — LY0.1 done via a subagent (backend-only, no dependencies).
  Diff verified directly against the plan before accepting — table columns,
  upsert semantics, and the `NOT EXISTS`-guarded eviction delete all match.
  Re-ran the full backend suite myself (not just on the subagent's word):
  hit the project's known pre-existing `queue.test.ts`/`server.close`
  test-isolation flake on the first full-suite run (25 failures), confirmed
  unrelated by running `queue.test.ts` alone (10/10 passing) and a second
  full-suite run (43 files/368 tests, all green) — matches the flake class
  already documented in the root PROGRESS.md. `tsc --noEmit` clean.
  Committed (`06a6b22`). LY0.2 is next, no blockers.
- **2026-08-30** — Plan created (`IMPLEMENTATION_PLAN.md`) and this tracker
  initialized via `/continue-development`, picking up BACKLOG.md item 1.
  Design spec was reviewed and approved by the user before this. No
  implementation started yet — LY0.1 is next, no blockers.
