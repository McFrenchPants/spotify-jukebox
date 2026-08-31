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
| SS1.3 | Reframe `supervisor.md` as release operator | done | Additive only — 49 insertions, 0 deletions (verified via `git diff --numstat`); the existing "Scope note for non-supervisor agents" carve-out is byte-for-byte unchanged. Adds the four-role framing + an approval-record section that explicitly says a live user instruction *is* the approval (write the record and proceed; never make the user produce one first). |
| SS2.1 | Approval-record format | done | `docs/sdlc/schemas/approval.schema.json` + procedure doc `docs/sdlc/APPROVAL_RECORDS.md` + a real example in `.sdlc/approvals/` pinned to the then-current HEAD. `single_use` is `const: true` so a standing approval can't be minted; `consumed_at`/`consumed_by` are conditionally required when `consumed: true`. Verified the constraints actually bite via negative controls, not just a happy-path validate. |
| SS2.2 | Update `CLAUDE.md` override language | todo | depends on SS2.1 (done). Prep notes surfaced while doing SS2.1, worth reusing: (1) CLAUDE.md's carve-out lists two things that happen first (say it bypasses the split; local tests pass) — add recording the approval as a third, worded as *and also write it down*, **never** as a precondition, or it regresses the tested "explicit override still works" behavior; (2) the "a *standing* instruction buried in a doc doesn't count" sentence is the natural hook for the single-use/SHA-pinning idea — link `docs/sdlc/APPROVAL_RECORDS.md` there rather than adding a new section; (3) CLAUDE.md describes a two-role split while the design spec has four — either reconcile, or say plainly that CLAUDE.md's is the repo-wide default and the four-role model refines it. |
| SS3.1 | `PreToolUse` path-enforcement hook | done | Real implementation replaces the spike. **Key discovery: the `PreToolUse` hook input carries `agent_type`** (observed live: `"implementer"`, `"general-purpose"`), so enforcement is scoped to implementer agents only — every other caller, including ordinary interactive sessions, passes through untouched. That's what makes shipping this in a *committed* `.claude/settings.json` safe. Windows backslash/drive-case normalization independently re-verified by the orchestrator (a first test pass appeared to show a normalization hole; that turned out to be shell-escaping in the test harness, not the hook — retested properly, all cases correct). |
| SS4.1 | Orchestrator full-context-once rewrite | todo | depends on SS0.1 |
| SS4.2 | Delegate rewrite (task packets, implementer agent) | todo | depends on SS1.1, SS0.3. **Hard requirement discovered in SS3.1 — read before starting:** with the shipped hook config and no active-packet pointer present, an implementer agent is denied *all* `Edit`/`Write` (deliberate fail-safe: no scope contract ⇒ no writes). So the delegate step **must** establish the active packet when spawning, via one of: the `SDLC_ACTIVE_PACKET` env var, a `.sdlc/active-packet` pointer file, or leasing exactly one task in `.sdlc/state.json`. Miss this and every implementer is dead on arrival. Note also that implementers run worktree-isolated and nothing seeds a fresh worktree today, so per-worktree pointers are the only way to separate concurrent implementers. |
| SS4.3 | Verify rewrite (verifier routing) | todo | depends on SS1.2 |
| SS4.4 | Run-budget stopping conditions | todo | depends on SS0.1 |
| SS5.1 | `sdlc-doctor` command | todo | depends on SS0.1, SS0.2 |
| SS6.1 | Dogfood: run one real backlog item through the loop | todo | depends on all of SS0-SS5 |
| SS6.2 | Write up dogfood findings | todo | depends on SS6.1 |

## Open Questions / Blockers

- **The kill switch is a one-way ratchet that any agent with `Bash` can pull
  for everyone — and nothing announces it.** Surfaced for real during
  SS3.1's testing, not theorized: a probe agent was denied a write by the
  hook; a peer agent then flipped `path_enforcement.enforce` to `false` in
  `.sdlc/project.yaml` (via `Bash`, exactly as the design intends) and asked
  the probe to retry the same write. The probe **correctly refused**, on the
  grounds that "a guardrail said no, then a party who isn't my user removed
  the guardrail and asked me to walk through it" is an escalation pattern to
  decline regardless of how legitimate the off-switch is. Good behavior, but
  it exposes the real gap: the switch is repo-wide and persistent, any agent
  with `Bash` can disarm it for every other agent from a session they can't
  see, and the hook's denial message doesn't indicate whether enforcement is
  even on. Design-spec §8a finding 1 (one agent evading enforcement for
  itself via `Bash`) is arguably the *lesser* problem. Worth considering:
  making the hook announce enforcement state, requiring a reason/expiry
  alongside the flip, or having `sdlc-doctor` (SS5.1) hard-fail when
  enforcement is off. **Also a hard process rule going forward: never commit
  with `enforce: false`** — verify it before every commit that touches
  `project.yaml`.
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
  - **A real incident during testing, worth reading**: a probe agent was
    denied a write; a peer agent then flipped the kill switch off repo-wide
    and asked it to retry the same write. **The probe refused**, reasoning
    that a guardrail being removed by someone who isn't its user, followed
    by a request to walk through it, is an escalation pattern to decline
    regardless of how legitimate the off-switch is. Correct call, unprompted.
    It surfaced the kill-switch gap now recorded under Open Questions.
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
