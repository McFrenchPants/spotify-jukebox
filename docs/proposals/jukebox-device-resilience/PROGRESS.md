# Progress: Jukebox device resilience (BACKLOG.md items 30 & 31)

See [DESIGN_SPEC.md](DESIGN_SPEC.md) / [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| JR1.1 | Native: screen-pinning query + enable methods | done | Unverified beyond code review (no Android SDK) |
| JR2.1 | Frontend: live jukebox-device online/offline status | done | Live-verified end-to-end against real dev backend. `JukeboxDeviceCard.tsx` deliberately left untouched — see session log |
| JR1.2 | Frontend: pinning status UI on Connect page | done | Verified live in Browser pane via a temporary, fully-reverted plugin mock |
| JR3.1 | Frontend: Master Device controls its own volume directly | in-progress | |

## Session Log

Newest entry on top.

### 2026-09-03 — Batch 1 done (JR1.1, JR1.2, JR2.1)
All three delegated to `general-purpose` subagents, each diff independently
reviewed and confined to its intended files before committing.
- **JR1.1** (native `AppPinning` plugin): matches `VolumeControlPlugin.java`'s
  style exactly, `MainActivity.java` registration is a clean one-line add.
  Unverified beyond code review — no Android SDK in this dev environment,
  same known gap as prior Master Device Mode native work (items 8, 19).
- **JR1.2** (Connect page pinning UI): new `appPinningPlugin.ts` mirrors
  `volumeControlPlugin.ts`'s shape; `ConnectPage.tsx` gained a
  native-only `PinningStatusCard`. Verified live in the Browser pane via a
  temporary URL-param-driven plugin mock, confirmed fully reverted via
  `git diff` before the final report. Also found and killed an unrelated
  stray local backend (PID 21692, port 8085) left over from an earlier
  session — another recurrence of the BACKLOG.md item 20/22 class of issue,
  caught and cleaned up via `scripts/check-stray-backend.mjs --kill` as part
  of this task's own cleanup, confirmed clear afterward.
- **JR2.1** (live online/offline status): `useEventStream.ts` gained
  `'jukebox-device-status'` in `NAMED_EVENTS`; `PlaybackControls.tsx` now
  prefers a live override over the one-time trust-mode snapshot. **Live-
  verified end-to-end against the real dev backend** — opened a genuine SSE
  connection as the registered device via `curl`, confirmed the backend's
  real `jukebox-device-status` event flipped the already-loaded page's UI
  (offline message disappeared, slider re-enabled) with zero reload.
  **Real scope finding**: `JukeboxDeviceCard.tsx` (the admin panel's device
  card) has no online/offline concept at all today — only registration
  status ("registered"/"not registered"). The design spec's R4 assumed it
  had an existing online-status field to override; it doesn't. The subagent
  correctly stopped rather than inventing new admin UI on its own judgment.
  Decision: leave this out of scope for items 30/31 — the two backlog
  items' actual asks (guest-facing correctness, the Master Device's own
  self-view) are both satisfied by the `PlaybackControls.tsx` change alone.
  Adding a live online/offline badge to the admin device card is a
  reasonable small follow-up but is a new feature decision, not a wiring
  fix — worth a future BACKLOG.md item if it's ever actually wanted, not
  invented here without being asked for.
- Next: JR3.1 (Master Device controls its own volume directly), the last
  task, sequenced after JR2.1 since both touch `PlaybackControls.tsx`.

### 2026-09-03 — Scaffolded
`/continue-development` — user picked items 30+31 together (both touch
`PlaybackControls.tsx` and the same "master device online status" gap).
Investigated code directly before scoping: confirmed no `WAKE_LOCK`/foreground
service in `AndroidManifest.xml`, no resume-triggered reconnect in
`useEventStream.ts`, and — a real bug found along the way — the backend's
`jukebox-device-status` SSE event was never actually in the frontend's
`NAMED_EVENTS` allowlist (only a stale comment referenced it), so no client
ever received it live. Checked in with the user on two scope questions:
(1) item 30 — pinned-foreground confirmed as the accepted deployment mode
(no foreground-service/wake-lock work), but the app should help the operator
pin it (native pinning-state query + enable button) and make every client
recognize online/offline live rather than only via the SSE-allowlist bug fix
above; (2) item 31 — user chose the deeper fix (Master Device controls its
own volume directly via the existing native plugin, not a self-addressed
backend round trip). Wrote and got sign-off on DESIGN_SPEC.md, then this
IMPLEMENTATION_PLAN.md (flat 4-task list, 2 batches). Branched
`feature/jukebox-device-resilience` off `master`. Next: delegate JR1.1 +
JR2.1 in parallel (batch 1).
