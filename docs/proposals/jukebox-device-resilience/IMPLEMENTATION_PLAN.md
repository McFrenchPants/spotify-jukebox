# Implementation plan: Jukebox device resilience (BACKLOG.md items 30 & 31)

See [DESIGN_SPEC.md](DESIGN_SPEC.md) for full context/requirements.

Flat task list, two batches. Batch 2 tasks depend on their batch-1
counterpart because both pairs touch a shared file
(`ConnectPage.tsx`↔native interface; `PlaybackControls.tsx`↔online-status
wiring) — sequencing avoids concurrent edits to the same file, not a real
functional dependency beyond that.

Verification tier: none of these tasks reach a live HA host or physical
Android device (they're implementer-authored source code, not a live-system
operation) and none touch auth/persistence/deploy/Spotify-credential code —
default orchestrator spot-check path, no `verifier` agent routing needed.
Native Java changes can't be build/run-verified in this dev environment (no
Android SDK) — flag, don't block, same as prior Master Device Mode work.

## Batch 1 (parallel)

### JR1.1 — Native: screen-pinning query + enable methods
**Files:** new `frontend/android/app/src/main/java/com/mcfrench/guestjukebox/AppPinningPlugin.java`; `frontend/android/app/src/main/java/com/mcfrench/guestjukebox/MainActivity.java` (register the new plugin)

Add a new Capacitor plugin `AppPinning` (separate from `VolumeControl` —
different concern) with two methods:
- `isPinned()` → `{ pinned: boolean }`, using
  `ActivityManager.getLockTaskModeState()` (API 23+; project's minSdk is 24,
  no manifest/permission change needed) — `pinned` is true when the state is
  not `LOCK_TASK_MODE_NONE`.
- `enablePinning()` → resolves once `getActivity().startLockTask()` has been
  called; reject only if `getActivity()` is null. No permission or
  device-owner setup needed for a non-device-owner app to call
  `startLockTask()` — it pins immediately (Android shows a brief "how to
  unpin" toast on first use, not a blocking confirmation dialog).

Register `AppPinningPlugin.class` in `MainActivity.onCreate`, mirroring the
existing `registerPlugin(VolumeControlPlugin.class)` line.

**Acceptance criteria:**
- `AppPinningPlugin.java` compiles against the same Capacitor Plugin API
  `VolumeControlPlugin.java` already uses (same imports/annotations style).
- `isPinned()` returns `{ pinned: boolean }`; `enablePinning()` resolves
  with no payload needed (or an empty object) once `startLockTask()` is
  called.
- `MainActivity.java` registers the new plugin.

## JR2.1 — Frontend: live jukebox-device online/offline status
**Files:** `frontend/src/hooks/useEventStream.ts`, `frontend/src/components/playback/PlaybackControls.tsx`, `frontend/src/components/admin/JukeboxDeviceCard.tsx`

- Add `'jukebox-device-status'` to `useEventStream.ts`'s `NAMED_EVENTS`
  array (the backend already emits this event — see
  `backend/src/events/jukeboxDeviceOnline.ts` — this is purely a frontend
  allowlist fix, no backend change).
- `PlaybackControls.tsx`: subscribe to `'jukebox-device-status'` (the
  `subscribe` prop is already threaded in) and update the local
  online/offline view live — the event payload is `{ online: boolean }`.
  The simplest correct approach: keep a local `jukeboxOnlineOverride: boolean
  | null` state (`null` = no live update received yet, defer to the
  trust-mode snapshot), set it from the event, and have the existing
  `jukeboxOnline`/`jukeboxOffline` derivations prefer this override when
  non-null over `permissions?.jukeboxDevice?.online`. Don't change how
  `permissions` itself is fetched/typed.
- `JukeboxDeviceCard.tsx`: same idea — read this admin-panel card's current
  online-status source (whatever `GET /api/trust-mode`-derived data it
  reads today) and add a live subscription the same way, so an admin sees
  the flip without reloading Settings.

**Acceptance criteria:**
- `'jukebox-device-status'` is in `NAMED_EVENTS`.
- Simulate (via the Browser pane, a mocked/forced SSE dispatch, or direct
  state manipulation in dev) an online→offline→online sequence and confirm
  both `PlaybackControls`'s messaging and `JukeboxDeviceCard`'s displayed
  status update without a page reload.
- No change to `permissions` fetch behavior or the trust-mode API shape.

## Batch 2 (parallel, after their batch-1 counterpart)

## JR1.2 — Frontend: pinning status UI on Connect page
**Files:** new `frontend/src/lib/appPinningPlugin.ts`; `frontend/src/pages/ConnectPage.tsx`
**Depends on:** JR1.1 (native method names/shapes)

- New `frontend/src/lib/appPinningPlugin.ts`, mirroring
  `frontend/src/lib/volumeControlPlugin.ts`'s exact shape: a
  `registerPlugin<AppPinningPlugin>('AppPinning')` export with `isPinned()`/
  `enablePinning()` typed per JR1.1.
- `ConnectPage.tsx` (already gated to the registered Jukebox device only —
  see its own doc comment): when `Capacitor.isNativePlatform()`, show a
  small status line ("Screen pinning: On" / "Screen pinning: Off") sourced
  from `AppPinning.isPinned()` on mount, plus an "Enable pinning" button
  when off that calls `AppPinning.enablePinning()` and re-checks status
  afterward. On a plain web build (not native), render nothing for this
  section — pinning is meaningless outside the native app.

**Acceptance criteria:**
- `appPinningPlugin.ts` matches `volumeControlPlugin.ts`'s existing pattern
  exactly (registerPlugin call shape, file layout).
- `ConnectPage.tsx` shows nothing pinning-related on a non-native build.
- On native, an "Enable pinning" button appears only when
  `isPinned()` currently reports `false`.

## JR3.1 — Frontend: Master Device controls its own volume directly
**Files:** `frontend/src/components/playback/PlaybackControls.tsx`
**Depends on:** JR2.1 (same file — avoid concurrent edits; also needs the
override state JR2.1 introduces to correctly suppress the offline message)

- Import `useIsJukeboxDevice` and `Capacitor`. Compute
  `isMasterDevice = Capacitor.isNativePlatform() && useIsJukeboxDevice()`.
- `handleVolumeChange`: when `isMasterDevice`, call
  `VolumeControl.setVolume({ percent: next })` directly, then
  `reportJukeboxVolume(getOrCreateClientId(), next)` (both already imported
  elsewhere in this codebase — `VolumeControl` from
  `lib/volumeControlPlugin.ts`, `reportJukeboxVolume`/`getOrCreateClientId`
  the same way `RootLayout.tsx` already uses them) — instead of calling the
  guest-facing `setVolume(next)` API function. Keep the existing debounce
  wrapper around this call, matching the guest path's timing.
- `volumeAllowed`: when `isMasterDevice`, it's `permissions?.volume ?? false`
  only — not gated by `deviceSupportsVolume`/`jukeboxOnline`/`jukeboxOffline`
  at all, since those describe *other* clients' view of this device's
  connection, which is irrelevant to controlling its own hardware directly.
- The `jukeboxOffline` branch of the disabled-volume message must never
  render when `isMasterDevice` is true (covered by the `volumeAllowed`
  change above, but double check the JSX condition directly rather than
  relying on it implicitly).

**Acceptance criteria:**
- On a simulated `isMasterDevice = true` state, changing the volume slider
  calls `VolumeControl.setVolume` (verify via a mock/spy, since no real
  native bridge exists in this dev environment) rather than the guest
  `setVolume` API function, and does not show the offline message
  regardless of `jukeboxDevice.online`'s value.
- On a simulated `isMasterDevice = false` (ordinary guest) state, behavior
  is byte-identical to before this task — same API call, same messaging
  logic.
