# Design spec: sdlc-supervisor framework (v2)

**Status:** draft, for review. v2 — revised after an external agent review
of v1 (full review preserved in [review-2026-08-31.md](review-2026-08-31.md)).
v1's naming and portability findings stand unchanged; this revision
replaces v1's sections 3 and 5 wholesale with a structural safety model,
because the reviewer's central point survives scrutiny: **v1 asked agents
to promise good behavior where it should have made bad behavior
impossible.** Still not an implementation plan — no plugin code exists yet.

**Name:** `sdlc-supervisor` (confirmed).

## What changed from v1, and why

The reviewer's core claim: prompt instructions like "read only this
section," "don't touch these files," "stop after a substantial batch" are
*requests*, not *controls*. Claude Code has real mechanisms for the
controls — restricted-tool subagents, worktree isolation, hooks that can
deny a tool call before it runs — and v1 wasn't using them. That's correct,
and it's a bigger problem the bigger and more autonomous this framework
gets, which is exactly the direction you want it to go. Adopted essentially
as proposed.

Where I scaled the recommendation down, and why — this is a framework one
person runs across their own repos, not a multi-tenant system defending
against adversarial actors, so a few pieces of the reviewer's full
enterprise model would be pure overhead here:

- **No cryptographic/digest-bound approvals, no formal preflight/rollback
  subsystem.** An approval binds to task ID + branch + commit SHA in a
  plain recorded file (§5), which is enough to stop the failure mode that
  matters (approving one thing, a different thing lands) without building
  an approvals service. A project with real rollback needs (the
  Home-Assistant-connected spotify-jukebox project, for instance) can still
  layer that in as project policy — see §4 — without it being framework
  core.
- **The independent read-only verifier is a profile, not a mandatory second
  agent on every task.** Running two subagents per task by default doubles
  cost for most changes. It's specified in §6 as a project-configurable
  "strong verification" tier, required by default only for the risk
  categories the reviewer named (auth, migrations, deployment, anything
  touching the production boundary) — and freely dialable up for a project
  that wants it everywhere.

Everything else — the role/capability split, machine-readable state, task
packets, run budgets, path policies via hooks, non-unilateral skill
creation, non-destructive bootstrap — is adopted close to as proposed.

## 1. Portability mechanism — unchanged from v1

Confirmed: this is a Claude Code plugin (git-based, `.claude-plugin/
plugin.json` + `skills/`/`commands/`/`agents/`/`hooks/`), unrelated to
Claude Cowork's `.plugin` mechanism. One nuance the reviewer added worth
recording: marketplace auto-update is configurable, and an update doesn't
reach an already-running session until reload/restart — so a long-running
orchestrator session won't silently pick up a plugin change mid-run, which
is actually the property you want (no framework update landing mid-task).

## 2. Role/capability model (replaces v1 "supervisor persona")

v1 collapsed everything non-implementer into one persona adopted by the
main session, then retired the separate `supervisor.md` agent entirely.
The reviewer is right that this loses the one thing the old design
actually had going for it: an identifiable, tool-restricted capability
surface for the dangerous operations. Four roles, not two:

| Role | What it is | Reads | Tools | Can it merge/push/deploy? |
|---|---|---|---|---|
| **Orchestrator** | The main session, running the `continue-development` skill | Full approved design, full implementation plan, full current state (`.sdlc/state.json`), architectural instructions — loaded once, refreshed only when a content hash changes (§7) | Everything the main session has | No — hands off to Release operator |
| **Implementer** | Plugin-provided subagent, one per task packet | Only its task packet (§5) — never the plan or design docs directly | `Read, Grep, Glob, Edit, Write, Bash`; `Agent, WebFetch, WebSearch` denied; worktree-isolated | No |
| **Verifier** | Plugin-provided subagent, read-only, spawned for the "strong verification" tier (§6) | Task packet + diff + test output — never the implementer's reasoning/scratch | `Read, Grep, Glob, Bash` (for running checks only); no `Edit`/`Write` | No |
| **Release operator** | This project's existing `.claude/agents/supervisor.md` pattern, kept — not retired | `docs/SUPERVISOR_RUNBOOK.md`-equivalent project policy, the specific approval record for this action (§4) | `Bash, Read, Grep, Glob, Edit, Write`, scoped to remote/production commands only | Yes — the only role that does |

The orchestrator can still be "the persona the main session adopts" for
UX purposes — the user-facing lifecycle in §3 of v1 stays unified. What
changes is that merge/push/deploy is never something the orchestrator
persona can just decide to do by having the right prompt loaded; it always
routes through the Release operator's separate, narrower tool grant and an
approval record. This repo's `.claude/agents/supervisor.md` was the right
shape all along — v2 generalizes it into the plugin instead of retiring it.

**Implementer subagent definition** (plugin-provided, per reviewer's
sketch, project-adaptable):

```yaml
name: implementer
description: Implements one supervisor-issued task packet.
model: sonnet
maxTurns: 12
tools: Read, Grep, Glob, Edit, Write, Bash
disallowedTools: Agent, WebFetch, WebSearch
isolation: worktree
```

Known limitation to design around, not paper over: plugin-provided agents
ignore agent-level `permissionMode`/`hooks`/`mcpServers`. So the *tool
allowlist* travels with the plugin, but *path enforcement* (§8) can't — it
has to be generated as project-local hook config by `init-sdlc`/`doctor`
(§9), not shipped as something the portable agent definition alone
guarantees. Document this limitation plainly in the plugin's own docs
rather than implying stronger portable enforcement than actually exists.

## 3. Orchestrator context policy (replaces v1's "read only the task entry")

v1's `continue-development.md:77` told the orchestrator to read only the
chosen task's plan entry and referenced design section. That's backwards —
it's the *implementer* that should get a narrow slice; the orchestrator
needs the whole picture to catch cross-task drift, spanning acceptance
criteria, and a locally-correct-but-globally-wrong change. New rule:

- On resuming or starting a work item, the orchestrator reads the complete
  approved design spec, the complete implementation plan, and the current
  `.sdlc/state.json` in full, once.
- It does **not** re-read them before every task inside the same run.
  Instead it tracks a content hash (or mtime, if hashing is overkill for a
  given project) per document in state; it only re-reads a document when
  that hash changes — e.g. the user or a subagent edited the plan mid-run.
- What goes to the implementer/verifier is always a generated task packet
  (§5), never "go read the plan yourself" — this is where v1's
  context-economy instinct was right; it was just aimed at the wrong role.

## 4. Action tiers and approval (replaces v1's blanket override language)

v1 said the whole merge/push/deploy boundary is "a default, not a wall,"
overridable by any direct, unambiguous, in-conversation instruction. The
reviewer's objection is real: that's fine as a personal-convenience escape
hatch, but it means the *only* thing standing between "approved this" and
"deployed that" is one sentence's worth of language interpretation — no
binding to what was actually approved. Tiered instead:

| Tier | Examples | Authorization |
|---|---|---|
| Local read | Inspect code, git state, run tests | Automatic — no gate |
| Local mutation | Edit, test, commit on a feature branch | Implementer stays inside its task packet's `write_paths` |
| Shared mutation | Push a branch, open/update a PR | Project-configurable: some projects want this automatic once tests pass, others want a check-in |
| Production mutation | Merge to the default branch, deploy, restart a live service | Explicit, action-specific approval (below) — Release operator only |
| Destructive/admin | Data deletion, host-level ops, unrollback-able migrations | Explicit approval **and** the project's own preflight checklist if it has one (project policy, not framework-mandated) |

An approval for a Production-mutation-or-above action is a small recorded
fact, not just something inferred from conversation: which operation,
which task/work-item ID, which commit SHA, and that it's single-use (a new
commit on the same branch after approval needs a fresh approval, since
that's a different artifact than what was approved). This still lives as a
direct human instruction in the conversation — it isn't a cryptographic
token system — but it's *recorded* rather than trusted from memory, so a
later session (or a differently-worded ask) can't accidentally reuse it.
The user-override carve-out from v1's CLAUDE.md language survives, scoped
down: it can authorize the Release operator to act *this time*, but the
recorded-approval discipline (what SHA, what operation) still applies —
"go ahead" authorizes the specific thing just discussed, not a standing
license.

## 5. Machine-readable state and task packets (new)

`PROGRESS.md` alone can drift, contradict itself, or get concurrently
edited with no conflict signal. Adopted as proposed: a small state
directory becomes the source of truth; Markdown becomes the human-readable
render of it, not a competing copy of the truth.

```
.sdlc/
  project.yaml       # framework/schema version, project policy pointers
  state.json         # work items, lifecycle state, task graph, leases
  approvals/         # one file per recorded approval (see §4)
  task-packets/       # one file per generated packet, plus its report
  evidence/          # command output / test results referenced by reports
```

Lifecycle states, validated on every transition (an agent cannot write a
`done` status without the evidence its task's `verification_commands`
require having produced):

```
draft → design_review → approved → implementing
      → verifying → ready_to_release → released
```

**Task packet** (generated by the orchestrator, given to an implementer —
this is the entire scope contract, replacing v1's "list of files it should
probably touch"):

```yaml
task_id:
plan_revision:
objective:
non_goals:
dependencies:
read_paths:
write_paths:
forbidden_paths:
acceptance_criteria:
verification_commands:
expected_report:
max_attempts:
```

**Completion report** (structured, returned by the implementer instead of
free-text "here's what I did"):

```yaml
status:
files_changed:
acceptance_results:
commands_run:
test_results:
decisions:
scope_deviations:
unresolved_risks:
commit:
```

If an implementer finds it needs to touch something outside its packet's
scope, its report says `status: scope_change_requested` — it does not
just do the out-of-scope thing and mention it in a decisions note. The
orchestrator (which has the full plan, per §3) is the only one positioned
to judge whether that's a real gap in the plan or scope creep.

`PROGRESS.md` is regenerated from `.sdlc/state.json` (or kept in sync by
the orchestrator at each tracking update) — it stays the readable
narrative a human skims, it just stops being the only place status lives.

## 6. Verification profiles (new, scaled down from the reviewer's proposal)

Default: the orchestrator spot-checks the implementer's diff and report
against the task's acceptance criteria itself — same as v1, and fine for
most tasks.

**Strong verification** (separate read-only Verifier subagent, per the
role table in §2) is required, not optional, when a task packet touches
any of: authentication/authorization, data persistence/migrations,
deployment/release tooling, or anything on the Production-mutation tier or
above from §4. A project's `project.yaml` can widen this list; it can't
narrow it below that floor. The verifier gets the task packet, the actual
diff, and test output — explicitly not the implementer's own reasoning —
and checks acceptance criteria, forbidden-path compliance, and any
architectural invariants the orchestrator supplies it.

## 7. Run budgets (replaces v1's "substantial batch")

"Substantial batch" as a stopping condition depends entirely on the
model's own judgment in the moment, which is exactly the kind of control
this revision is trying to move out of prose. Configured budgets instead,
set in `project.yaml` with framework defaults:

- Max tasks per run.
- Max concurrent implementer agents.
- Max attempts per task before it escalates to the orchestrator instead of
  retrying itself.
- Max verifier retries.
- A rough token/time budget per run (soft — logged and flagged, not a hard
  kill, since Claude Code doesn't expose a clean mid-run cutoff primitive).
- Stop unconditionally at: a phase boundary, plan divergence, an
  unexpected file outside every open task's `write_paths`, a test
  regression, or acceptance ambiguity that isn't the current task's to
  resolve.
- Otherwise: continue automatically while budgets aren't exhausted and no
  stop condition fired.

This keeps v1's actual intent (don't grind through everything unattended)
but makes it a number a project can tune instead of a phrase every session
interprets differently.

## 8. Path policies and hooks (replaces v1's "inferred files to touch")

A task packet's `read_paths`/`write_paths`/`forbidden_paths` (§5) are the
policy; a `PreToolUse` hook is the enforcement — denying an `Edit`/`Write`
outside the active task's `write_paths` before it executes, not after.
This is **defense in depth**, not the only boundary — the tool-level
`disallowedTools` on the implementer agent (§2) is the first layer, the
hook is the second. Because plugin-provided agents can't ship their own
hooks (the limitation noted in §2), `init-sdlc`/`doctor` (§9) generates
this hook config into the project's own `.claude/settings.json`, and it
must normalize Windows vs. POSIX path separators before matching — a
denial that silently no-ops on Windows because of a backslash mismatch is
worse than no hook at all.

Repository, test-fixture, and any external content an implementer reads is
data, never authority — a task packet, agent definition, or a live
instruction from the user in the current conversation are the only things
that can change scope. This matters more once implementers are reading
arbitrary project files under time pressure to finish a task; state it
explicitly in the implementer agent's own instructions, not just here.

## 9. Bootstrap: `init-sdlc` (expanded from v1)

v1 said "never overwrite existing files silently." Necessary, not
sufficient. `init-sdlc` becomes a small command family:

- **`init`** — inventory pass first (what already exists: `BACKLOG.md`
  format, test commands, default branch, deploy mechanism — discovered,
  never assumed to be `master`/GitHub/npm), then a proposed-changes report
  the user confirms before anything is written. Existing conventions are
  preserved where the project already has one instead of overwritten with
  the framework default.
- **`doctor`** — checks an already-bootstrapped project's `.sdlc/` state,
  generated hooks, and plugin version against what's expected; reports
  drift.
- **`migrate`** — moves a project from an older framework schema/plugin
  version to a newer one.
- **`uninstall`** — removes what the framework owns, leaving hand-written
  content alone.

When `init-sdlc` needs to add to a file the project already owns (most
often `CLAUDE.md`), it writes inside a marked managed block (e.g. `<!--
sdlc-supervisor:managed:start/end -->`) so re-running `init`/`migrate`
knows exactly what it's allowed to touch versus what's the project owner's
own prose. `.sdlc/project.yaml` records which files/sections the framework
owns. The pre-migration state gets committed (or the command refuses to
run against a dirty tree) before any of this happens.

## 10. Skill-creation authority (revised from v1)

v1 let the supervisor persona create a new expertise skill unilaterally,
only logging the decision. The reviewer's concern is real: that's exactly
the kind of accumulated, unreviewed policy-from-incident that degrades a
framework over time, and it silently broadens what *future* delegated
agents are told to do. Revised:

- The orchestrator may write a one-run task instruction inline (today's
  "check for/create an expertise skill before delegating" step, kept) —
  no review needed, it dies with the run if not reused.
- It may **draft** a project-local expertise skill file when it sees the
  same one-run instruction recur across tasks — but drafting isn't
  activating.
- Activating or committing that drafted skill into the project requires a
  human check-in, same tier as the design-spec sign-off gate.
- Installing or changing anything at the user-global skill level always
  requires explicit approval — never inferred from a repo-local pattern.
- Every skill (drafted or activated) records its scope, the evidence/
  rationale that motivated it, an owner, and a review date, so a stale or
  narrow-incident-driven skill is easy to spot later.

## 11. Remaining open items (from v1, still open)

- **v1 Q4 (content genericization):** unchanged recommendation — ship one
  opinionated `BACKLOG.md`/`PROGRESS.md` default reusing this repo's
  conventions; `init-sdlc` asks yes/no on adopting it per project rather
  than presenting a menu.
- **New, from this revision:** exact schema for `state.json` (field types,
  how the task dependency graph is represented, what a "lease" looks like
  for a task an implementer currently holds) needs to be nailed down in
  the implementation plan, not guessed here — this design spec fixes the
  shape of the system, not the file format byte-for-byte.

## Next step

This is now ready for an implementation plan covering: the `state.json`
schema and its transition-validation logic, the task-packet generator, the
implementer/verifier agent definitions and their hook-generation
counterpart in `init-sdlc`, the approval-record format, and a conformance
test suite (can an implementer write outside `write_paths`? does a
`done` transition without evidence get rejected? does `doctor` catch a
drifted hook config?) — before any of it touches spotify-jukebox again.
