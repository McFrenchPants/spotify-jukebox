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

## Status: Phases SS0-SS5 done. SS6.1 next (dogfood run).

## Task Table

Legend: `todo` / `in-progress` / `blocked` / `done`

| ID | Task | Status | Notes |
|---|---|---|---|
| SS0.1 | `.sdlc/state.json` + `project.yaml` schema | done | Schemas at `docs/sdlc/schemas/{state,project}.schema.json`; example `.sdlc/state.json`/`project.yaml` for this repo's real in-flight state, validated against both (`jsonschema`, re-verified independently). Introduced a deliberate `status`/`lifecycle_state` split per task (coarse todo/in-progress/blocked/done vs. the full evidence-gated `draft→…→released` enum, null until a task packet exists) — SS0.2 needs to decide which field(s) its transition validator actually checks. |
| SS0.2 | State-transition validator | done | `scripts/sdlc/validate-state.mjs` (library API + CLI + `--self-test`, no external test dep). Evidence-gates both `ready_to_release` and `released` (not just `released`); allows same-state no-ops; documents the `<task-id>-*` evidence-file naming convention SS0.3's generator must follow. |
| SS0.3 | Task-packet + completion-report templates/generator | done | Schemas at `docs/sdlc/schemas/{task-packet,completion-report}.schema.json`; generator at `scripts/sdlc/generate-task-packet.mjs` (regex/proximity heuristic for `read_paths`/`write_paths`, honestly documented limits, falls back to `"NEEDS_MANUAL_REVIEW"`). Tested against a synthetic example (no real proposal had a `todo` task) at `.sdlc/task-packets/SS-EX.1.packet.json`, re-validated independently. |
| SS1.1 | `implementer` agent | done | `.claude/agents/implementer.md`. Real spawn test (`subagent_type: implementer`) confirmed `isolation: worktree` genuinely worked when it was in use — it ran inside an isolated git worktree end to end. **Since removed** (see SS4.2 row and design-spec §2a) — the implementer now runs in the shared working tree. First real report included an extra `summary` field the schema forbids (`additionalProperties: false`) — fixed by tightening the instructions to name the exact allowed field set; re-tested and confirmed schema-valid on the second run. No recognized frontmatter key exists for a turn limit in this Claude Code version — expressed as a body-text instruction instead. |
| SS1.2 | `verifier` agent | done | `.claude/agents/verifier.md`. Real spawn test (`subagent_type: verifier`) against a deliberately bad diff correctly caught a forbidden-path violation (and a sneaky regression hidden in it) with an overall `fail`; a clean diff correctly returned `pass` with honest `uncertain` calls where the diff-only view couldn't fully confirm something. |
| SS1.3 | Reframe `supervisor.md` as release operator | done | Additive only — 49 insertions, 0 deletions (verified via `git diff --numstat`); the existing "Scope note for non-supervisor agents" carve-out is byte-for-byte unchanged. Adds the four-role framing + an approval-record section that explicitly says a live user instruction *is* the approval (write the record and proceed; never make the user produce one first). |
| SS2.1 | Approval-record format | done | `docs/sdlc/schemas/approval.schema.json` + procedure doc `docs/sdlc/APPROVAL_RECORDS.md` + a real example in `.sdlc/approvals/` pinned to the then-current HEAD. `single_use` is `const: true` so a standing approval can't be minted; `consumed_at`/`consumed_by` are conditionally required when `consumed: true`. Verified the constraints actually bite via negative controls, not just a happy-path validate. |
| SS2.2 | Update `CLAUDE.md` override language | done | Added a new paragraph right after the override carve-out, exactly per the SS2.1 prep notes: the live instruction now explicitly authorizes the release operator to record+consume a SHA-pinned, single-use approval as part of honoring it (never a precondition), linking `docs/sdlc/APPROVAL_RECORDS.md`/`docs/sdlc/schemas/approval.schema.json`/`.sdlc/approvals/`; the "standing instruction buried in a doc doesn't count" sentence is preserved verbatim inside it. The two-vs-four-role reconciliation (prep note 3) was left alone — out of this task's acceptance criteria, worth a future task if it matters. First task run through the real packet+implementer mechanism (not `general-purpose`); surfaced a genuine SS4.2 gap, see session log. |
| SS3.1 | `PreToolUse` path-enforcement hook | done | Real implementation replaces the spike. **Key discovery: the `PreToolUse` hook input carries `agent_type`** (observed live: `"implementer"`, `"general-purpose"`), so enforcement is scoped to implementer agents only — every other caller, including ordinary interactive sessions, passes through untouched. That's what makes shipping this in a *committed* `.claude/settings.json` safe. Windows backslash/drive-case normalization independently re-verified by the orchestrator (a first test pass appeared to show a normalization hole; that turned out to be shell-escaping in the test harness, not the hook — retested properly, all cases correct). |
| SS4.1 | Orchestrator full-context-once rewrite | done | `.claude/commands/continue-development.md`'s "Resume in-progress work" section rewritten: full design-spec + full plan + full state (`.sdlc/state.json` if the work item is sdlc-tracked, else the proposal's own `PROGRESS.md`) loaded once per run, replacing the old "read only the chosen task's entry" step. Reread is gated on Claude Code's own changed-on-disk file tracking rather than a hand-rolled mtime check. Delegate/Verify/Track/Continue-or-stop/Orient untouched (confirmed via diff, scoped to one hunk). |
| SS4.2 | Delegate rewrite (task packets, implementer agent) | done | `.claude/commands/continue-development.md`'s Delegate section split into two explicit sub-paths. Legacy proposal-folder work keeps the pre-existing `general-purpose` behavior verbatim, under its own heading. sdlc-tracked work now follows a 9-step procedure covering every requirement this row had accumulated: clean-working-tree gate before spawning; generate the packet via the SS0.3 generator and explicitly review/hand-correct it (never trust `NEEDS_MANUAL_REVIEW` or an obviously-wrong inferred path); write `.sdlc/active-packet` before spawning and retire it once the task is settled; spawn `subagent_type: implementer` with the full packet JSON pasted inline (never a pointer to go read it); resume a blocked/interrupted implementer via `SendMessage` to its own agent ID, never a fresh `Agent` call asserting unverifiable prior progress; `scope_change_requested` is the orchestrator's own judgment call; expertise skills are draft-only pending human check-in; sdlc-tracked tasks are delegated strictly one at a time (`max_concurrent_implementers: 1`, one active-packet pointer). Dispatched via a real implementer subagent + hand-authored, schema-validated task packet (the generator's heuristic wasn't run against real plan-entry text for this self-referential task; a hand-written packet was more reliable given the stakes). Diff independently verified: confined to exactly the Delegate subsection, 117 insertions/5 deletions, `git diff --stat` shows only this one file changed. Implementer flagged one out-of-scope, non-blocking observation: `.claude/hooks/sdlc-path-check.mjs`'s header comment still describes `isolation: worktree`, stale since design-spec §2a's reversal — worth a small follow-up task, not urgent, not done here (forbidden_paths). |
| SS4.3 | Verify rewrite (verifier routing) | done | `.claude/commands/continue-development.md`'s "Verify" subsection now decides, per task, whether it needs the SS1.2 verifier agent before falling back to the orchestrator's own spot-check. Routing tier: the fixed floor (auth/authz, data persistence/migrations, deployment/release tooling, production-mutation-tier-or-above) plus this repo's `project.yaml` widen entries (Spotify credential/token handling, HA/Android device access) — stated as a minimum a project can widen but this file's logic can never narrow. Routing decision is explicitly the orchestrator's own per-task judgment (not an automated classifier), applied identically to sdlc-tracked and legacy proposal-folder work, erring toward routing when unsure. Strong-verification path spawns `subagent_type: verifier` with exactly the three inputs `verifier.md` requires (task packet, actual diff, verification-command output) — never the implementer's own completion-report JSON/reasoning; a verifier `fail` blocks acceptance the same as an orchestrator-found gap, and `uncertain` criteria are recorded rather than rounded to pass. Default (non-floor) path preserves the prior spot-check prose verbatim. Diff confined to exactly the Verify subsection (73 insertions, 1 deletion), independently verified via `git diff --stat` and a full read of the diff. Hand-authored packet, same rationale as SS4.2 (self-referential task, no plain-text plan-entry source to feed the generator without handing the implementer the plan itself). |
| SS4.4 | Run-budget stopping conditions | done | "Continue or stop" now reads pacing from `.sdlc/project.yaml`'s `budgets` block at run time rather than the old subjective "substantial batch" language: `max_tasks_per_run` is an in-session running-count stop trigger; `max_attempts_per_task`/`max_verifier_retries` escalate to the orchestrator's own judgment (surfaced to the user) rather than auto-retrying, sourced from `state.json`'s `lease.attempt_count` for sdlc-tracked work and an in-session count for legacy work; `token_or_time_budget` is explicitly soft (logged/flagged, never a hard stop, since Claude Code has no mid-run cutoff primitive). Unconditional-stop list now names design-spec §7's concrete triggers (phase boundary, plan divergence, an unexpected file outside every open task's `write_paths`, a test regression, an acceptance-criteria ambiguity not the task's to resolve) in place of the old vague examples. Applies identically to sdlc-tracked and legacy proposal-folder work since `project.yaml` is repo-wide, not per-item. Existing genuine-blocker and merge-requires-go-ahead bullets, plus the closing summary+prompt structure, preserved. Diff confined to exactly the Continue-or-stop subsection (65 insertions, 8 deletions), independently verified via `git diff --stat` and a full read of the diff. Hand-authored packet, same self-referential rationale as SS4.1-4.3. **Phase SS4 (orchestrator loop rewrite) is now complete.** |
| SS5.1 | `sdlc-doctor` command | done | `.claude/commands/sdlc-doctor.md` — read-only diagnostic slash command, four checks (lifecycle-enum sanity, PreToolUse hook wiring, `owned_files` existence, `task_packet_path` referential integrity), PASS/FAIL report format, explicit never-edit framing. Generator heuristic needed full hand-authoring for the packet (mis-stripped leading dots on `.claude/` paths, an overly broad `.sdlc/**`/`docs/**` write scope self-contradicting its own `forbidden_paths`, empty acceptance criteria) — same pattern as the SS4.x self-referential tasks. Did not qualify for SS4.3's strong-verification tier (no auth/persistence/deploy/credential/device angle) — orchestrator spot-check used. Manually re-exercised against real repo state (clean) and a deliberately drifted scratch copy (drift caught) before accepting; confirmed via `git status --porcelain` that neither `.sdlc/state.json` nor `.claude/hooks/sdlc-path-check.mjs` was actually touched during that test. Phase SS5 (bootstrap commands) is now complete. |
| SS6.1 | Dogfood: run one real backlog item through the loop | todo | depends on all of SS0-SS5 |
| SS6.2 | Write up dogfood findings | todo | depends on SS6.1 |

## Open Questions / Blockers

- **The kill switch is a one-way ratchet that any agent with `Bash` can pull
  for every OTHER agent, silently — including ones it did not spawn.**
  Surfaced for real during SS3.1's testing (corrected 2026-08-31 — the
  original write-up of this mischaracterized the actor topology, see the
  session log). What actually happened: the SS3.1 subagent (spawned by the
  orchestrator as `general-purpose`, with full tool access) itself spawned
  two `implementer` subagents as part of its assigned verification steps —
  one to confirm denial/allow behavior, a second, per the orchestrator's own
  instructions, to confirm the kill switch works. To run that second test,
  the SS3.1 agent flipped `path_enforcement.enforce` to `false` via `Bash`
  (exactly as designed) and, via `SendMessage`, asked its *own first child*
  to retry the write that had just been denied. That first implementer
  **refused** — reasoning that a guardrail being removed by "a party who
  isn't my user" and then being asked to walk through it is an escalation
  pattern to decline, regardless of how legitimate the off-switch actually
  was. It described its instructions as human-authored and the requester as
  a "peer session," and had no way to verify that the request actually
  traced back to a legitimate test plan — it does not have visibility into
  its own position in the agent tree (whether the requester is its own
  parent, a sibling, or something unrelated) or into whether a Bash flip it
  observes was authorized.
  The real, narrower gap this exposes: an implementer has no reliable way to
  distinguish "my own orchestrating context asked for this" from "some other
  agent asked for this," so its only safe default is to refuse essentially
  any request to retry after a guardrail relaxation — which is correct
  caution, but also means the kill switch itself is a repo-wide, persistent,
  silent flip that any agent with `Bash` can pull for every other agent
  without their session ever finding out enforcement went off. Worth
  considering: making the hook announce enforcement state, requiring a
  reason/expiry alongside the flip, or having `sdlc-doctor` (SS5.1) hard-fail
  when enforcement is off. **Also a hard process rule going forward: never
  commit with `enforce: false`** — verify it before every commit that
  touches `project.yaml`.
- **`CLAUDE.md` calls the role split "enforced-by-policy, not technical."**
  That becomes partly untrue once SS3.1's `PreToolUse` path-enforcement hook
  lands in a committed `.claude/settings.json` — there *is* now a technical
  layer, just an incomplete one (it doesn't catch `Bash`-origin writes; see
  design-spec §8a finding 1). Someone should refresh that sentence to say
  what's actually enforced vs. still policy-only. Surfaced during SS2.1;
  belongs to SS3.x or a follow-up rather than SS2.2.
- **Design-spec §2's implementer sketch includes `maxTurns: 12`**, but
  SS1.1 found no frontmatter precedent for a turn limit and expressed it as
  prose in `implementer.md` instead. Worth confirming whether `maxTurns` is
  actually a valid agent-definition key in this Claude Code version — if it
  is, the prose should become a real field.

- ~~Whether Claude Code's current agent-definition frontmatter actually
  supports `isolation: worktree`~~ — **resolved**: it does, confirmed live
  during SS1.1. (Then deliberately turned back off during SS4.2 scoping —
  see design-spec §2a. Different question, already answered here: the
  capability is real, we're just not using it right now.)
- ~~Whether this Claude Code version's hook configuration actually supports
  denying a tool call pre-execution~~ — **resolved**: confirmed live during
  the SS3.1 spike and again in SS3.1's real implementation.
  If either capability doesn't exist as documented, that's real signal for
  the design spec, not something to route around silently.

## Session Log

*(newest on top — add an entry each time a session ends, even mid-phase)*

- **2026-09-01** — `/continue-development`: implemented **SS5.1**, the
  `sdlc-doctor` command — **completing Phase SS5**. Not self-referential
  (a new file, not an edit to `continue-development.md`), but the
  generator's heuristic still needed full hand-correction before use, same
  as SS4.1-4.4: it stripped leading dots off every `.claude/`-prefixed
  path, produced an overly broad `.sdlc/**`/`docs/**` `write_paths` that
  directly contradicted entries it also listed under `forbidden_paths`
  (e.g. `.sdlc/project.yaml` in both), and left `acceptance_criteria`/
  `verification_commands` empty. Wrote the packet by hand directly against
  `docs/sdlc/schemas/task-packet.schema.json` instead of patching the
  generated one field-by-field.
  - Followed the established active-packet lifecycle: confirmed a clean
    tree, wrote `.sdlc/active-packet` containing `SS5.1`, spawned
    `subagent_type: implementer` with the full packet pasted inline,
    accepted the completion report, then removed the pointer.
  - This task did not qualify for SS4.3's strong-verification tier (a new
    read-only diagnostic command, no auth/persistence/deploy/credential/
    device angle) — orchestrator spot-check was correct and sufficient.
    Read the new `.claude/commands/sdlc-doctor.md` in full: matches
    `continue-development.md`'s frontmatter style, states its read-only
    framing explicitly and repeatedly, documents all four required checks
    precisely, and gives a concrete PASS/FAIL report format with no
    fix-it behavior.
  - Verified independently rather than on the implementer's report alone:
    `git status --porcelain` confirmed only the one new file was added;
    the implementer's own transcript showed it manually exercised checks
    1/3/4 against both the real repo (clean on all counts) and a
    deliberately corrupted scratch copy of `state.json`/a scratch
    `owned_files` list (drift correctly caught in both cases), then
    confirmed via `git status --porcelain` on `.sdlc/state.json` and
    `.claude/hooks/sdlc-path-check.mjs` that neither real file was ever
    modified. All four `verification_commands` (backend tsc/vitest,
    frontend tsc/build) ran clean.
  - Phase SS5 (bootstrap commands) is now complete. SS6.1 (dogfood: run
    one real backlog item through the loop) is next — it depends on all
    of SS0-SS5, all of which are now done.

- **2026-08-31** — `/continue-development`: implemented **SS4.4**, the
  Continue-or-stop rewrite (run-budget stopping conditions) — **completing
  Phase SS4**. Self-referential like SS4.1-4.3; hand-authored packet
  directly against `docs/sdlc/schemas/task-packet.schema.json`,
  independently validated with `jsonschema.validate()` before spawning.
  - Followed the established active-packet lifecycle: confirmed a clean
    tree (only the new packet file untracked), wrote `.sdlc/active-packet`
    containing `SS4.4`, spawned `subagent_type: implementer` with the full
    packet pasted inline, accepted the completion report, then removed the
    pointer.
  - Verified independently rather than on the subagent's report alone:
    reran `git diff --stat` and read the full diff. Confirmed the change is
    confined to exactly the "Continue or stop" subsection (65 insertions,
    8 deletions), with the closing summary/prompt structure and the
    genuine-blocker/merge-gate bullets preserved, and no other file
    touched.
  - This task did not itself qualify for SS4.3's strong-verification tier
    (a command-file prose edit, no auth/persistence/deploy/credential/
    device angle) — orchestrator spot-check was correct and sufficient,
    per the very rule SS4.3 wrote.
  - Phase SS4 (orchestrator loop rewrite: SS4.1 Resume, SS4.2 Delegate,
    SS4.3 Verify, SS4.4 Continue-or-stop) is now fully done. Next up is
    Phase SS5 (`sdlc-doctor` command, SS5.1), then Phase SS6 (dogfood).

- **2026-08-31** — `/continue-development`: implemented **SS4.3**, the
  Verify-section rewrite (routing high-risk tasks to the SS1.2 verifier
  agent). Self-referential like SS4.2 — no plain-text plan-entry file
  existed that wouldn't have required handing the implementer the plan
  itself, so the packet was hand-authored directly against
  `docs/sdlc/schemas/task-packet.schema.json` and independently validated
  with `jsonschema.validate()` before spawning (not just trusted to parse).
  - Followed the now-established active-packet lifecycle from SS4.2's own
    row: confirmed a clean tree (only the new packet file untracked), wrote
    `.sdlc/active-packet` containing `SS4.3`, spawned
    `subagent_type: implementer` with the full packet pasted inline,
    accepted the completion report, then removed the pointer.
  - Verified independently rather than on the subagent's report alone:
    reran `git diff --stat` and read the full diff. Confirmed the change is
    confined to exactly the "Verify" subsection (73 insertions, 1 deletion)
    with the prior spot-check prose preserved verbatim inside a new
    "Default path (no verifier)" branch, and no other file touched.
  - This task itself did not qualify for its own strong-verification tier
    (a command-file prose edit, no auth/persistence/deploy/credential/
    device angle) — orchestrator spot-check was the correct path per the
    very rule this task just wrote, and that's what was used.
  - Phase SS4 continues: SS4.4 (run-budget stopping conditions) is next.

- **2026-08-31** — `/continue-development`: implemented **SS4.2**, the
  Delegate-section rewrite. This is the first task where the packet itself
  was hand-authored rather than run through
  `scripts/sdlc/generate-task-packet.mjs` — the task is self-referential
  (editing the very command this session runs under) and there was no
  existing plan-entry text file to feed the generator without first
  extracting it from `IMPLEMENTATION_PLAN.md`, which the orchestrator
  isn't supposed to hand the implementer anyway. Wrote the packet directly
  against `docs/sdlc/schemas/task-packet.schema.json`, validated it with
  `jsonschema.validate()` before spawning (independently, not just trusting
  it parsed), and put the full condensed design/plan context — everything
  from design-spec §2a/§3/§5/§7/§10 an implementer would need — into the
  packet's own `objective` field rather than listing `design-spec.md` in
  `read_paths`, since `implementer.md` says it must never read that file;
  worth noting the SS2.2 packet had listed it as a read path anyway, which
  in hindsight looks like an inconsistency in that earlier packet rather
  than a precedent to repeat.
  - Followed the same active-packet bootstrap procedure this task itself
    was defining: confirmed a clean tree first (only the just-created
    packet file was untracked), wrote `.sdlc/active-packet` containing
    `SS4.2`, spawned `subagent_type: implementer` with the packet pasted
    inline, and removed the pointer after accepting the completion report
    — exactly the lifecycle the new Delegate text now documents for future
    runs.
  - Verified independently rather than on the subagent's report alone:
    reran `git diff --stat` and read the full `git diff` myself. Confirmed
    the change is confined to exactly the Delegate subsection (117
    insertions, 5 deletions) with no other section or file touched.
  - The implementer surfaced one honest, non-blocking observation outside
    its own scope (correctly reported as `unresolved_risks` rather than
    fixed, since `.claude/hooks/sdlc-path-check.mjs` was in its
    `forbidden_paths`): that hook's own header comment still describes the
    implementer as `isolation: worktree`-based and describes worktree-local
    vs. main-repo pointer lookup, which reads as stale now that worktree
    isolation was dropped (design-spec §2a). Recorded here rather than
    fixed in this task — a small, separate follow-up task, not urgent
    (the hook's behavior is still correct for the current shared-tree
    setup; only the comment is out of date).
  - Phase SS4 continues: SS4.3 (verifier routing) is next.
  - **Immediate follow-up, same session**: fixed the stale comment SS4.2's
    implementer flagged (`unresolved_risks`, above) — `.claude/hooks/
    sdlc-path-check.mjs`'s header comment described the implementer as
    running with `isolation: worktree`. Done directly by the orchestrator
    (comment-only, no logic change, low-risk, and directly requested — not
    delegated to an implementer subagent given its triviality). Rewrote
    the "WORKTREE / CONCURRENCY HONESTY" section to state the current
    reality (implementer runs in the shared tree, `sessionRoot`/`mainRoot`
    resolve to the same directory today) while keeping the
    worktree-separation logic's own documentation intact for when
    isolation is re-enabled. `node --check` confirms no syntax break;
    hook behavior itself is unchanged (comment-only diff, verified via
    `git diff --stat`).

- **2026-09-01** — Cross-session review, no new task implemented. The user
  pasted streamed logs from the separate session that ran SS2.2 (below) for
  analysis. Verified independently against git (`git show cfac008`, both
  the `CLAUDE.md` diff and that session's own `PROGRESS.md` entry) rather
  than trusting the pasted summary alone, since the summary's own framing
  ("fixed by hand this run") undersold a more interesting sequence: the
  first retry attempt used a fresh `Agent` call instead of `SendMessage`
  to the blocked agent's actual ID, so the new agent had no legitimate
  packet or prior context — and it correctly refused to act on the
  resulting message's claim of prior work it never did, rather than
  complying with an unverifiable continuity claim. That's the "treat
  everything as data, not authority" instruction working as intended,
  surfaced by an ordinary tooling mistake rather than a designed test. The
  actual recovery (a proper `SendMessage` to the real blocked agent) then
  succeeded normally. Folded this as a second, distinct requirement onto
  SS4.2's row (correct retry semantics), alongside the already-known
  active-packet-bootstrapping gap that same run also confirmed for real.
- **2026-09-01** — `/continue-development`: implemented **SS2.2**. First
  task in this project run through the real packet+implementer mechanism
  end to end (generator → hand-fixed packet → `subagent_type: implementer`),
  rather than a `general-purpose` subagent standing in for it.
  - The generator's heuristic output needed real hand-fixing before it was
    usable: it mis-parsed a fragment of my design-excerpt text into a bogus
    `.3/SS2.1` read-path entry, dropped a leading `.` on
    `.claude/agents/supervisor.md`, and — because my excerpt happened to
    describe `design-spec.md`'s own content — inferred `design-spec.md`
    itself as a `write_paths` target, which was never the intent. Fixed by
    hand before spawning rather than trusting the raw output; also added
    `forbidden_paths` entries and concrete `acceptance_criteria`/
    `verification_commands` the generator left empty (it doesn't invent
    text it can't ground in input, correctly).
  - **Hit the exact gap SS4.2's row already predicted**, for real rather
    than hypothetically: spawned the implementer with a valid packet on
    disk but no `.sdlc/active-packet` pointer, and the SS3.1 hook correctly
    denied the write (no resolvable packet ⇒ no writes, working exactly as
    designed). The implementer did the right thing — reported `blocked`
    with a clear explanation instead of working around it. Fixed by writing
    `.sdlc/active-packet` (single line, `SS2.2`) myself before resuming the
    same agent, then removed it after the task finished. This is real
    confirmation that SS4.2 needs to do this automatically as its first
    action before every spawn, not optional polish.
  - **Also hit a mechanical mistake worth recording**: my first "resume"
    attempt used the `Agent` tool again instead of `SendMessage`, which
    spawned a brand-new agent with no memory of the blocked run instead of
    continuing it — it correctly refused to act on a claimed prior context
    it didn't actually have (treated the unfamiliar continuity claim as
    exactly the kind of thing it's supposed to distrust). Correct fix:
    `SendMessage` to the original agent's ID, not a fresh `Agent` call, to
    actually resume a specific in-flight subagent.
  - Diff spot-checked directly (`git diff -- CLAUDE.md`, docs-only change,
    well below the strong-verification floor — no verifier agent needed):
    all four acceptance criteria hold, original wording preserved verbatim
    inside the addition, no other file touched.
  - Phase SS4 is next; SS4.2 in particular should treat this session's two
    gaps (active-packet bootstrapping, resuming an agent by ID rather than
    respawning) as settled requirements, not open questions.

- **2026-08-31** — `/continue-development`: implemented **SS4.1**, the
  first Phase SS4 task, and a self-referential one — it rewrites the
  actual `continue-development.md` skill this session runs under. The edit
  only takes effect on the *next* invocation, so there was no risk to this
  run, but it's the highest-consequence file the framework has touched so
  far, so it got an unusually precise task packet and a full manual diff
  review before accepting it (not just a spot-check).
  - **Caught my own mistake mid-flight**: spawned the implementer without
    first setting up an active task packet — exactly the SS4.2 problem
    this framework itself flagged two entries ago. Working tree was still
    clean when I noticed, so I wrote a real `SS4.1.packet.json` and
    `.sdlc/active-packet` pointer before the agent's first write landed,
    verified the hook actually resolved and allowed/denied correctly with
    synthetic probes, then removed both scaffolding files after the task
    finished (they were never meant to persist — SS4.2 is what makes this
    automatic).
  - The rewrite correctly distinguishes sdlc-tracked work (only this
    framework itself, today) from legacy proposal-folder work (everything
    else) rather than assuming every work item has a `.sdlc/state.json`
    entry — verified by having the implementer actually read `state.json`
    and confirm its `work_items` array has exactly one entry before writing
    the detection logic, not asserting it from memory.
  - For "content hash per document," the implementer correctly recognized
    Claude Code's own changed-on-disk file tracking as the real mechanism
    to lean on rather than inventing a manual mtime check — a better answer
    than what the task packet even suggested as a fallback.
  - Independently verified: diff is confined to exactly one hunk (the
    "Resume in-progress work" section, 43 insertions/12 deletions);
    grepped for stale step-number cross-references after the renumbering
    (5→6→7) and found none.

- **2026-08-31** — First **real (non-synthetic) use** of the approval-record
  mechanism (SS2.1), and a genuine, not test, `push_to_remote` operation:
  the user directly asked to push local `master` (already containing the
  merged lyrics-integration work) to `origin/master`, to test it while this
  session continued unrelated sdlc-supervisor work. Per `CLAUDE.md`'s
  override carve-out, dispatched to the `supervisor` subagent rather than
  refused or bounced back — a live, specific instruction is exactly what
  that carve-out exists for. Local tests were run for real first (backend
  387/387, frontend build clean), version/changelog were already
  consistent, and the push was a clean fast-forward (verified independently
  via `git fetch` + `git rev-parse origin/master` after the fact, not taken
  on the subagent's word).
  - **Two real gaps found by actually using the mechanism, not by testing
    it synthetically:**
    1. `supervisor` has no worktree isolation either (only the implementer
       ever did, and that's since been dropped anyway — see the earlier
       entry). Checking out `master` to push therefore swapped the *entire
       shared working tree*'s files, including this session's own
       `docs/sdlc/design-spec.md`, over to `master`'s older content for the
       duration. Not data loss (everything is safe in git history) but a
       real hazard worth remembering: **do not run further sdlc file edits
       while a `supervisor` operation is in flight in the same session** —
       wait for it to finish and confirm the branch before continuing.
    2. `.sdlc/approvals/` only exists on this unmerged branch, not on
       `master` — so the record itself couldn't be committed to either
       branch mid-operation without violating the instruction's own
       boundaries (don't pollute `master`'s history with sdlc-framework
       files; don't touch `feature/sdlc-supervisor`). The subagent handled
       this well: wrote the record directly to disk, uncommitted, and
       **flagged the gap honestly in the record's own `notes` field**
       rather than silently skipping it. Reconciled after the fact by the
       orchestrator: verified the record independently, found and fixed a
       schema violation (an extra `$schema` field the schema's own
       `additionalProperties: false` forbids — the same bug class SS1.1
       found in a completion report), then committed it into this branch's
       history now that the working tree is back on `feature/sdlc-supervisor`.
  - Real design implication for `init-sdlc` (§9, not yet built): a
    project's `.sdlc/` control files need to exist on **every** branch that
    a release operation might check out to, or this exact gap recurs every
    time. Worth a note there when that command gets built.

- **2026-08-31** — `/continue-development`: while scoping SS4.2, the user
  asked whether `isolation: worktree` was actually earning its keep given
  `max_concurrent_implementers: 1` — a genuine design question, worked
  through in conversation rather than delegated, since it required judgment
  about tradeoffs, not implementation.
  - Separated what worktree isolation was actually doing into two different
    properties: concurrency safety (moot at N=1) and isolation from the
    orchestrator's/user's own live workspace (still real at any N). Named
    concrete costs too: a measured `npm install` per worktree (~241
    packages, every implementer run so far), and that it was the direct
    cause of the active-packet-propagation problem on SS4.2's row — a
    shared workspace has no such problem, since the pointer file the
    orchestrator writes is already in the one tree the implementer uses.
  - **The deciding fact came from reading the `Agent` tool's own parameter
    schema directly** rather than guessing or spawning a test agent: it has
    exactly six parameters (`description`, `isolation`, `model`, `prompt`,
    `run_in_background`, `subagent_type`) and no environment-variable
    channel at all. That closes off "seed a fresh worktree via
    `SDLC_ACTIVE_PACKET`" as an option definitively, not empirically — there
    is no code path by which it could ever have worked. The remaining
    alternative (implementer self-bootstraps its own pointer file) hit a
    real chicken-and-egg problem: that very write isn't in any task
    packet's `write_paths`, so the SS3.1 hook would deny it too.
  - **Decision: drop `isolation: worktree` for now.** Removed from
    `implementer.md`'s frontmatter, with a new section explaining why and
    telling the implementer to be more careful about narrow git operations
    now that there's no filesystem isolation backing it up. Documented as a
    dated addendum in `design-spec.md` §2a (not a silent rewrite of the
    approved v2 decision) with the full reasoning, and reversed the
    Implementer row's "worktree-isolated" claim in §2's role table.
    `IMPLEMENTATION_PLAN.md`'s SS1.1 notes and this file's SS1.1/SS4.2 rows
    updated to point at the reversal rather than read as contradicting it.
    Two now-stale Open Questions (whether `isolation: worktree` and
    pre-execution hook denial are even supported) marked resolved — both
    were confirmed working during SS1.1/SS3.1, this reversal is a separate,
    later decision layered on top of an already-answered question.
  - Real consequence for SS4.2, now on its row: the delegate step must
    refuse to spawn an implementer when the orchestrator's own working tree
    isn't clean (`git status --porcelain` non-empty) — that's what recovers
    the live-workspace protection worktree isolation used to provide for
    free. `sdlc-path-check.mjs`'s worktree-detection logic is left in place,
    unused for now, not deleted — it becomes load-bearing again if isolation
    is ever re-enabled.

- **2026-08-31** — `/continue-development`: implemented **SS3.1**, the real
  `PreToolUse` path-enforcement hook (replacing the committed spike). This
  was the highest-stakes task so far, because its config ships in a
  **committed** `.claude/settings.json` and is therefore live for ordinary
  sessions in this repo, not just implementer subagents.
  - **The discovery that made it safe**: the `PreToolUse` hook input JSON
    carries `agent_type` (verified live by logging raw stdin — observed
    `"implementer"` vs `"general-purpose"`). Enforcement is scoped to
    `agent_type === "implementer"`; everything else returns before any
    packet logic runs. Without that field this would have had to be a
    global hook, and a strict fail-safe would have been unshippable.
  - **Fail-safe**: non-implementers allow; an implementer with no resolvable
    packet is *denied* (no scope contract must not mean unlimited scope).
    The blast radius of that strictness is confined to implementer agents.
  - **Independent verification by the orchestrator, not taken on the
    subagent's word**: drove the hook directly with synthetic inputs. A
    first pass appeared to show a Windows backslash normalization hole —
    exactly the "silently no-ops on a backslash mismatch" failure §8 warns
    about — but that was **my own test harness** (bash `echo` mangling
    escapes plus a dropped env var), not the hook. Retested via a proper
    Node harness with no shell escaping: forward-slash, backslash, mixed
    separators, and lowercase drive letters all produce identical correct
    decisions. Also confirmed a normal session and a no-`agent_type` caller
    both pass through, and that out-of-repo writes are denied.
  - **A real interaction during testing, worth reading — corrected below
    from an earlier mischaracterization.** The SS3.1 subagent (itself a
    `general-purpose` agent spawned by the orchestrator) spawned two
    `implementer` subagents as part of running the acceptance criteria's
    own verification steps. It flipped the kill switch off via `Bash` (the
    designed mechanism, for the designed kill-switch test) and then, via
    `SendMessage`, asked its *own first implementer child* — already denied
    once — to retry the write. That implementer **refused**, on the grounds
    that a guardrail being removed by "a party who isn't my user," followed
    by a request to walk through it, is an escalation pattern to decline —
    it had no way to tell this request traced back to a legitimate parent
    test plan rather than an unrelated actor exploiting the flip. (An
    earlier version of this entry called the requester a "peer agent";
    it was actually this implementer's own parent, running an
    orchestrator-instructed test step, not a rogue third party. Corrected
    2026-08-31 after the user asked who could plausibly have done this,
    since sub-agents can't normally spawn further sub-agents — the
    `general-purpose` SS3.1 agent could and did, per its full tool grant.)
    Nothing here was actually a security incident, but the underlying
    finding stands: an implementer has no reliable way to distinguish its
    own orchestrating context from an unrelated requester, so it defaults
    to refusing — and that same blind spot is what makes the kill switch's
    silence a real gap, now recorded under Open Questions.
  - Verified before committing: `enforce: true` restored, zero leftover
    worktrees/branches, no debug residue in the hook, `project.yaml` valid
    against the updated schema.
  - **SS4.2 now has a hard prerequisite** recorded on its row: the delegate
    step must establish an active packet when spawning, or every implementer
    is denied all writes. Do not start SS4.2 without reading that note.

- **2026-08-31** — `/continue-development`: implemented **SS1.3 + SS2.1**
  (handed to a single subagent, deliberately — SS2.1's acceptance criteria
  requires `supervisor.md` to reference the approval mechanism, so splitting
  them would only have manufactured a round-trip). Verified independently
  rather than on the subagent's word: confirmed the `supervisor.md` diff is
  genuinely additive (`git diff --numstat` → 49/0) with the user-override
  carve-out intact, confirmed the example approval's `commit_sha` matches
  the real HEAD it claims, and ran my own **negative controls** against the
  schema (tried to mint a standing approval with `single_use: false`, and a
  `consumed: true` record with no `consumed_at`/`consumed_by` — both
  correctly rejected), since a happy-path validate alone wouldn't show the
  constraints actually bite.
  - The genuinely important part of this pair is what it *doesn't* do: the
    approval record is a written-down fact about something a human already
    said, **not** a permission slip the user must produce before an agent
    will act. Both `supervisor.md`'s new section and
    `docs/sdlc/APPROVAL_RECORDS.md` state outright that a live instruction
    from the owner *is* the approval — write the record and proceed, never
    ask them to produce one first, and "no record found" is never grounds
    for refusing someone asking right now. That was the main regression
    risk in this task and it was handled correctly.
  - Two cross-cutting findings recorded under Open Questions (CLAUDE.md's
    "enforced-by-policy, not technical" line going stale once SS3.1's hook
    lands; and whether `maxTurns` is a real frontmatter key), plus concrete
    prep notes for SS2.2 on its own row.
  - SS3.1 was running concurrently and is **not** included in this commit.

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
