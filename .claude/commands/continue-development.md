---
description: Look at what's already in progress across the project and resume it; if nothing's in progress, pull from the backlog (or propose new backlog items via project analysis) and set up a full plan/tracking/subagent framework for it.
argument-hint: "[optional — a task ID/branch, or a free-text steer like 'work on backlog item 4, there's a draft spec at docs/proposals/x/DESIGN_SPEC.md on feature/x, pick up from there'; defaults to auto-detecting in-progress work]"
---

You are acting as **supervisor**, not implementer, for this project. Your
job each time this command runs is: figure out what development is already
in flight and resume it, or — if nothing is in flight — help pick (or
invent) the next thing to work on, scaffold it properly, and then drive it
forward by delegating to subagents. You do not write application code
yourself except to fix something small a subagent got wrong.

This command generalizes the old proposal-specific `continue-*` commands
(e.g. `continue-jukebox`, `continue-landscape`) into one entry point that
works for any in-progress or future work, not just one hardcoded feature.

## 0. Orient — what's already moving?

Check, in order, and stop at the first one that gives you a clear answer:

1. **`$ARGUMENTS`.** Everything typed after the command name arrives here
   as free text — it can be as terse as a task ID (`L2.1`) or branch name,
   or a full sentence of steering context: "work on backlog item 4, there's
   a draft design spec at `docs/proposals/x/DESIGN_SPEC.md` on
   `feature/x`, pick up from there." Parse it for whatever's actually in
   it — a backlog item reference, a branch to check out, a specific
   document to read (an existing draft spec/plan, even an unfinished one
   not yet following this project's usual proposal layout), explicit scope
   or priority guidance, anything the user chose to tell you up front. Act
   on all of it rather than pattern-matching only the first identifier you
   recognize and discarding the rest. If it references a document, read
   that document as part of orienting, before deciding what to do next —
   don't ask the user to re-explain something they already pointed you at.
   If it references a branch or backlog item that doesn't actually exist,
   stop and ask rather than guessing what they meant; if it's ambiguous
   which of several matches they mean, ask instead of picking one. Once
   `$ARGUMENTS` has pointed you at a target, skip straight to step 1 below
   with it (or straight to "Scaffold new work" if it's clearly pointing at
   new/not-yet-tracked work, like a draft spec that has no `PROGRESS.md`
   yet).
2. **Unmerged feature branches.** `git branch --no-merged master` (or the
   repo's actual default branch). For each, check whether it has a
   `docs/proposals/<slug>/PROGRESS.md` — if so, that file's task table is
   the source of truth for whether it's actually still in progress (has any
   `todo`/`in-progress`/`blocked` row) or just merged-pending-cleanup /
   fully done-but-unmerged.
3. **Root `PROGRESS.md`'s Post-Launch table** (or equivalent — whatever
   this project's root progress tracker calls its lightweight
   non-phased-work section). Any row marked `todo`/`in-progress`/`blocked`
   is in-flight work that never got a full proposal folder.
4. **Uncommitted or stashed changes** on the current branch — `git status`,
   `git stash list`. If there's real in-progress work sitting there
   unstaged/uncommitted, that's a strong signal too; don't ignore it in
   favor of switching to something else without at least flagging it to the
   user.

Collect everything you find. If there's exactly one clear candidate, resume
it (go to step 1 of "Resume in-progress work" below). If there are several,
ask the user which one via `AskUserQuestion` rather than guessing priority.
If there's genuinely nothing in flight, move to "Pick new work" below.

---

## Resume in-progress work

This mirrors what a proposal-specific supervisor command already does —
apply the same loop generically.

**Load full context once.** Unlike the subagents you delegate to (see
"Delegate" below, which deliberately get only a narrow task packet), *you*
— the orchestrator — need the whole picture: cross-task drift, a change
that's locally correct for one task but globally wrong for the plan, an
acceptance criterion elsewhere in the plan that a single task's own Notes
don't mention. Reading only a task's own narrow slice (the old approach)
was the wrong economy for this role — narrow-context discipline belongs to
what you hand a subagent, not to what you read yourself.

1. Checkout the branch if you're not already on it (if the branch doesn't
   exist despite tracking docs referencing it, stop and ask the user — do
   not create it yourself in this situation, something is inconsistent).
2. Determine which tracking convention this work uses: does
   `.sdlc/state.json` contain a `work_items[].id` matching it? If so, this
   is **sdlc-tracked** work. If not — true for most work today, e.g.
   anything under `docs/proposals/<slug>/` — this is a **legacy
   proposal-folder** work item, tracked entirely via its own
   `DESIGN_SPEC.md`/`IMPLEMENTATION_PLAN.md`/`PROGRESS.md`, with no
   corresponding `.sdlc/state.json` entry. Don't add one just to unify
   this — migrating every proposal folder onto `.sdlc/state.json` is a
   separate, not-yet-decided piece of work and out of scope here.
3. Read, in full, once for this run:
   - **sdlc-tracked**: the complete `docs/sdlc/design-spec.md`, the
     complete `docs/sdlc/IMPLEMENTATION_PLAN.md`, and the complete
     `.sdlc/state.json`.
   - **legacy proposal-folder**: the complete
     `docs/proposals/<slug>/DESIGN_SPEC.md`, the complete
     `docs/proposals/<slug>/IMPLEMENTATION_PLAN.md`, and the complete
     `docs/proposals/<slug>/PROGRESS.md` — this convention's task table and
     session log already are the state; there is no separate state file to
     additionally read.
4. Don't re-read these documents before every task you pick within this
   same run — that's the redundant-reread failure mode this replaces the
   old narrow-read instruction with. Rely on Claude Code's own
   changed-on-disk tracking: it will tell you when a file you've already
   read has since changed on disk, and that notice — or a subagent's report
   saying it touched one of these docs, or any other concrete signal — is
   your cue to re-read that specific document, and only that one. Absent
   such a signal, treat the copy you loaded in step 3 as still current;
   don't re-open it "just in case" before picking the next task.
5. Pick the task: the one `$ARGUMENTS` named, or the first `todo` task in
   the table you already loaded, respecting phase order and each row's
   `Notes` dependency.
6. If the task's Notes flag a dependency that isn't `done`, or something
   only the user can decide (a visual taste call not already settled by the
   design spec, access to real hardware, credentials, an ambiguous product
   decision), stop and ask the user rather than guessing or stubbing around
   it.
7. Delegate, verify, track, and continue/stop exactly per the **"Delegate →
   Verify → Track → Continue-or-stop" loop** below.

---

## Pick new work (nothing was in progress)

### If the backlog has actionable items

Read `BACKLOG.md` (repo root). For each item, note its status
(`idea`/`needs research`/`ready`/`in progress`/`done`) — `in progress`
items should already have been caught in Orient step 2/3 above via their
branch/tracking docs; if one wasn't, treat that as a sign its tracking is
stale and flag it to the user rather than silently trusting the backlog
label.

Present the actionable items (`idea`, `needs research`, `ready` — skip
`done`) to the user with `AskUserQuestion` and ask which to work on. Since
that tool allows at most 4 options, pick the up-to-4 most clearly
actionable/impactful items as options (favor `ready` over `idea`, and
smaller/less ambiguous scope over open-ended research items, since those
convert into working software faster) and mention in the question text how
many more exist beyond those shown. The user can always answer with
something else via the tool's built-in free-text option.

If the user picks a `needs research` item, do the research first (as a
normal step, not a subagent-delegated one — this needs your own judgment
and probably some web/codebase investigation) and update the backlog entry
with findings before scaffolding implementation.

Whenever the chosen item's analysis file is missing or still says "not yet
written" (see `BACKLOG.md`'s "Analysis files" section), writing it is the
first unit of work — before research-only follow-up, before a design spec,
before any code. That means genuinely scrutinizing the entry rather than
transcribing it: what problem it actually solves, whether it's worth the
cost, whether a simpler/different approach reaches the same goal, and
whether it's a good idea at all — a backlog entry is someone's raw idea,
not a pre-approved plan (see the Type legend: `enhancement` entries in
particular are explicitly not firm requirements). Once you have an initial
read on those questions, **stop and check in with the user via
`AskUserQuestion` (or a direct question, if free-form reaction fits
better) before writing the analysis file's final version** — share your
assessment and any alternatives you found, and let them confirm, correct,
or redirect. Only then finalize `analysis/NN-slug.md`. Don't skip this
checkpoint just because the item seems obviously fine — that's exactly the
case where a rubber-stamped analysis is least useful.

### If the backlog is empty or has nothing actionable

Do a lightweight analysis of the project to surface real candidates —
don't invent busywork. Useful sources, pick what's relevant to this
project's shape:
- Root `PROGRESS.md`'s Open Questions / known-gaps notes — anything marked
  as a deferred gap, "worth revisiting," or an accepted tradeoff.
- `grep`-able `TODO`/`FIXME`/`HACK` comments in the codebase.
- Stale or contradictory documentation (a doc describing behavior the code
  no longer has).
- Missing test coverage in an area that's changed a lot recently
  (`git log` churn vs. test file presence).
- Anything a recent session log entry flagged as a follow-up but never
  turned into a backlog item.
- If this is a user-facing app: obvious UX rough edges you can find by
  actually running it (a genuinely quick pass, not a full audit).

Turn what you find into 2-4 concrete, scoped backlog-item candidates (not
vague "improve performance" — something you could actually write an
implementation plan for). Add them to `BACKLOG.md` under the project's
existing item-numbering convention, status `idea`. Then present them to the
user via `AskUserQuestion` exactly as in the "actionable items" case above
— proposing them is not the same as deciding to build them; the user picks.

If the user declines everything you found, that's a valid outcome — stop
and say so rather than pushing a pick.

---

## Scaffold new work

Once a specific piece of work is chosen (from the backlog, or freshly
proposed and approved), set it up before delegating any implementation:

1. **Judge the size.** Small, well-scoped, low-ambiguity (a bug fix, a
   single well-understood feature, "add X the same way Y already works")
   doesn't need the full design-spec ceremony. Multi-component,
   architecturally significant, or genuinely ambiguous work does. When in
   doubt, undersize the ceremony rather than oversize it — a plan can grow
   a design-spec step later if it turns out to need one, but a skipped
   trivial fix shouldn't grow bureaucracy it doesn't need.

2. **Branch.** Create (or reuse, if one already exists for this item)
   `feature/<slug>` off the default branch. Everything for this work lives
   on that branch until it ships — don't work on the default branch
   directly for anything beyond the smallest one-file fix.

3. **Design spec (only for the "significant" tier).** Follow this
   project's existing proposals convention if it has one (check for a
   `docs/proposals/README.md` or equivalent process doc and follow it
   exactly — branch naming, file layout, and the human-review checkpoint
   it describes). Write `docs/proposals/<slug>/DESIGN_SPEC.md`: goals,
   non-goals, requirements, constraints, open questions — no
   file/class/API-level detail. **Stop here and get human review/sign-off
   on the design spec before writing the implementation plan** — this is a
   genuine judgment-call gate, not a formality to rubber-stamp past. Skip
   this whole step for the "small" tier — go straight to the implementation
   plan.

4. **Implementation plan.** Write `docs/proposals/<slug>/IMPLEMENTATION_PLAN.md`
   (or, for small work with no proposal folder, just enough of a task
   breakdown to hand to subagents — even a short flat list is fine; it
   doesn't need its own file if the work is a single task). Break the work
   into scoped tasks with IDs and acceptance criteria, phased only if the
   work genuinely decomposes into stages with real dependencies between
   them (foundation → feature → polish → verification, etc.) — a flat task
   list is better than invented phases for anything that doesn't need them.
   Mirror this project's existing ID conventions if it has one (e.g.
   `P<n>.<n>`, `L<n>.<n>`) or pick a short new phase-letter/prefix that
   doesn't collide with ones already in use.

5. **Progress tracking.** Write `docs/proposals/<slug>/PROGRESS.md` (or add
   a row to the root `PROGRESS.md`'s lightweight section for small work) —
   the task table and session log that the rest of this command's loop
   reads from. Follow the same table/session-log shape used elsewhere in
   this project's tracking docs, for consistency.

6. Immediately continue into the **"Delegate → Verify → Track →
   Continue-or-stop" loop** below — per the user's intent for this command,
   setting up the framework is not the finish line, driving it forward is.

---

## Delegate → Verify → Track → Continue-or-stop loop

This is the actual work loop, used identically whether you're resuming
existing work or driving freshly-scaffolded new work.

### Delegate

Which mechanism you use depends on which tracking convention the task
belongs to (see "Resume in-progress work" step 2 above for how to tell
sdlc-tracked from legacy proposal-folder work). The two paths are
deliberately different — do not blend them.

#### Legacy proposal-folder work (no `.sdlc/state.json` entry)

Unchanged from before. For the chosen task (or a small batch of
independent tasks — check dependency notes first), spawn one subagent per
task using the Agent tool (`subagent_type: general-purpose`, run in the
background unless you have nothing else to do while waiting). Independent
tasks in one batch go in a single message with multiple Agent calls.

Each subagent prompt must be **self-contained** and **narrow**:
- State the task ID and paste its full scope + acceptance criteria text
  (don't tell the subagent to go read the plan file itself).
- Paste the specific design-spec excerpt it needs, if any (don't tell it to
  go read the whole spec).
- Confirm which branch it's working on and list the specific files it
  should create or touch, inferred from the task text and this project's
  layout.
- Say explicitly: implement only this task's scope, don't expand it, don't
  touch the plan/progress/spec docs (you own those), and report back
  concisely — what it built, any decisions it had to make, and how it
  verified the acceptance criteria.
- Tell it to run typecheck/build/tests (whatever this project uses) and
  report the result rather than just asserting success. For a visual/UI
  task, tell it to verify per this project's own preview-tool conventions
  (e.g. `<when_to_verify>`/`<verification_workflow>` if defined) rather
  than asserting the result looks right — and to fall back to
  DOM/computed-style inspection via the browser tool's JS-execution
  capability if screenshot compositing isn't available in its session
  (a real, recurring limitation — don't let a subagent claim visual
  confirmation it didn't actually get).

Do not let a subagent read the plan/progress/spec docs — everything it
needs should already be in the prompt you wrote. This keeps subagent
context small and prevents drift/scope creep.

#### sdlc-tracked work (`.sdlc/state.json` has this task)

This path uses the sdlc-supervisor framework's task-packet + `implementer`
subagent mechanism instead of `general-purpose`. Follow it exactly, one
task at a time — never batch multiple sdlc-tracked tasks into concurrent
implementer spawns, even when their dependency notes would otherwise allow
it. `.sdlc/project.yaml`'s `budgets.max_concurrent_implementers` is `1`,
and only one `.sdlc/active-packet` pointer can exist at a time (see step 3
below), so there is no batching path here the way there is for legacy
work.

1. **Require a clean working tree first.** Run `git status --porcelain`.
   If it produces any output, stop — do not spawn an implementer. The
   implementer agent runs directly in this shared working tree, not an
   isolated worktree, so a dirty tree is the one thing standing between
   its edits and whatever uncommitted work (yours or the user's) is
   already sitting there. Surface the dirty state to the user and let them
   decide (commit, stash themselves, or explain what it is) rather than
   proceeding around it.
2. **Generate the task packet.** Run
   `scripts/sdlc/generate-task-packet.mjs` with `--task-id`,
   `--plan-entry-file`, and, if relevant, `--design-excerpt-file`/
   `--dependencies` (see the script's own header comment for exact usage).
   This writes `.sdlc/task-packets/<task_id>.packet.json`.
3. **Review and correct the generated packet before using it — do not
   trust it as-is.** The generator's `read_paths`/`write_paths` inference
   is a documented, honest heuristic operating purely on input text, not
   real code/semantic understanding, and it has previously produced wrong
   output that needed hand-correction (mis-parsing a design excerpt into a
   bogus read-path entry, dropping a leading `.` from a filename, and
   inferring a read-only doc as a write target, in one real prior case).
   Read through every field — `read_paths`, `write_paths`,
   `forbidden_paths`, `acceptance_criteria`, `verification_commands` — and
   fix anything wrong. In particular:
   - If the packet contains the literal string `"NEEDS_MANUAL_REVIEW"`
     anywhere, it is not ready — fill in the real paths by hand.
   - If any path is plainly wrong on inspection (missing leading `.`,
     wrong directory, a read-only doc listed as writable, etc.), fix it by
     hand.
   - When the heuristic's output needs substantial correction, it's fine
     to just write the packet file directly (matching
     `docs/sdlc/schemas/task-packet.schema.json`) instead of patching the
     generated one field-by-field.
   Never hand an implementer a packet you haven't actually reviewed.
4. **Write the active-packet pointer.** Before spawning, write
   `.sdlc/active-packet` in the repo root containing exactly the task's id
   and nothing else (a single line, e.g. `SS4.2`). The committed
   `PreToolUse` hook (`.claude/hooks/sdlc-path-check.mjs`) denies every
   `Edit`/`Write` call from the implementer unless it can resolve exactly
   one active packet, and this pointer file is the mechanism that
   resolves it for a single implementer running in the shared tree. Leave
   it in place for the duration of that implementer's work.
5. **Spawn the implementer.** Use the Agent tool with
   `subagent_type: implementer` (never `general-purpose` for sdlc-tracked
   work). Paste the **full packet JSON verbatim** into the spawn prompt —
   the implementer agent's own instructions say every invocation hands it
   exactly one task packet pasted into its prompt at spawn time; it does
   not read the packet file itself, and by its own rules it never reads
   `docs/sdlc/IMPLEMENTATION_PLAN.md`, `docs/sdlc/design-spec.md`, or
   `docs/sdlc/PROGRESS.md` directly. Don't tell it to go read the plan —
   that's not how it's built to work, and doing so wastes the turn on a
   refusal or a scope violation.
6. **Resuming, not restarting, a blocked or interrupted implementer.** If
   an implementer's completion report is `blocked`, or a run gets
   interrupted mid-task and needs to continue, resume it with
   `SendMessage` addressed to that exact agent's own id — it already has
   the full packet and context in its memory. Never spin up a brand-new
   `Agent` call that merely asserts prior progress ("you already did X,
   now do Y") — a fresh agent has no legitimate basis to verify such a
   claim and will correctly refuse it, wasting the spawn. If the original
   agent is genuinely gone (session ended, its id lost), the correct
   recovery is a brand-new `Agent` spawn with the complete packet pasted
   inline again, as a fresh attempt — never a message asserting
   unverifiable prior progress to a new agent.
7. **Scope-change requests are yours to judge, not auto-approve.** A
   completion report with `status: scope_change_requested` means the
   implementer determined it needed to read or write outside the packet's
   declared paths. You — not the implementer — have the full plan context
   needed to judge whether that's a real gap in the task's scope or the
   implementer overreaching. Never auto-approve it into more implementer
   work, and never silently ignore it either; decide on the merits and act
   (widen the packet and re-spawn/resume, or push back) accordingly.
8. **Drafting, not activating, expertise skills.** You may freely write a
   one-run inline instruction into an implementer's spawn prompt any time
   — no review needed, and it dies with that run if not reused. If you
   notice the *same* one-run instruction recurring across multiple tasks,
   you may draft (write to disk, but not enable, reference, or otherwise
   activate) a project-local expertise-skill file capturing it. Drafting
   is not activating: turning a drafted skill into something actually used
   in a run, or committing it into the project, requires a human check-in
   first — the same tier as a design-spec sign-off. Never activate a
   drafted skill unilaterally just because you drafted it.
9. **Retire the pointer once the task is settled.** After the task's
   completion report has been accepted (see Verify/Update-tracking below),
   delete `.sdlc/active-packet` so it doesn't linger and get mistaken for
   the next task's active packet. If the task is instead abandoned or left
   blocked, still remove or overwrite the pointer once you've decided what
   happens next — don't leave a stale pointer sitting there into the next
   task.

This mechanism is specific to sdlc-tracked work. Legacy proposal-folder
work keeps using the `general-purpose` path above unchanged — the
`implementer` agent is not (yet) a generic delegate target for arbitrary
proposal folders.

### Verify

When a subagent reports back, don't take "done" on faith:
- Spot-check the actual diff it produced against the acceptance criteria
  you gave it.
- Run anything cheap yourself if the subagent didn't already (typecheck, a
  quick browser check).
- If it's short of the mark, send it a follow-up via SendMessage with the
  specific gap, or fix it inline yourself if trivial (the one exception to
  "you don't write application code" — a small, precise correction to
  something a subagent got wrong is in scope for you directly).
- If a subagent's own verification method has a known blind spot (e.g.
  DOM/computed-style inspection can confirm dimensions but can't catch
  something that only looks wrong to a human eye scanning the whole page),
  say so explicitly in the tracking notes rather than overstating
  confidence — and take the user's own manual testing seriously as a
  distinct, higher-fidelity verification pass if they offer it.

### Update tracking

Once a task is genuinely done:
- Update its row in the relevant `PROGRESS.md`'s task table to `done`, with
  a one-line note if there's anything a future session should know.
- Append a session-log entry (newest on top) — what got done, what's next,
  anything non-obvious.
- If the task surfaced a new open question or blocker, record it.
- Stage and commit the task's changes with a message referencing the task
  ID. Don't push, don't merge to the default branch unless the user has
  explicitly said to — merging (and especially pushing) is a
  hard-to-reverse/shared-state action that needs a real go-ahead, not an
  assumed one, even if a previous session in this same body of work was
  told to merge. Don't commit if the working tree is unexpectedly messy —
  investigate first.

### Continue or stop

Move to the next `todo` task and repeat, batching independent tasks where
dependency notes make it safe. Stop and summarize for the user when:
- You hit a genuine blocker (a decision only the user can make, a
  real-hardware/credential/access dependency).
- A phase boundary is reached and it's a reasonable point for a sanity
  check (a visual change, a risky migration, anything worth eyeballing
  before building further on top of it).
- You've done a substantial batch of work and it's a reasonable point for
  the user to review — don't grind through every remaining task unattended
  in one go.
- The work is fully done and the only remaining step is merging to the
  default branch — treat that specifically as a stopping point requiring
  explicit go-ahead, not something to do automatically just because
  everything upstream of it succeeded.

**End every stopping point with:**
1. A short summary: tasks completed this run (with task IDs), current
   overall status against the full task table, and anything non-obvious a
   fresh session would need to know.
2. A ready-to-use prompt for continuing in a **fresh session** — since
   tracking docs always reflect current state, this is simply:

   > `/continue-development` (no branch-switching needed — it auto-detects
   > in-progress work)

   If you stopped mid-task or on a specific blocker, name it explicitly
   instead so the next session doesn't have to rediscover it, e.g.
   `/continue-development L2.1`.
