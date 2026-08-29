# Master Device Mode — Implementation Plan

Reference: [DESIGN_SPEC.md](DESIGN_SPEC.md) (status: Reviewed, all decisions
final — see its §6). Progress will be tracked in `PROGRESS.md` in this
folder, per the [proposals process](../README.md) step 5.

Each task has an ID (`M<phase>.<n>`), a scope, and acceptance criteria,
mirroring the root [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md)'s
format. An agent picking up a task should read only its own entry below
(plus the linked spec section), implement just that scope, and stop.

All work happens on `feature/master-device-mode` and merges to `master` only
once the phases below are done and verified (proposals process step 6).

---

## Phase M0 — Capacitor scaffolding (no behavior change yet)

Spec ref: §4.1.

- **M0.1 — Add Capacitor to the existing `frontend` project.** Add
  `@capacitor/core`/`@capacitor/cli`/`@capacitor/android` as dependencies of
  the existing `frontend/` package (not a new package/workspace — §4.1 requires
  one React codebase, two build paths). Run `npx cap init` to generate
  `capacitor.config.ts` (app id e.g. `com.mcfrench.guestjukebox`, `webDir:
  'dist'`) and `npx cap add android` to generate the `frontend/android/`
  native project. The existing `npm run build`/`npm run dev` web path must be
  completely unaffected.
  - Accept: `npm run build` in `frontend/` still produces the same static
    `dist/` used by the Docker/HA Add-on deploy today, with no new required
    steps. A fresh `npx cap sync android` succeeds and produces a buildable
    (not yet installed) Android project under `frontend/android/`.

- **M0.2 — Document local Android build prerequisites.** Add
  `docs/proposals/master-device-mode/ANDROID_BUILD.md` (or extend
  `docs/BRIDGE_SETUP.md` — agent's call) listing what a self-hoster needs
  installed (Android SDK/Gradle, via Android Studio or command-line tools
  only) to run `npx cap sync android && cd android && ./gradlew
  assembleDebug` and get an installable APK. This is groundwork for M4's
  single-command build script, not the finished self-hoster doc itself.
  - Accept: following the doc from a clean checkout (agent's own
    verification, or clearly noting what couldn't be verified in this
    environment — e.g. no Android SDK installed here) produces a debug APK
    under `frontend/android/app/build/outputs/apk/debug/`.

## Phase M1 — Backend: device registration & volume command routing

Spec ref: §4.2, §4.3.

- **M1.1 — Jukebox device registration.** New admin-only endpoints:
  `POST /api/admin/jukebox-device/register` (registers the calling client as
  the Jukebox device — needs a stable per-install client id, see M3.1) and
  `GET /api/admin/jukebox-device` (current registration, or `null`). Persist
  the registered client id in `app_settings` (mirrors every other
  admin-configurable value in this project — see `appSettings.ts`). Only one
  registration at a time; registering a new id supersedes the previous one
  (§4.2 — no explicit "unregister" needed for this first version).
  - Accept: registering client A then client B leaves B as the sole
    registration (confirmed via `GET`); both routes 401 without a valid
    `x-admin-token`.

- **M1.2 — Jukebox-device online/offline tracking.** Reuse the existing
  `device-status` SSE pattern (`nowPlaying.ts`'s bridge-device offline
  detection, `DeviceSelector`'s offline notice) rather than inventing a new
  one: the registered Jukebox device's native client must periodically
  signal liveness (simplest: keep its SSE connection open and have the
  backend treat "connected to `/api/events`" as "online" for whichever
  client id matches the registration — no separate heartbeat endpoint
  needed if the SSE connection itself carries an identifying client id as a
  query param). Emits a `jukebox-device-status` SSE event on change
  (online/offline), consumed by M3.3.
  - Accept: connecting/disconnecting an SSE client carrying the registered
    client id flips a server-side online/offline flag and emits the event;
    unrelated SSE clients (regular guest tabs) don't affect it.

- **M1.3 — Volume command routing endpoint.** `POST /api/playback/volume`
  (existing route, `backend/src/routes/playback.ts`) changes behavior when a
  Jukebox device is currently registered **and online**: instead of calling
  Spotify's volume API, emit a new `jukebox-volume-command` SSE event
  (`{volumePercent}`) addressed to the registered client id, and return
  success immediately (fire-and-forget over SSE — §4.3 explicitly says no
  ack-based round trip is required for v1). When no Jukebox device is
  registered/online, existing behavior (Spotify's volume API, or the
  existing "can't control volume" message) is unchanged — this task must not
  regress the non-Jukebox-device deployment path at all.
  - Accept: with a Jukebox device registered+online, an SSE client
    subscribed with that client id receives `jukebox-volume-command` when
    `POST /api/playback/volume` is called, and Spotify's volume API is NOT
    called (verify via a spy on the injectable `fetchFn`, mirroring this
    file's existing test patterns). With no registration, existing
    `playback.test.ts` volume tests still pass unmodified.

- **M1.4 — Playback-controls-disabled-when-offline routing.** Extend
  `GET /api/trust-mode` (or add a field to it) so the frontend can tell "the
  Jukebox device is registered but currently offline" apart from "no Jukebox
  device at all" — per §4.4, this state should disable **all** playback
  controls (not just volume), the same as the existing bridge-device-offline
  behavior. Exact shape is this task's call; keep it consistent with the
  existing `TrustModeState`/`Device` types in `frontend/src/lib/api.ts`.
  - Accept: a new test confirms the resolved state distinguishes "no Jukebox
    device", "Jukebox device online", and "Jukebox device offline".

## Phase M2 — Native volume plugin

Spec ref: §4.1, §5.

- **M2.1 — Capacitor plugin: set system volume.** Add a small custom
  Capacitor plugin (`frontend/android/app/src/main/java/.../VolumeControlPlugin.kt`
  or a local Capacitor plugin package, agent's call on structure) exposing
  one method, e.g. `setSystemVolume(percent: number)`, backed by Android's
  `AudioManager.setStreamVolume(STREAM_MUSIC, ...)`. No UI of its own.
  - Accept: a manual test harness (a temporary debug button, removed before
    merge, or documented manual steps if no real device/emulator is
    available in this environment) demonstrates the plugin call changes the
    device's actual media volume. Flag clearly if this could only be
    code-reviewed and not run against a real/emulated Android device this
    session.

- **M2.2 — Wire the plugin into the SSE volume-command listener.** In the
  native (Capacitor) build only, subscribe to `jukebox-volume-command`
  (M1.3) via the existing `useEventStream` hook and call M2.1's plugin
  method on receipt. Must be a no-op / not attempted on the plain web build
  (feature-detect Capacitor's native-platform check, e.g.
  `Capacitor.isNativePlatform()`) — §4.1 zero-regression requirement.
  - Accept: on a native build, receiving the event changes system volume
    (or is confirmed code-correct if no device/emulator available, same
    caveat as M2.1); on a web build, the same code path does nothing and
    throws no errors.

## Phase M3 — Frontend: registration UI & guest-facing wiring

Spec ref: §4.2, §4.4.

- **M3.1 — Stable per-install client id.** Add a small helper (mirrors
  `frontend/src/lib/session.ts`'s guest-token pattern) that generates and
  persists a stable client id in `localStorage` on first load, reused by
  M1.2's SSE connection and M3.2's registration call. Not guest-identity —
  a separate concern from `SessionContext`.
  - Accept: reloading the app keeps the same client id; clearing storage
    generates a new one.

- **M3.2 — "This is the Jukebox device" Settings toggle.** New control in
  `SettingsPage`/`SettingsForm` (admin-gated, same PIN as everything else in
  that panel per §4.2/decision §6.1) that calls M1.1's register endpoint
  with M3.1's client id. On a plain browser tab (not
  `Capacitor.isNativePlatform()`), render this either hidden or as an
  explanatory disabled note per §4.2 — agent's call which, document the
  choice.
  - Accept: toggling it on a native build registers that install; the
    control's behavior on a non-native build matches whichever choice was
    documented.

- **M3.3 — Route `PlaybackControls`' volume UI through the new state.**
  `frontend/src/components/playback/PlaybackControls.tsx` currently disables
  the slider based solely on `device.supports_volume`
  ([PlaybackControls.tsx:205](../../../frontend/src/components/playback/PlaybackControls.tsx:205)).
  Extend `volumeAllowed` to also be true when a Jukebox device is registered
  and online (M1.4's state), independent of Spotify's `supports_volume`
  flag — since in that case volume goes through the native plugin, not
  Spotify. Per §4.4, the existing `VOLUME_UNSUPPORTED_COPY` message
  ([PlaybackControls.tsx:66-67](../../../frontend/src/components/playback/PlaybackControls.tsx:66))
  must only show when genuinely no path exists (no Jukebox device AND no
  Spotify `supports_volume`). If the Jukebox device is registered but
  offline, ALL controls (previous/pause-resume/skip/volume) disable per
  §4.4 — not just volume.
  - Accept: three scenarios manually verified (or DOM/computed-style
    verified if live SSE state can't be triggered in this environment,
    flagged explicitly per this project's standing browser-tooling caveat):
    no Jukebox device (today's behavior, unchanged); Jukebox device
    online (volume slider enabled even though the Spotify device itself
    reports `supports_volume: false`); Jukebox device offline (all controls
    disabled, distinct copy from the existing bridge-device-offline one if
    needed).

## Phase M4 — Build script & self-hoster docs

Spec ref: §4.5.

- **M4.1 — One-command build script.** Add e.g.
  `frontend/scripts/build-android.sh` (or an npm script,
  `npm run build:android` in `frontend/package.json`) that runs the full
  chain — web build, `cap sync android`, `gradlew assembleDebug` — and
  prints the resulting APK path. Treat "one command, repo to APK" as a hard
  target per §4.5.
  - Accept: running the single command from a clean checkout (with Android
    build prerequisites already installed per M0.2) produces an installable
    APK with no manual intermediate steps.

- **M4.2 — Self-hoster documentation.** Add
  `docs/MASTER_DEVICE_MODE.md` (linked from `README.md`'s existing
  "Deploying" section, without complicating that section's web-only
  instructions per §4.5) covering: what this feature is and why (the
  `supports_volume: false` limitation), how to build the APK (M4.1), how to
  sideload it (`adb install` or copying the APK to the phone), the expected
  "install from unknown sources" warning (explicitly documented as normal
  per §4.5, not a bug), and how to enable "Jukebox device" mode from
  Settings (M3.2) after install.
  - Accept: doc covers all of the above without touching the main README's
    web-deployment instructions beyond a single added link.

## Phase M5 — Verification & close-out

- **M5.1 — Cross-scenario regression pass.** Confirm the plain web
  deployment (Docker/HA Add-on) is fully unaffected: existing backend test
  suite passes unmodified where it shouldn't have changed, `docker compose
  up` (or equivalent) smoke-tested per `docs/DEPLOY.md`, guest volume
  control on a non-Jukebox-device deployment behaves exactly as before this
  proposal.
  - Accept: full backend `npm test` + `tsc -b` both sides clean; a fresh
    Docker smoke test shows no regression.

- **M5.2 — Real-hardware verification (needs the user).** Build and
  sideload the APK onto the actual bridge Pixel 7 Pro, register it as the
  Jukebox device, and confirm a guest's volume slider audibly changes
  speaker output through the existing Bluetooth pairing. This is the
  design spec's actual §7 success criterion and cannot be done without the
  user's real hardware — flag as a stopping point requiring the user, not
  something to attempt autonomously.
  - Accept: user confirms real audible volume change end-to-end.

- **M5.3 — Close out.** Update `BACKLOG.md` item 8 to `done` with a summary,
  add a root `PROGRESS.md` Post-Launch entry, merge
  `feature/master-device-mode` into `master` (only after explicit user
  go-ahead, per this project's standing merge policy).
