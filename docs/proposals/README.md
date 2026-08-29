# Proposals

Convention for anything in [BACKLOG.md](../../BACKLOG.md) big enough to need real
design work before implementation — mirrors the process the original MVP used
(root [DESIGN_SPEC.md](../DESIGN_SPEC.md) → [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)
→ [PROGRESS.md](../../PROGRESS.md)), scoped down to one feature instead of the whole app.

## Process

1. **Branch.** Create `feature/<slug>` off `master`. All of a proposal's docs and
   code live on this branch until it ships, so `master` never carries
   half-finished designs or in-progress features.
2. **Design spec.** Add `docs/proposals/<slug>/DESIGN_SPEC.md` — goals,
   non-goals, requirements, constraints, open questions. Deliberately
   low-tech: this is the document a human reviews and signs off on before any
   implementation planning starts. No file/class/API-level detail here.
3. **Review.** Human review of the design spec — revise until agreed.
4. **Implementation plan.** Add `docs/proposals/<slug>/IMPLEMENTATION_PLAN.md`
   once the design is settled — phased, scoped tasks, mirroring the root
   `IMPLEMENTATION_PLAN.md`'s `P<n>.<n>` style, sized for a supervisor agent to
   hand individual tasks to narrowly-scoped subagents.
5. **Progress tracking.** Add `docs/proposals/<slug>/PROGRESS.md` once
   implementation starts — the supervisor agent's source of truth for task
   status, same role the root `PROGRESS.md` plays for the whole project.
6. **Ship.** Merge `feature/<slug>` into `master` once done. Update the
   backlog entry to `done` (or delete it) and update the root `PROGRESS.md`
   if the change is significant enough to belong there.

## Active / past proposals

- [master-device-mode](master-device-mode/DESIGN_SPEC.md) — Android native
  build (via Capacitor) for the bridge device, with local system-volume
  control to work around Spotify's `supports_volume: false` limitation for
  phone Connect receivers.
