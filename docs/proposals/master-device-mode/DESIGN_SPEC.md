# Master Device Mode — Design Specification

Status: Reviewed — open questions resolved, ready for implementation planning
Branch: `feature/master-device-mode`
Related: [BACKLOG.md #8](../../../BACKLOG.md), root [DESIGN_SPEC.md](../../DESIGN_SPEC.md) §"Audio Bridge"

## 1. Problem

Guest Jukebox's audio bridge is a dedicated phone, signed into the
household's Spotify account, permanently connected as a Spotify Connect
device and paired to a Bluetooth speaker with no Spotify Connect
capability of its own. Volume is one of the guest-facing playback controls
this app offers (alongside pause/resume/skip), gated by trust mode like the
others — but Spotify's Web API reports `supports_volume: false` for phones
acting as a Connect receiver. This was confirmed live against the real
deployment: the bridge Pixel 7 Pro reports `supports_volume: false`, while
two desktop-class devices visible on the same Spotify account report
`supports_volume: true`. This is a platform-level restriction Spotify
applies to phone Connect receivers specifically — not a missing OAuth scope
or a bug in this app — so it can't be fixed by calling Spotify's API
differently.

Net effect: in the project's actual real-world deployment (custom jukebox
enclosure, phone bridge, Bluetooth speaker), guests cannot adjust volume
from the web app at all today, even when trust mode would otherwise allow
it. This is a significant gap against the project's second primary goal —
letting any guest scan a QR code and control playback (including volume)
from their own device.

## 2. Goals

1. **Real, working volume control** for guests when the bridge device is an
   Android phone, achieved by controlling the phone's own system volume
   directly (bypassing Spotify's volume API entirely) — the guest-facing UI
   should not need to know or care that this is happening; it should look
   and behave like the existing volume slider.
2. **A second, native build of this same app for Android**, produced from
   this one repository, that runs on the physical bridge device and has the
   one extra capability (setting system volume) that a browser page cannot
   have. This is a superset of the existing guest web app, not a fork of it
   — the guest experience, admin panel, etc. all stay identical.
3. **A "Jukebox device" designation**, set from the Settings panel, that
   marks whichever installed instance of the app is running on the physical
   bridge device. This is what tells the backend which connected client
   should receive volume commands.
4. **Zero regression to the existing web deployment.** Anyone self-hosting
   this on Docker or the Home Assistant Add-on, serving guests over plain
   browser tabs, must see no change in behavior, setup steps, or
   functionality. The native Android build is an additional way to run the
   app, not a replacement for the web one.
5. **A repeatable build process for the native app**, runnable from this
   same repo, that a self-hoster (this project is public on GitHub) could
   follow to produce their own bridge-device build without needing to
   understand Capacitor or Android tooling deeply.

## 3. Non-goals (for this proposal)

- **iOS volume control.** Apple does not expose a public API for an app to
  set system volume — the only known technique (a hidden `MPVolumeView`
  slider tap) is unreliable and not a real programmatic API. An iPhone can
  still run this app (as a guest client, or even as a bridge device for
  Spotify Connect purposes), it just won't get local volume control the way
  Android will. This may be revisited later if Apple's platform changes.
- **Replacing Spotify Connect volume for non-phone bridge devices.** Nothing
  changes for a bridge device that's a computer or a speaker with native
  Spotify Connect support (both already report `supports_volume: true` and
  already work correctly via Spotify's own API).
- **Any other native-only feature.** This proposal is scoped to volume
  control and the build/packaging work needed to make that possible. Other
  ideas for what a native build could eventually do (offline caching, home
  screen widget, etc.) are out of scope here.
- **App store distribution.** Producing an installable APK from the repo is
  in scope; publishing to the Google Play Store is not (revisit if this
  project's userbase grows enough to want it).

## 4. Requirements

### 4.1 Two build paths, one repo

- The existing web app build/deploy path (`frontend` → static assets served
  by `backend`, Docker image, HA Add-on) is unchanged and remains the
  primary, default way to run this project.
- A new, separate build path produces an installable Android app from the
  same `frontend` React codebase via Capacitor, adding only what's needed
  for native device access (a volume-control plugin, and whatever Capacitor
  itself requires — app icons, permissions, etc.). Both build paths should
  be runnable independently without one requiring the other to have been
  built first.

### 4.2 "This is the Jukebox device" setting

- A new option in the Settings panel — visible on every client, but only
  meaningful/actionable on a client that actually has the native capability
  (i.e., the Android app build). On a plain browser tab, this should either
  be hidden or clearly explain that it only works from the native app.
- Marking a device this way registers it with the backend as the current
  volume-control target. Only one device should hold this designation at a
  time — enabling it on a new device should supersede any previous one.
- This designation should survive app restarts on that device (persisted
  locally and/or server-side) — the admin shouldn't need to re-enable it
  every time the phone restarts.
- Gated by the same admin PIN as every other Settings action (no separate
  auth mechanism) — reaching this toggle already requires being in the
  admin-authenticated Settings panel, so no additional protection is needed.

### 4.3 Volume command delivery

- When a guest (or admin) adjusts the volume slider, the backend routes that
  command to whichever device is currently marked as the Jukebox device. It
  does **not** additionally attempt Spotify's volume API as a fallback — for
  a phone bridge device that call would just fail anyway (§1), and a silent
  double-attempt would only add confusing failure modes.
- The app already has a one-way server → client push channel (Server-Sent
  Events, used today for now-playing/queue/leaderboard updates) — the
  expectation is this gets reused for volume commands rather than
  introducing a new transport, but this is a decision for the implementation
  plan, not fixed here.
- Volume changes made directly on the phone (hardware buttons, or someone
  physically adjusting it) don't need to be reflected back into the app's
  slider in this first version — one-way (app → phone) control is
  sufficient to meet the goal.

### 4.4 Guest experience

- No visible difference to a guest using their own phone/laptop to control
  volume — same slider, same trust-mode gating, same disabled/enabled
  states. The fact that volume is being set via a native bridge-device
  plugin instead of Spotify's API is an implementation detail.
- The existing "this device's volume can't be controlled remotely" message
  should only appear when there's genuinely no way to control volume (no
  Jukebox device registered, and the resolved Spotify device itself doesn't
  support volume) — not as a permanent fixture once this feature ships.
- **If the registered Jukebox device is offline or unreachable** (app closed,
  phone dead, network drop), **all** guest playback controls — not just
  volume — should show as disabled, the same way the app already handles a
  bridge device going offline elsewhere (see the existing `device-status`
  SSE event and `DeviceSelector`'s offline notice). There is no fallback
  attempt to control playback through Spotify's API in this state; if the
  physical device driving playback is unreachable, none of pause/resume/
  skip/volume can meaningfully do anything regardless of which API is
  called, so surfacing one clear "unavailable" state is more honest than
  leaving some controls enabled and failing individually.

### 4.5 Self-hoster experience

- Someone forking/cloning this repo for their own jukebox build should be
  able to find clear documentation for producing their own native Android
  build, without the main README's "Running locally" / deployment
  instructions becoming more complicated for people who only want the web
  app.
- Distribution is a **build script + documentation**, not a maintained
  downloadable APK per release. Ideally a single command takes the repo as
  it stands and produces an installable APK — the implementation plan
  should treat "one command to build" as a hard target, not a stretch goal.
- The resulting APK is self-signed (there's no Play Store / official signing
  identity for a self-built sideloaded app), and Android will show its
  standard "install from unknown sources" warning on first install
  regardless of signing — this is normal, expected behavior for any
  sideloaded app, not something the build process can or should try to
  suppress. Docs should say this plainly so it doesn't read as broken.

## 5. Constraints & assumptions

- The bridge device for this project's own deployment is a Pixel 7 Pro
  (Android). The design should not assume a specific phone model, but does
  not need to support anything other than Android for the native-app path.
- The Bluetooth speaker in the real deployment has no Spotify Connect
  capability of its own — volume must go through the phone's own audio
  stack (whatever a Capacitor plugin backed by Android's `AudioManager`
  can reach), not through a smart speaker's own API.
- The backend, database, and all existing REST/SSE endpoints are assumed to
  stay as-is architecturally — this is additive (new endpoint(s)/event
  type(s) for volume routing and device registration), not a rewrite.
- No app-store review process is assumed to gate shipping this — sideloading
  or a self-managed distribution method is acceptable for now.

## 6. Decisions (resolved during review)

1. **Jukebox device registration auth:** uses the same admin PIN as every
   other Settings action — no separate mechanism. See §4.2.
2. **Jukebox device offline behavior:** all guest playback controls (not
   just volume) show disabled, reusing the app's existing device-offline
   detection. No fallback attempt through Spotify's API. See §4.4.
3. **Tasker vs. Capacitor:** settled on **Capacitor**. Tasker would be
   faster to prototype but is manual, phone-side configuration that can't
   be captured in a build script or reproduced by a self-hoster running a
   command — it directly conflicts with decision #4 below, which requires a
   scriptable, buildable artifact. Capacitor is the only option that
   satisfies that requirement.
4. **Distribution:** a build script + documentation, targeting a single
   command to go from repo to installable APK. Not a maintained per-release
   downloadable APK. See §4.5 for the signing/install-warning caveat to
   document alongside it.

No open questions remain blocking the implementation plan.

## 7. Success criteria

- A guest on their own phone can move the volume slider in the web app, and
  the actual audio output (through the Bluetooth speaker, driven by the
  bridge Android phone) audibly changes within a comparable delay to
  today's other playback controls.
- The existing Docker/HA Add-on web deployment continues to work exactly as
  it does today, verified by re-running the existing manual smoke test in
  [docs/DEPLOY.md](../../DEPLOY.md).
- A documented process exists for building the native Android app from this
  repo, usable by someone other than the original author.
