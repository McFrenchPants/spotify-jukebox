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

## Status: Phase SS0 done. SS1.1/SS1.2 done, SS1.3 next (agent roles nearly complete).

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| SS0.1 | `.sdlc/state.json` + `project.yaml` schema | done | Schemas at `docs/sdlc/schemas/{state,project}.schema.json`; example `.sdlc/state.json`/`project.yaml` for this repo's real in-flight state, validated against both (`jsonschema`, re-verified independently). Introduced a deliberate `status`/`lifecycle_state` split per task (coarse todo/in-progress/blocked/done vs. the full evidence-gated `draft→…→released` enum, null until a task packet exists) — SS0.2 needs to decide which field(s) its transition validator actually checks. |
| SS0.2 | State-transition validator | done | `scripts/sdlc/validate-state.mjs` (library API + CLI + `--self-test`, no external test dep). Evidence-gates both `ready_to_release` and `released` (not just `released`); allows same-state no-ops; documents the `<task-id>-*` evidence-file naming convention SS0.3's generator must follow. |
| SS0.3 | Task-packet + completion-report templates/generator | done | Schemas at `docs/sdlc/schemas/{task-packet,completion-report}.schema.json`; generator at `scripts/sdlc/generate-task-packet.mjs` (regex/proximity heuristic for `read_paths`/`write_paths`, honestly documented limits, falls back to `"NEEDS_MANUAL_REVIEW"`). Tested against a synthetic example (no real proposal had a `todo` task) at `.sdlc/task-packets/SS-EX.1.packet.json`, re-validated independently. |
| SS1.1 | `implementer` agent | done | `.claude/agents/implementer.md`. Real spawn test (`subagent_type: implementer`) confirmed `isolation: worktree` genuinely works — it ran inside an isolated git worktree end to end. First real report included an extra `summary` field the schema forbids (`additionalProperties: false`) — fixed by tightening the instructions to name the exact allowed field set; re-tested and confirmed schema-valid on the second run. No recognized frontmatter key exists for a turn limit in this Claude Code version — expressed as a body-text instruction instead. |
| SS1.2 | `verifier` agent | done | `.claude/agents/verifier.md`. Real spawn test (`subagent_type: verifier`) against a deliberately bad diff correctly caught a forbidden-path violation (and a sneaky regression hidden in it) with an overall `fail`; a clean diff correctly returned `pass` with honest `uncertain` calls where the diff-only view couldn't fully confirm something. |
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

- **2026-08-31** — `/continue-development`: implemented SS1.1 (`implementer`
  agent) and SS1.2 (`verifier` agent), each via a scoped subagent, both now
  **actually spawn-tested for real** as `subagent_type: implementer`/
  `verifier` — not just roleplayed by a substitute `general-purpose` agent
  the way the initial builder subagents had to (the harness's agent-type
  registry doesn't pick up a freshly-created `.claude/agents/*.md` file
  mid-session; it became spawnable once the orchestrator's own next turn
  picked up the new registration).
  - **SS1.1 real test found and fixed a genuine bug**: the implementer's
    first real completion report included a `summary` field the
    `completion-report.schema.json` doesn't allow
    (`additionalProperties: false`), so it failed strict schema
    validation — independently confirmed via `jsonschema.validate()`, not
    just asserted. Fixed directly (small, precise correction, not a
    subagent redelegation) by tightening `implementer.md`'s instructions
    to name the exact allowed field set and warn against adding a
    narrative/summary field; re-spawned the same test and confirmed the
    second report validates cleanly. Also confirmed `isolation: worktree`
    genuinely works end-to-end (both real implementer runs executed inside
    an isolated `.claude/worktrees/agent-<id>` git worktree on their own
    branch) — cleaned up both test worktrees (`git worktree remove
    --force` + `git branch -D`) afterward so no stray worktrees/branches
    were left behind.
  - **SS1.2 real test** against a deliberately bad diff (touches a
    `forbidden_paths` entry, `.sdlc/state.json`, while also sneaking in an
    unrelated regression of another task's status) correctly returned
    `fail` with the exact violating path/entry named; a clean diff
    correctly returned `pass`, with honest `uncertain` calls where a
    diff-only view genuinely couldn't confirm something (e.g. whether an
    empty-queue test was really exercising empty state without seeing full
    file setup/teardown).
  - No recognized frontmatter key exists in this Claude Code version for a
    turn-limit on an agent definition (checked against `supervisor.md` and
    the new sibling files, no precedent) — `implementer.md` expresses this
    as a body-text instruction instead of a structured field; worth
    revisiting if a real key turns up later.
  - Phase-ish boundary reached (agent roles now real and spawn-tested,
    next task reframes `supervisor.md`'s relationship to them) — stopping
    here for review before SS1.3. Committed on this branch; not merged.
- **2026-08-31** — `/continue-development`: implemented SS0.2 and SS0.3 in
  parallel (both depend only on SS0.1, independent of each other), each via
  a scoped subagent, each independently re-verified (diff review + rerunning
  its own validation myself, not trusting the subagent's claim alone) before
  committing. **SS0.2**: `scripts/sdlc/validate-state.mjs` — library API
  (`validateTransition`) + CLI + built-in `--self-test` (no external test
  framework needed). Two real judgment calls worth remembering: same-state
  no-op transitions are allowed (state.json gets rewritten on every save,
  not every save advances every task), and evidence-gating applies to
  *both* `ready_to_release` and `released`, not just `released` — and it
  fixes the evidence-file naming convention (`<task-id>` or
  `<task-id>-*`/`<task-id>.*` directly under `.sdlc/evidence/`) that SS0.3's
  generator now follows. **SS0.3**: `docs/sdlc/schemas/{task-packet,
  completion-report}.schema.json` + `scripts/sdlc/generate-task-packet.mjs`.
  No real proposal had a still-`todo` task to use as a live example
  (lyrics-integration is fully implemented, only its merge step remains) so
  the subagent used a clearly-labeled synthetic example
  (`.sdlc/task-packets/SS-EX.1.packet.json`, a fictional queue-stats
  endpoint) — re-validated independently against the schema, passes. The
  `read_paths`/`write_paths` inference heuristic is regex/proximity-based
  (explicit path tokens + known-filename resolution against repo
  directories + a write-verb proximity check), honestly documented as
  non-semantic (won't resolve "the lyrics feature" to a directory without
  an explicit path mention), with a `"NEEDS_MANUAL_REVIEW"` fallback when
  nothing is inferable. All of SS0 (machine-state foundation) is now done.
  Phase boundary reached — stopping here for review before starting Phase
  SS1 (agent roles: `implementer.md`, `verifier.md`), since those tasks
  define restricted-tool-list agents that later phases build heavily on and
  are worth a sanity check first. Committed on this branch; not merged.
- **2026-08-31** — `/continue-development`: implemented SS0.1 (`.sdlc/state.json`
  + `.sdlc/project.yaml` schemas) via a scoped subagent, verified independently
  (diff review + a fresh `jsonschema.validate()` run against both example
  files, not just the subagent's own claim). Schemas live at
  `docs/sdlc/schemas/state.schema.json` and `project.schema.json`; hand-written
  examples at `.sdlc/state.json` (this repo's real task table, SS0.1 marked
  `implementing`/leased to this run, everything else `todo` matching the table
  above) and `.sdlc/project.yaml` (budget defaults, the immutable §6
  verification floor plus two project-specific `widen` entries reflecting
  `CLAUDE.md`'s actual risk areas — Spotify credentials, HA/Android device
  access). Real judgment call worth flagging forward: `state.json` tracks
  `status` (todo/in-progress/blocked/done, matching this table's legend) and
  `lifecycle_state` (the full evidence-gated enum, null until a task has a
  generated task packet) as two separate fields rather than one — SS0.2's
  transition validator needs to pick which it actually validates transitions
  against. No JSON Schema validator exists as a repo dependency (checked both
  `package.json`s); used the system's Python `jsonschema`/`pyyaml` ad hoc,
  nothing added to the repo. Committed on this branch; not merged.
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
