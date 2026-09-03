# Progress: Jukebox device resilience (BACKLOG.md items 30 & 31)

See [DESIGN_SPEC.md](DESIGN_SPEC.md) / [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| JR1.1 | Native: screen-pinning query + enable methods | todo | |
| JR2.1 | Frontend: live jukebox-device online/offline status | todo | |
| JR1.2 | Frontend: pinning status UI on Connect page | todo | depends on JR1.1 |
| JR3.1 | Frontend: Master Device controls its own volume directly | todo | depends on JR2.1 |

## Session Log

Newest entry on top.

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
