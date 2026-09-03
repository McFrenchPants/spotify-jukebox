# Design spec: Jukebox device resilience (BACKLOG.md items 30 & 31)

**Status:** draft, pending review
**Branch:** `feature/jukebox-device-resilience`

## Problem

Two related reports from real Master Device Mode use (2026-09-02), both
centered on the same client component (`PlaybackControls.tsx`) and the same
underlying gap:

1. **Item 30** — the Master Device phone's SSE connection (which the backend
   uses to detect whether the Jukebox device is "online") doesn't reliably
   survive Android backgrounding. A freshly-installed build didn't come back
   online until explicitly foregrounded via `adb shell am start`.
2. **Item 31** — the Master Device's own screen shows "The Jukebox device is
   offline — volume control is paused until it reconnects," a nonsensical
   message about itself, because `PlaybackControls.tsx` never checks whether
   *this* client is the registered device.

User check-in (2026-09-03) narrowed scope on both:
- The phone is expected to run **pinned in the foreground** as its normal
  operating mode — this is accepted, not something to route around with
  heavier native work (a foreground service + wake lock to survive true
  backgrounding is explicitly out of scope for now). But the phone won't be
  powered on 24/7, so it will legitimately go offline sometimes, and the
  rest of the app needs to handle that gracefully — including recognizing
  when it comes back.
- For item 31, go with the deeper fix: the Master Device should control its
  own volume directly via the existing native plugin rather than
  round-tripping a command to itself through the backend.

## Investigation findings

- [AndroidManifest.xml](../../../frontend/android/app/src/main/AndroidManifest.xml)
  declares no `WAKE_LOCK` permission and no foreground service — confirms
  there's no attempt today to keep the process alive in the background.
  Deliberately not changing this (see Non-goals).
- [useEventStream.ts](../../../frontend/src/hooks/useEventStream.ts) connects
  a single `EventSource` once on mount and relies entirely on the browser's
  own reconnect behavior — no resume/visibility-triggered reconnect logic.
- **A real, separate bug found while tracing this**: the backend already
  emits a `jukebox-device-status` SSE event whenever the registered device's
  connection count flips
  ([jukeboxDeviceOnline.ts](../../../backend/src/events/jukeboxDeviceOnline.ts)),
  but the frontend's `NAMED_EVENTS` allowlist in
  [useEventStream.ts](../../../frontend/src/hooks/useEventStream.ts:11) never
  included it — only a stale comment references the event name, the actual
  array doesn't. So no client (guest, admin, or the Master Device itself)
  ever receives this event; `PlaybackControls.tsx` and
  `JukeboxDeviceCard.tsx` both only read the device's online/offline state
  from a one-time `GET /api/trust-mode` fetch on mount. This is the same gap
  BACKLOG.md item 18's research already flagged. This explains why "coming
  back online" isn't recognized without a manual refresh today — independent
  of whatever causes the disconnect itself.
- [VolumeControlPlugin.java](../../../frontend/android/app/src/main/java/com/mcfrench/guestjukebox/VolumeControlPlugin.java)
  already has `setVolume`/`getVolume` methods operating directly on
  `AudioManager` — usable directly by the Master Device itself, no new
  native volume logic needed.
- Android's screen-pinning (lock task) state is queryable via
  `ActivityManager.getLockTaskModeState()` (API 23+) and can be started
  programmatically via `Activity.startLockTask()` — both available at this
  project's `minSdkVersion` of 24 with no extra permission. A non-device-owner
  app calling `startLockTask()` pins immediately (a brief system toast
  appears explaining how to unpin); no confirmation dialog blocks it.

## Goals

1. The Master Device never shows a message implying it is disconnected from
   itself.
2. The Master Device controls its own system volume directly (no
   self-addressed network round trip).
3. Every client that cares about the Jukebox device's online/offline status
   (guest volume controls, the admin device card, the Master Device's own
   pinning UI) learns about a change live, via SSE, not only on next page
   load.
4. The person setting up the Master Device can see whether screen pinning is
   currently active, and turn it on from within the app, without hunting
   through Android Settings.

## Non-goals

- Surviving true backgrounding (screen off, app not pinned, Doze/App Standby
  in effect) via a foreground service + wake lock. Explicitly deferred —
  pinned-foreground is the accepted operating mode for now. If real use shows
  pinning alone is insufficient, that's a future item.
- Auto-restarting or auto-relaunching the app if it's ever killed outright.
- Changing pause/resume/skip routing — those already go through Spotify's
  Web API directly and are unaffected by the Jukebox device's online state.

## Requirements

- **R1 (native).** A way to query the current screen-pinning (lock task)
  state from JS.
- **R2 (native).** A way to programmatically start screen pinning from JS.
- **R3 (frontend, Master-Device-only UI).** `ConnectPage.tsx` (already
  gated to the registered device only) shows current pinning status and an
  "Enable pinning" button when it's off.
- **R4 (frontend, live status).** Add `jukebox-device-status` to
  `useEventStream.ts`'s `NAMED_EVENTS` allowlist. `PlaybackControls.tsx` and
  `JukeboxDeviceCard.tsx` subscribe to it and update their local
  online/offline view live, instead of only reading the one-time
  `GET /api/trust-mode` snapshot.
- **R5 (frontend, self-control).** When running natively as the registered
  Jukebox device, `PlaybackControls.tsx`'s volume slider calls
  `VolumeControl.setVolume()` directly and then reports the new value via
  the existing `reportJukeboxVolume()` call (already used by the periodic
  self-report loop in `RootLayout.tsx`) — this is what keeps every *other*
  connected guest's slider in sync, via the existing
  `jukebox-volume-status` broadcast. It does not call the guest-facing
  `POST /api/volume` endpoint at all.
- **R6 (frontend, self-status).** On the Master Device itself, volume
  control is gated only by the trust-mode `volume` permission — never by
  `jukeboxOnline`/`jukeboxOffline`, since those describe *other* clients'
  view of this device, not its own. The "Jukebox device is offline" message
  never renders on the Master Device's own screen.

## Verification constraints

Native Java changes (R1, R2) cannot be build- or run-verified in this dev
environment (no Android SDK) — same known gap as prior Master Device Mode
work (items 8, 19). Verify by close inspection against the existing
`VolumeControlPlugin.java`'s style/API usage, and flag a real on-device test
as a follow-up, same as before. R3–R6 (frontend-only) are verifiable via the
Browser pane in the usual way, simulating both branches
(`useIsJukeboxDevice()` true/false) since a real device isn't available in
this dev environment either.
