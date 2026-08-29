# Master Device Mode — Progress Tracker

**Read this file first in any new session working on this proposal.** Source
of truth for what's done, what's next, and any context needed to resume.
Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions/requirements are
frozen in [DESIGN_SPEC.md](DESIGN_SPEC.md) (reviewed, all decisions final,
see its §6).

All work happens on `feature/master-device-mode` — confirm you're on that
branch before making any changes. The branch was fast-forwarded to current
`master` (`b49e7e3`) on 2026-08-29 before implementation started, since it
had sat untouched (0 unique commits) since being cut.

## Status: Implementation started — Phase M0 in progress

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| M0.1 | Add Capacitor to `frontend` | done | `frontend/capacitor.config.ts` (app id `com.mcfrench.guestjukebox`, `webDir: 'dist'`), `frontend/android/` native project. `npx cap sync android` verified clean — no Android SDK/Gradle invocation needed for a plain sync with no native plugins yet, so no environment-limitation caveat here (that will likely surface at M4.1 when `gradlew assembleDebug` is actually run). `npm run build` output unchanged (same file names/hashes). |
| M0.2 | Document Android build prerequisites | todo | |
| M1.1 | Jukebox device registration endpoints | done | `backend/src/db/jukeboxDevice.ts` (new `app_settings` key, no new table) + `GET`/`POST /api/admin/jukebox-device*` in `admin.ts`, both `requireAdminAuth`-gated. 303 backend tests passing (11 new), `tsc --noEmit` clean. |
| M1.2 | Jukebox-device online/offline tracking | todo | Depends on M1.1 |
| M1.3 | Volume command routing endpoint | todo | Depends on M1.1, M1.2 |
| M1.4 | Expose registered/online/offline state to frontend | todo | Depends on M1.2 |
| M2.1 | Capacitor plugin: set system volume | todo | Depends on M0.1 |
| M2.2 | Wire plugin into SSE volume-command listener | todo | Depends on M1.3, M2.1 |
| M3.1 | Stable per-install client id | todo | |
| M3.2 | "Jukebox device" Settings toggle | todo | Depends on M1.1, M3.1 |
| M3.3 | Route PlaybackControls volume UI through new state | todo | Depends on M1.4, M2.2 |
| M4.1 | One-command Android build script | todo | Depends on M0.1, M0.2 |
| M4.2 | Self-hoster documentation | todo | Depends on M4.1 |
| M5.1 | Cross-scenario regression pass | todo | Depends on all above |
| M5.2 | Real-hardware verification (needs the user) | todo | Needs actual bridge Pixel 7 Pro — stopping point for user |
| M5.3 | Close out (backlog, PROGRESS.md, merge) | todo | Needs explicit user go-ahead to merge |

## Open Questions / Blockers

- This dev/agent environment's Android SDK/emulator availability is unknown
  going in — M0.1/M0.2/M2.1 may need to flag "code-reviewed only, not
  runnable in this environment" the same way this project's Docker work
  once did before Docker Desktop was installed. Not a blocker to starting,
  just an expected verification-confidence caveat to watch for.
- M5.2 explicitly requires the user's real bridge hardware and cannot be
  done autonomously.

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-08-29** — Picked up via `/continue-development`. `BACKLOG.md` item 8
  listed this as "in progress — design spec in review," but
  `DESIGN_SPEC.md`'s own header already said "Reviewed — ready for
  implementation planning" with no open questions — the backlog entry was
  just stale. `feature/master-device-mode` existed but had zero unique
  commits (branched long ago, never used); fast-forwarded it to current
  `master` so it now carries the design spec and everything else already on
  `master`. Wrote this `IMPLEMENTATION_PLAN.md` (5 phases, M0-M5) and this
  tracker. No implementation code written yet — next up is M0.1 (Capacitor
  scaffolding).
