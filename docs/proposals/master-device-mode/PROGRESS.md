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
| M0.2 | Document Android build prerequisites | done | [ANDROID_BUILD.md](ANDROID_BUILD.md). Real build attempted in this environment: JDK 17 + an existing local Android SDK got through project config/resource processing, but failed at `:capacitor-android:compileDebugJavaWithJavac` — `@capacitor/android` requires JDK 21 source/target compatibility. No APK produced yet; JDK 21 install needed before M4.1 can complete a real build. See Open Questions. |
| M1.1 | Jukebox device registration endpoints | done | `backend/src/db/jukeboxDevice.ts` (new `app_settings` key, no new table) + `GET`/`POST /api/admin/jukebox-device*` in `admin.ts`, both `requireAdminAuth`-gated. 303 backend tests passing (11 new), `tsc --noEmit` clean. |
| M1.2 | Jukebox-device online/offline tracking | done | `backend/src/events/jukeboxDeviceOnline.ts` — refcounted `Map` of connected client ids, `isJukeboxDeviceOnline()`, `clientConnected`/`clientDisconnected`. `GET /api/events?clientId=` (optional, backward-compatible) wires it in `events.ts`. Emits `jukebox-device-status` `{online}` only on actual flip. Known gap: no event fires the instant a *new registration* supersedes the old one mid-connection — `isJukeboxDeviceOnline()` is always correct on-demand, only the push event lags until the next connect/disconnect. 316 backend tests passing (13 new), `tsc` clean. |
| M1.3 | Volume command routing endpoint | done | `POST /api/playback/volume` emits `jukebox-volume-command` `{volumePercent}` via the event bus (bypassing Spotify's volume API + device resolution entirely) when a Jukebox device is registered+online; falls through to the unchanged existing Spotify-volume-API path otherwise. Trust-mode gate + body validation unchanged, run first either way. |
| M1.4 | Expose registered/online/offline state to frontend | done | `GET /api/trust-mode` gained an additive `jukeboxDevice: {registered, online}` field — 3 existing fields unchanged. 323 backend tests passing (7 new), `tsc` clean. **Phase M1 (backend) is now fully done.** |
| M2.1 | Capacitor plugin: set system volume | todo | Depends on M0.1 |
| M2.2 | Wire plugin into SSE volume-command listener | todo | Depends on M1.3, M2.1 |
| M3.1 | Stable per-install client id | done | `frontend/src/lib/clientId.ts`, `getOrCreateClientId()`, `localStorage['jukebox_client_id']`. No frontend test runner exists in this project — verified manually via dev server (stable across reload). Build/lint clean. |
| M3.2 | "Jukebox device" Settings toggle | todo | Depends on M1.1, M3.1 |
| M3.3 | Route PlaybackControls volume UI through new state | done | `TrustModeState.jukeboxDevice{registered,online}` added; `volumeAllowed` also true when Jukebox device registered+online (independent of Spotify `supports_volume`); Jukebox-device-offline forces ALL controls disabled with a new distinct caption, takes priority over the existing restricted/unsupported captions. All 3 states actually rendered live (2 via a temporary hardcoded `getTrustMode()` response, reverted) — none code-review-only. Build/lint clean, same baseline. |
| M4.1 | One-command Android build script | todo | Depends on M0.1, M0.2 |
| M4.2 | Self-hoster documentation | todo | Depends on M4.1 |
| M5.1 | Cross-scenario regression pass | todo | Depends on all above |
| M5.2 | Real-hardware verification (needs the user) | todo | Needs actual bridge Pixel 7 Pro — stopping point for user |
| M5.3 | Close out (backlog, PROGRESS.md, merge) | todo | Needs explicit user go-ahead to merge |

## Open Questions / Blockers

- **JDK 21 required, not installed.** This environment has JDK 17 and an
  Android SDK already at `C:\Dev Android SDK` (platforms 34/35, Gradle
  auto-installed 36 on demand) — but `@capacitor/android`'s Gradle module
  pins `sourceCompatibility`/`targetCompatibility` to Java 21, so
  `gradlew assembleDebug` fails at the Java compile step regardless of SDK
  platform availability. No APK has been produced yet. M2.1 (native plugin)
  and M4.1 (build script) will need a real JDK 21 install to actually run a
  build and verify anything beyond code review — flag this explicitly each
  time rather than assuming a build succeeds. Installing a JDK is a small,
  reversible, one-time environment setup step (not a project/user decision)
  — worth just doing before M2.1/M4.1 rather than treating as a blocker
  needing the user.
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
