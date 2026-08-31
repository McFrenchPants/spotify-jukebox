# Lyrics Integration — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (approved by the user 2026-08-30).

All work happens on `feature/lyrics-integration` — confirm you're on that
branch before making any changes.

## Status: Backend (LY0+LY1) fully done. Starting frontend (LY2).

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| LY0.1 | Lyrics DB table + LRCLIB client | done | `backend/src/db/lyrics.ts` (get/save-upsert/evict-if-not-favorited) + `backend/src/lyrics/lrclib.ts` (get→search fallback→null/throw); new `lyrics` table in `db/index.ts`'s migration block |
| LY0.2 | Lyrics lookup + cache orchestration | done | `backend/src/lyrics/lyricsService.ts`: `getLyricsForTrack()` (cache-then-LRCLIB, never caches a transient failure), `evictPreviousTrackLyrics()`. **Phase LY0 (backend foundation) now fully done.** |
| LY1.1 | Trigger lookup on track change, emit SSE event | done | `nowPlaying.ts`: evicts previous track's cache + fire-and-forget lookup on an actual track change (skips on a mere play/pause toggle); new `getLyricsSnapshot()` accessor |
| LY1.2 | `GET /api/lyrics` route | done | `routes/lyrics.ts` + registration in `app.ts`. `loading: true` present only while a track is playing but its lookup hasn't resolved yet; omitted otherwise. **Phase LY0+LY1 (backend) now fully done.** |
| LY2.1 | API client + types | todo | Depends on LY1.2 (done) |
| LY2.2 | LRC parsing + auto-scroll hook | todo | Depends on LY1.2 (types only, can start alongside LY2.1) |
| LY2.3 | `LyricsPanel` + wiring into `NowPlaying.tsx` | todo | Depends on LY2.1, LY2.2 |
| LY3.1 | Cross-cutting regression pass | todo | Depends on LY2.3 |
| LY3.2 | Close out (backlog, PROGRESS.md, merge) | todo | Depends on LY3.1. Needs explicit user go-ahead to merge |

## Open Questions / Blockers

*(none currently — DESIGN_SPEC.md's open questions were all judged small
enough to resolve during implementation, per the spec itself)*

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

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
