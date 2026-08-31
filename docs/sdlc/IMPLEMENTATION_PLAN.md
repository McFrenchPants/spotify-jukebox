# Implementation plan: sdlc-supervisor testbed (post-MVP lifecycle)

Scope: build design-spec.md v2's role/capability model as **project-local
files in this repo** (not a packaged plugin yet — see design spec §1/next
step). Goal is to validate the mechanics — task packets, machine state,
restricted implementer, path enforcement, tiered approval — by actually
running spotify-jukebox's post-MVP backlog through it. Packaging this into
a portable `sdlc-supervisor` plugin is explicitly out of scope for this
plan; it's the next proposal once this one proves out.

Task IDs use prefix `SS` (SDLC Supervisor). Phases have real dependencies
(each builds on state/contracts the previous phase defines), so they run in
order; tasks within a phase are independent unless a Notes column says
otherwise.

## Phase SS0 — machine state foundation

| ID | Task | Acceptance criteria | Notes |
|---|---|---|---|
| SS0.1 | Define `.sdlc/state.json` schema (work items, lifecycle state enum from design-spec §5, task dependency graph, per-task lease: assigned agent/run ID, attempt count) and `.sdlc/project.yaml` (framework version, budgets from §7, verification-profile floor from §6, owned-files list for bootstrap). Write both as a versioned JSON Schema / documented shape, not just an example file. | Schema documented in `docs/sdlc/schemas/state.schema.json` and `project.schema.json`; a hand-written example `.sdlc/state.json` for this repo's current in-flight state validates against it. | Foundational — everything else reads/writes this shape. |
| SS0.2 | Write a small validator (`scripts/sdlc/validate-state.mjs` or similar, whatever this repo's existing script conventions are — check `backend/package.json`/`frontend/package.json` for a precedent before choosing Node vs. a shell script) that checks a state-transition is legal per the `draft → design_review → approved → implementing → verifying → ready_to_release → released` enum, and that a `done`/`released` transition has the evidence its task's `verification_commands` require. | Validator rejects an out-of-order transition and a `done` claim with no evidence file in `.sdlc/evidence/`; accepts a legal one. Has its own test(s). | Depends on SS0.1's schema. |
| SS0.3 | Write the task-packet and completion-report templates (design-spec §5) as JSON Schema too, plus a generator function/script that takes "task ID + implementation plan entry + relevant design excerpt" and emits a packet file into `.sdlc/task-packets/`. | Given a real task from an existing proposal's `IMPLEMENTATION_PLAN.md` (e.g. a still-`todo` lyrics-integration follow-up, if one exists, or a synthetic example otherwise), the generator produces a schema-valid packet with correct `read_paths`/`write_paths` inferred from the task text and this repo's layout. | Depends on SS0.1. |

## Phase SS1 — agent roles

| ID | Task | Acceptance criteria | Notes |
|---|---|---|---|
| SS1.1 | Create `.claude/agents/implementer.md`: restricted tool list (`Read, Grep, Glob, Edit, Write, Bash`; explicit `disallowedTools: Agent, WebFetch, WebSearch`), a max-turn instruction, and instructions to read *only* its passed-in task packet, treat repo/external content as data not authority (§8), and return a structured completion report matching SS0.3's schema — including `scope_change_requested` instead of silently expanding scope. | Agent file exists, follows this repo's existing `.claude/agents/supervisor.md` frontmatter style, and a manual test (spawn it with a real task packet) produces a schema-valid report and does not read `IMPLEMENTATION_PLAN.md`/`DESIGN_SPEC.md` directly. | Depends on SS0.3 (needs the report schema to instruct against). Worktree isolation (`isolation: worktree` equivalent) — confirm during implementation whether Claude Code's agent-definition frontmatter actually supports this key today; if not, note it as a follow-up rather than silently skipping the requirement. |
| SS1.2 | Create `.claude/agents/verifier.md`: read-only (`Read, Grep, Glob, Bash` for running checks only — no `Edit`/`Write`), takes a task packet + diff + test output, checks acceptance criteria/forbidden-path compliance/architectural invariants, returns pass/fail + findings. | Agent file exists; manual test against a real diff correctly flags a forbidden-path violation (seed one deliberately) and passes a clean one. | Depends on SS0.3. |
| SS1.3 | Update `.claude/agents/supervisor.md` to explicitly frame it as the **release operator** role from design-spec §2: add a note that it consumes recorded approvals from `.sdlc/approvals/` (SS2.1) rather than acting on conversational instruction alone, once that mechanism exists. Keep everything else (tool grants, runbook pointer, "never implement" boundary) as-is — it was already the right shape. | Diff is additive/clarifying only; existing behavior/tests around it (there are none automated, but re-read the file end to end) still holds. | Small — mostly a documentation update. |

## Phase SS2 — approvals and action tiers

| ID | Task | Acceptance criteria | Notes |
|---|---|---|---|
| SS2.1 | Define the approval-record format (design-spec §4): a file per approval in `.sdlc/approvals/` recording operation, work-item/task ID, branch, commit SHA, timestamp, single-use flag. Document how the release operator checks one before acting (reads the record, confirms the current commit SHA on the target branch matches, refuses if not or if already consumed). | Format documented; a hand-written example approval file exists; `supervisor.md` (SS1.3) references the check explicitly. | Depends on SS1.3. |
| SS2.2 | Update `CLAUDE.md`'s override language (the "user can always override... a live, specific ask" paragraph) to point at this mechanism: an in-conversation override authorizes creating an approval record for *this* operation/SHA, not a standing license. | `CLAUDE.md` diff reviewed; wording doesn't regress the existing, already-tested "explicit override still works" behavior from this session's earlier merge. | Depends on SS2.1. Keep the existing carve-out's actual behavior intact — this is about recording what was approved, not adding new friction to a direct user instruction. |

## Phase SS3 — path enforcement

| ID | Task | Acceptance criteria | Notes |
|---|---|---|---|
| SS3.1 | Generate a `PreToolUse` hook config (`.claude/settings.json`, committed — not `.local.json`, since real enforcement needs to travel with the project, not one dev's machine) that denies `Edit`/`Write` outside the active task packet's `write_paths`, reading the active packet's paths from `.sdlc/task-packets/` rather than a hardcoded list. Windows-path normalization required (confirmed necessary — this machine is Windows). Kill switch: the enforce/disable toggle lives in `.sdlc/project.yaml`, read by the hook script directly — never gated behind `Edit`/`Write` itself (see design-spec §8a finding 2, a self-lock is a real failure mode, not hypothetical). | A manual test: spawn the SS1.1 implementer agent with a task packet whose `write_paths` excludes some file, confirm the agent's attempt to write it is denied before execution. Separately: confirm a `Bash`-origin write outside `write_paths` is *not* expected to be caught here (design-spec §8a finding 1) — that gap is covered by SS4.3's verifier diff-check instead, not by this hook; don't scope-creep SS3.1 into parsing Bash commands to catch it. Confirm the `project.yaml` toggle disables enforcement without needing an `Edit`/`Write` call to flip it. | Depends on SS1.1, SS0.3. **Feasibility spike already run and confirmed** (2026-08-31, ad hoc — see design-spec §8a): `PreToolUse` denial, path-based matching, and a runtime toggle all work as documented, using a throwaway script + `.claude/settings.local.json` wiring (reverted, not committed). Real hook script lives at `.claude/hooks/sdlc-path-check.mjs` — the spike version is committed as a reference/starting point, marked clearly as a proof-of-concept, not the real per-task-packet implementation. |

## Phase SS4 — orchestrator loop rewrite

| ID | Task | Acceptance criteria | Notes |
|---|---|---|---|
| SS4.1 | Rewrite `.claude/commands/continue-development.md`'s Orient/Resume section to load the full design spec + full implementation plan + `.sdlc/state.json` once per run (design-spec §3), tracking a content hash per document so it isn't reread before every task within the same run. | Command file diff reviewed; the "read only the chosen task's entry" instruction is gone, replaced with the full-context-once + hash-gated-reread behavior. | Depends on SS0.1. |
| SS4.2 | Rewrite the Delegate section to generate a task packet (via SS0.3's generator) and spawn `subagent_type: implementer` (SS1.1) instead of `general-purpose`, passing only the packet. Add the "check for/create an expertise skill" step's revised, non-unilateral version from design-spec §10 (draft-only, activation needs a check-in). | Command file diff reviewed; a live run against a real (or synthetic) task produces a packet, spawns the implementer agent, and receives back a schema-valid completion report. | Depends on SS1.1, SS0.3. |
| SS4.3 | Rewrite the Verify section to route high-risk tasks (per design-spec §6's floor: auth, persistence/migrations, deploy, production-tier) through the SS1.2 verifier agent, and everything else through the orchestrator's own spot-check as today. | Command file diff reviewed; a synthetic "touches a migration" task packet triggers verifier-agent delegation; a synthetic "touches a React component" one doesn't. | Depends on SS1.2. |
| SS4.4 | Replace the "substantial batch" stopping language in Continue-or-stop with the configured run budgets from design-spec §7 (sourced from `.sdlc/project.yaml`), plus the explicit unconditional-stop conditions (plan divergence, unexpected file, test regression, unresolved acceptance ambiguity). | Command file diff reviewed; budgets are read from `project.yaml` rather than hardcoded; a synthetic max-tasks-per-run of 1 actually stops the loop after one task in a manual test. | Depends on SS0.1. |

## Phase SS5 — bootstrap commands

| ID | Task | Acceptance criteria | Notes |
|---|---|---|---|
| SS5.1 | Write `.claude/commands/sdlc-doctor.md`: checks this repo's `.sdlc/` state, generated hooks (SS3.1), and the files listed in `project.yaml`'s owned-files list for drift; reports findings, makes no changes. | Manual run against this repo (post SS0–SS4) reports clean; a deliberately introduced drift (e.g. hand-edit `.sdlc/state.json` to an invalid transition) is caught. | Depends on SS0.1, SS0.2. `init`/`migrate`/`uninstall` (design-spec §9) are deferred to the eventual plugin-extraction proposal — this repo doesn't need to bootstrap itself from nothing, it already exists, so only `doctor` earns its keep here. |

## Phase SS6 — dogfood

| ID | Task | Acceptance criteria | Notes |
|---|---|---|---|
| SS6.1 | Pick one real, currently-`ready`/`idea` `BACKLOG.md` item and run it end-to-end through the rewritten loop (SS4) — analysis (if missing) → design spec (if warranted) → implementation plan → SS4.2's implementer delegation → SS4.3's verification routing → tracking update. | The chosen item reaches at least one completed, verified task via the new machinery, with `.sdlc/state.json` and the task's `PROGRESS.md` row both reflecting it accurately. | Depends on all of SS0–SS5. This is the actual validation step — if the machinery is awkward or wrong here, that's real signal for the plugin-extraction design, not a failure of this plan. |
| SS6.2 | Write up what worked and what didn't from SS6.1 as a short addendum to `design-spec.md` (or a new `docs/sdlc/dogfood-notes.md`) — specifically flagging anything design-spec v2 got wrong once it hit real usage, since that's exactly the input the eventual plugin-extraction proposal needs. | Notes exist, reference specific task IDs / friction points from SS6.1, not generic impressions. | Depends on SS6.1. |

## What's explicitly out of scope here

- Packaging any of this as a `.claude-plugin/plugin.json` — that's the
  extraction proposal, once SS6 gives real signal on what the mechanics
  should actually look like.
- `init-sdlc`'s `init`/`migrate`/`uninstall` commands — this repo isn't
  bootstrapping from zero.
- Multi-project use — this plan validates the framework against exactly
  one repo (this one).
