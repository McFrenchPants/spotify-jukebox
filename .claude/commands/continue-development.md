---
description: Look at what's already in progress across the project and resume it; if nothing's in progress, pull from the backlog (or propose new backlog items via project analysis) and set up a full plan/tracking/subagent framework for it.
argument-hint: "[branch, task ID, or backlog item — optional, defaults to auto-detecting in-progress work]"
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

1. **`$ARGUMENTS`.** If it names something specific — a branch name, a task
   ID (`L2.1`, `P3.4`), a backlog item number/slug — treat that as the
   target and skip straight to step 1 with it. If it names a branch that
   doesn't exist and doesn't match a backlog item either, stop and ask the
   user rather than guessing what they meant.
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
apply the same loop generically:

1. Checkout the branch if you're not already on it (if the branch doesn't
   exist despite tracking docs referencing it, stop and ask the user — do
   not create it yourself in this situation, something is inconsistent).
2. Read that work's `PROGRESS.md` (proposal-specific, or the root one's
   relevant section) — its task table and session log are the source of
   truth for status.
3. Pick the task: the one `$ARGUMENTS` named, or the first `todo` task in
   the table, respecting phase order and each row's `Notes` dependency.
4. From that work's `IMPLEMENTATION_PLAN.md`, read **only** the entry for
   the chosen task ID (Grep for it, then read just that section) — not the
   whole file. If it references a `DESIGN_SPEC.md` section, read **only**
   that section too.
5. If the task's Notes flag a dependency that isn't `done`, or something
   only the user can decide (a visual taste call not already settled by the
   design spec, access to real hardware, credentials, an ambiguous product
   decision), stop and ask the user rather than guessing or stubbing around
   it.
6. Delegate, verify, track, and continue/stop exactly per the **"Delegate →
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

For the chosen task (or a small batch of independent tasks — check
dependency notes first), spawn one subagent per task using the Agent tool
(`subagent_type: general-purpose`, run in the background unless you have
nothing else to do while waiting). Independent tasks in one batch go in a
single message with multiple Agent calls.

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
