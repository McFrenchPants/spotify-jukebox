# Proposals

Convention for anything in [BACKLOG.md](../../BACKLOG.md) that needs real
investigation or design work before implementation — mirrors the process
the original MVP used (root [DESIGN_SPEC.md](../DESIGN_SPEC.md) →
[IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) →
[PROGRESS.md](../../PROGRESS.md)), scoped down to one feature instead of
the whole app.

Everything generated over one change's lifetime lives in a single
`docs/proposals/<slug>/` folder — analysis, design spec, implementation
plan, and its own progress log — so there's one place to look for an
in-progress change, not several scattered top-level files. That folder is
temporary: once the change ships, its history gets condensed into one
entry and deleted (see "Ship" below).

## Process

1. **Branch.** Create `feature/<slug>` off `develop` (see
   [CLAUDE.md](../../CLAUDE.md)'s "Branch strategy" section). All of a
   proposal's docs and code live on this branch until it ships, so neither
   `develop` nor `master` carries half-finished designs or in-progress
   features.
2. **Analysis.** The moment a backlog item gets its first real
   investigation, create `docs/proposals/<slug>/ANALYSIS.md` — what
   problem it's actually solving, what's been learned so far, open
   questions, and (once known) acceptance criteria. This is the step
   *before* a design doc — where ambiguity gets surfaced and questioned,
   not resolved by assumption. See `BACKLOG.md`'s "Analysis files" section
   for the scrutiny/check-in expectations. Skip this step for small,
   well-scoped work (a clear bug fix, a trivial change) — go straight to
   implementation.
3. **Design spec** (significant work only). Add
   `docs/proposals/<slug>/DESIGN_SPEC.md` — goals, non-goals, requirements,
   constraints, open questions. Deliberately low-tech: this is the document
   a human reviews and signs off on before any implementation planning
   starts. No file/class/API-level detail here.
4. **Review.** Human review of the design spec — revise until agreed.
5. **Implementation plan.** Add `docs/proposals/<slug>/IMPLEMENTATION_PLAN.md`
   once the design is settled — phased, scoped tasks, mirroring the root
   `IMPLEMENTATION_PLAN.md`'s `P<n>.<n>` style, sized for a supervisor agent to
   hand individual tasks to narrowly-scoped subagents.
6. **Progress tracking.** Add `docs/proposals/<slug>/PROGRESS.md` once
   implementation starts — the supervisor agent's source of truth for task
   status, same role the root `PROGRESS.md` plays for the whole project.
7. **Ship.** Merge `feature/<slug>` into `develop` once done — routine, the
   supervisor does this automatically once local tests are green, no
   separate go-ahead needed. Then close the loop on the documentation
   itself: condense the whole folder's history into one entry in
   [docs/proposals/ARCHIVE.md](ARCHIVE.md) — the problem, the approach
   taken, and the branch/release it shipped on, not implementation
   detail — remove the item from `BACKLOG.md` entirely, and delete the
   `docs/proposals/<slug>/` folder (git history keeps every draft if it's
   ever actually needed). Promoting `develop` to `master` (production) is
   a separate, later, explicitly-approved step — not part of an individual
   proposal shipping.

If a proposal's folder produces something durable beyond the change itself
— a build/setup guide someone will need again later, not just a record of
what happened — move that file to a permanent home under `docs/` (e.g.
`docs/ANDROID_BUILD.md`) before deleting the rest of the folder, rather
than losing it to the same condense-and-delete step.

## Active proposals

See `docs/proposals/*/` for anything currently in progress (none as of
2026-09-03). Shipped work's history lives in
[ARCHIVE.md](ARCHIVE.md).
