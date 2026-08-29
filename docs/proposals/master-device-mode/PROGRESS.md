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

## Status: Phases M0-M4 done. M5.2 in progress — two real-hardware bugs found so far (missing backend-URL config + no CORS, then Android's default cleartext-HTTP block), both fixed and rebuilt; awaiting user retest. M5.3 (close-out/merge) remains after that.

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
| M2.1 | Capacitor plugin: set system volume | done | `VolumeControlPlugin.java` (`@CapacitorPlugin(name="VolumeControl")`, `setVolume({percent})` via `AudioManager.setStreamVolume(STREAM_MUSIC, ..., flags=0)` — no UI/beep on change), registered in `MainActivity.onCreate`. `frontend/src/lib/volumeControlPlugin.ts` exports the typed `VolumeControl.setVolume({percent}): Promise<void>` handle, not yet wired into any UI (M2.2). Verified with a real `gradlew assembleDebug` — `BUILD SUCCESSFUL`. No emulator/device available to test runtime behavior (expected; deferred to M5.2). |
| M2.2 | Wire plugin into SSE volume-command listener | done | `jukebox-volume-command` added to `useEventStream.ts`'s `NAMED_EVENTS`; native builds append `?clientId=` to the SSE URL (web unchanged, verified via live network inspection — same `GET /api/events` with no query string). `RootLayout.tsx` subscribes and calls `VolumeControl.setVolume()` only when `Capacitor.isNativePlatform()`, swallowing/logging failures. Native path code-reviewed only (no device/emulator here, `isNativePlatform()` always false in this browser). Build/lint clean, same baseline. **Phase M2 (native plugin) done.** |
| M3.1 | Stable per-install client id | done | `frontend/src/lib/clientId.ts`, `getOrCreateClientId()`, `localStorage['jukebox_client_id']`. No frontend test runner exists in this project — verified manually via dev server (stable across reload). Build/lint clean. |
| M3.2 | "Jukebox device" Settings toggle | done | New `JukeboxDeviceCard` in `SettingsPage.tsx`'s admin panel — inert explanatory note on web (verified live, no fetch made), registration toggle behind `Capacitor.isNativePlatform()` on native (code-reviewed only, no real Android device available in this environment). Build/lint clean, same baseline. **Phase M3 (frontend, non-native-build-dependent parts) is now fully done** — only M2 (native plugin, needs a real Android build) and M4/M5 (build script/docs/verification, same dependency) remain. |
| M3.3 | Route PlaybackControls volume UI through new state | done | `TrustModeState.jukeboxDevice{registered,online}` added; `volumeAllowed` also true when Jukebox device registered+online (independent of Spotify `supports_volume`); Jukebox-device-offline forces ALL controls disabled with a new distinct caption, takes priority over the existing restricted/unsupported captions. All 3 states actually rendered live (2 via a temporary hardcoded `getTrustMode()` response, reverted) — none code-review-only. Build/lint clean, same baseline. |
| M4.1 | One-command Android build script | done | `npm run build:android` (`frontend/scripts/build-android.js`) chains web build → `cap sync android` → Gradle `assembleDebug`, cross-platform gradlew selection, and auto-locates/injects a JDK 21 for just the Gradle step if the shell's default `java`/`JAVA_HOME` is older (exactly the wrinkle this environment hit). Re-verified independently — real `BUILD SUCCEEDED`, APK produced. |
| M4.2 | Self-hoster documentation | done | [docs/MASTER_DEVICE_MODE.md](../MASTER_DEVICE_MODE.md): what/why, `npm run build:android`, sideload/install-unknown-sources caveat, registering via Settings, verifying it worked. `README.md` gained exactly one added link sentence, nothing else touched. **Phase M4 done.** |
| M5.1 | Cross-scenario regression pass | done | Full backend suite: 38 files / 323 tests passing, `tsc --noEmit` clean. Frontend: `npm run build`/`npm run lint` clean (same pre-existing warning baseline throughout this whole proposal, zero new). Docker smoke test **not run** — Docker Desktop isn't running in this environment. Risk assessed as low: nothing in this proposal touched `Dockerfile`/`docker-compose.yml`/`config.yaml`/any deployment file, and every change was additive (new endpoints/fields, `Capacitor.isNativePlatform()`-gated code paths) rather than a modification to an existing code path's default behavior. Worth a real Docker re-run before merge if the user wants extra confidence, but not treated as a hard blocker given the above. |
| M5.2 | Real-hardware verification (needs the user) | todo | Needs actual bridge Pixel 7 Pro — stopping point for user |
| M5.3 | Close out (backlog, PROGRESS.md, merge) | todo | Needs explicit user go-ahead to merge |

## Open Questions / Blockers

- **Resolved 2026-08-29 — JDK 21 installed.** User installed Eclipse
  Temurin JDK 21 and confirmed a real `gradlew.bat assembleDebug` now
  succeeds end-to-end (`BUILD SUCCESSFUL in 1m 21s`), producing
  `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. M2.1/M4.1
  can now be verified by actually running a build, not just code review.
  See [ANDROID_BUILD.md](ANDROID_BUILD.md), updated to reflect this.
- M5.2 explicitly requires the user's real bridge hardware and cannot be
  done autonomously.

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-08-29** — **Second real-hardware bug found and fixed.** After the
  backend-URL/CORS fix below, the user retried with both a LAN IP
  (`http://192.168.50.179:8085`) and a `.local` hostname
  (`http://homeassistant.local:8085`) — both worked fine in a real browser
  but the app's own first-run reachability check still failed with "couldn't
  reach that address" for both. Root cause: Android blocks cleartext
  (`http://`, non-TLS) network traffic app-wide by default starting API 28 —
  this applies to the app's own `fetch()` calls, not just WebView page
  navigation, and `AndroidManifest.xml` had no exception configured. Fixed
  directly (small, precise, one attribute) rather than delegating: added
  `android:usesCleartextTraffic="true"` to the `<application>` tag, with a
  comment explaining why (the backend is plain HTTP by design — LAN-only,
  user-entered address, no TLS available). First attempt at the edit broke
  the manifest's XML (used `--` inside a comment body, invalid XML) —
  caught immediately by the real `gradlew` build failing with a manifest
  parse error; fixed and re-verified with a clean `BUILD SUCCESSFUL`. New
  APK sent to the user for another retest.
- **2026-08-29** — **Real-hardware testing (M5.2) found and fixed a genuine
  gap in the original plan**: the user installed the APK and hit an
  immediate crash — `Unexpected token '<', "<!doctype " is not valid JSON`.
  Root cause: the native app's WebView loads the bundled static build from
  its own local origin with no backend co-located there at all, so every
  relative `/api/...` fetch (all of `api.ts`, `useEventStream.ts`'s SSE URL,
  and — found during review, missed by the first pass — `session.ts`'s
  `bootstrapSession()`) resolved against the WebView's own local server and
  got served `index.html` back. Nothing in the original DESIGN_SPEC/
  IMPLEMENTATION_PLAN anticipated this — an oversight, not a task that was
  skipped. Also found and fixed a second, related gap: the backend had no
  CORS headers on any route except `/api/events`, which would have blocked
  the fix below even once the URL was right. Two fixes, delegated in
  parallel then verified: (1) backend — global permissive CORS middleware
  (`backend/src/app.ts`; wildcard origin is safe since every route uses
  bearer-style header tokens, never cookies), 326 tests passing; (2)
  frontend — `lib/backendUrl.ts` (`getApiBaseUrl()`: `''` on web, the
  user-configured LAN URL on native) threaded through every API/SSE call,
  plus a native-only first-run `NativeBackendGate` setup screen that
  validates reachability via `GET /api/health` before saving. Web path
  live-verified unchanged via dev server (every call still relative,
  byte-identical); real `gradlew assembleDebug`/`build:android` succeeds
  with the fix included. Rebuilt APK ready for the user to reinstall and
  retest — native first-run screen itself could only be code-reviewed (no
  device/emulator in this environment).
- **2026-08-29** — Phases M0-M4 all completed this session, each task via a
  narrowly-scoped subagent, independently verified (diff review, real test
  suites, and — for the Android side — a real `gradlew assembleDebug`/
  `npm run build:android` run, not just code review) and committed
  separately. User installed JDK 21 (Eclipse Temurin) mid-session after the
  M0.2 doc surfaced that gap, unblocking a real Android build for the rest
  of the proposal. M5.1 (regression pass) done: full backend suite (323
  tests) and frontend build/lint clean; a real Docker smoke test was **not**
  run (Docker Desktop not running in this environment) but risk assessed as
  low since nothing in this proposal touched deployment files and all
  changes are additive/feature-gated. **Remaining: M5.2 (real bridge Pixel
  7 Pro verification — needs the user directly, cannot be done
  autonomously) and M5.3 (close-out: backlog, root PROGRESS.md, merge —
  needs explicit user go-ahead for the merge step).**
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
