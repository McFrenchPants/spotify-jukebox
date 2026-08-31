# sdlc-supervisor Testbed — Progress Tracker

**Read this file first in any new session working on this proposal.**
Source of truth for what's done, what's next, and any context needed to
resume. Task scopes/acceptance criteria live in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); decisions are frozen in
[design-spec.md](design-spec.md) (v2, revised after external review
[review-2026-08-31.md](review-2026-08-31.md); approved by the user
2026-08-31).

All work happens on `feature/sdlc-supervisor` — confirm you're on that
branch before making any changes. This proposal builds project-local
`.claude/` machinery only; packaging as a portable plugin is a separate,
later proposal (see IMPLEMENTATION_PLAN.md's "out of scope" section).

## Status: Design approved. SS3.1's core mechanism feasibility-spiked and confirmed live. Implementation not yet started (SS0.1 is next).

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| SS0.1 | `.sdlc/state.json` + `project.yaml` schema | todo | |
| SS0.2 | State-transition validator | todo | depends on SS0.1 |
| SS0.3 | Task-packet + completion-report templates/generator | todo | depends on SS0.1 |
| SS1.1 | `implementer` agent | todo | depends on SS0.3 |
| SS1.2 | `verifier` agent | todo | depends on SS0.3 |
| SS1.3 | Reframe `supervisor.md` as release operator | todo | depends on SS1.1 |
| SS2.1 | Approval-record format | todo | depends on SS1.3 |
| SS2.2 | Update `CLAUDE.md` override language | todo | depends on SS2.1 |
| SS3.1 | `PreToolUse` path-enforcement hook | todo | depends on SS1.1, SS0.3. Core mechanism confirmed live via spike 2026-08-31 (see design-spec §8a) — denial, path-matching, and toggle all work; two real gaps found (Bash bypasses an Edit\|Write matcher; a path hook can self-lock) and folded into the acceptance criteria |
| SS4.1 | Orchestrator full-context-once rewrite | todo | depends on SS0.1 |
| SS4.2 | Delegate rewrite (task packets, implementer agent) | todo | depends on SS1.1, SS0.3 |
| SS4.3 | Verify rewrite (verifier routing) | todo | depends on SS1.2 |
| SS4.4 | Run-budget stopping conditions | todo | depends on SS0.1 |
| SS5.1 | `sdlc-doctor` command | todo | depends on SS0.1, SS0.2 |
| SS6.1 | Dogfood: run one real backlog item through the loop | todo | depends on all of SS0-SS5 |
| SS6.2 | Write up dogfood findings | todo | depends on SS6.1 |

## Open Questions / Blockers

- Whether Claude Code's current agent-definition frontmatter actually
  supports `isolation: worktree` (flagged as a risk in SS1.1) — confirm
  during implementation rather than assuming the reviewer's sketch is
  literally installable as written.
- Whether this Claude Code version's hook configuration actually supports
  denying a tool call pre-execution the way SS3.1 needs — same caution.
  If either capability doesn't exist as documented, that's real signal for
  the design spec, not something to route around silently.

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-08-31** — Spiked SS3.1's `PreToolUse` path-enforcement mechanism
  before committing further design to it, per the user's request to verify
  feasibility and a toggle mechanism. Confirmed live: denial pre-execution,
  path-based matching, runtime toggle. Found two real gaps in the process
  (Bash bypasses an `Edit|Write` matcher; the hook self-locked its own
  author's attempt to disable it via `Edit`) and folded both into
  design-spec §8a and SS3.1's acceptance criteria — the verifier role
  (SS4.3) is now explicitly the backstop for the Bash gap, and the kill
  switch design routes through `.sdlc/project.yaml` read by `Bash`/the
  hook script, never through `Edit`/`Write` itself. Spike script kept at
  `.claude/hooks/sdlc-path-check.mjs` as a reference starting point
  (clearly marked proof-of-concept, hardcoded allowlist, not the real
  per-task-packet implementation); the local hook wiring used to test it
  was reverted (`.claude/settings.local.json` is gitignored, never
  committed).
- **2026-08-31** — Design spec v2 written (incorporating external review
  feedback), reviewed and approved by the user. Implementation plan and
  this tracker written. Branched `feature/sdlc-supervisor` off `master`.
  Nothing implemented yet — next session starts at SS0.1.
