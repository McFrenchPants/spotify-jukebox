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

## Status: Phases SS0-SS3 done. SS4.1/SS2.x done; SS4.2 next (Delegate rewrite).

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
| SS4.2 | Delegate rewrite (task packets, implementer agent) | todo | depends on SS1.1, SS0.3. **Hard requirement from SS3.1, simplified 2026-08-31:** with the shipped hook config and no active-packet pointer present, an implementer agent is denied *all* `Edit`/`Write` (deliberate fail-safe: no scope contract ⇒ no writes). Originally this looked complicated because implementers ran worktree-isolated and nothing seeds a fresh worktree — but `isolation: worktree` has since been dropped (design-spec §2a), so this is now trivial: the delegate step just writes `.sdlc/active-packet` (or sets a single `state.json` lease) in the shared tree *before* spawning, same tree the implementer will run in, no propagation problem. **New requirement introduced by dropping worktree isolation**: the delegate step must also refuse to spawn an implementer when the orchestrator's own working tree isn't clean (`git status --porcelain` non-empty) — this is what recovers the "don't let an implementer touch the orchestrator's/user's own uncommitted state" property that worktree isolation used to provide for free. **Second requirement, confirmed 2026-09-01 by SS2.2 actually hitting this** (see that row and the session log below): correct retry semantics after fixing a blocked implementer must be specified explicitly, not left to be discovered live. The right recovery is either `SendMessage` to the specific blocked agent's own ID (its context already has the original packet), or a brand-new `Agent` call with the complete packet pasted inline again — **never** a fresh `Agent` call that references prior context by claim rather than either resuming the real agent or resupplying the packet. A fresh agent has no legitimate basis to trust an unverifiable "you already did X" message, and correctly refuses it — which is the right behavior, but means the common recovery mistake (spawn-again-and-reference-history) doesn't just fail quietly, it produces a second wasted agent and a confusing refusal. SS4.2 should make this explicit in the delegate rewrite's own instructions, not assume it's obvious. |
| SS4.3 | Verify rewrite (verifier routing) | todo | depends on SS1.2 |
| SS4.4 | Run-budget stopping conditions | todo | depends on SS0.1 |
| SS5.1 | `sdlc-doctor` command | todo | depends on SS0.1, SS0.2 |
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
