---
description: Supervise the responsive/landscape layout proposal — read its docs, dispatch narrowly-scoped subagents per task, keep progress tracking current.
argument-hint: "[task ID, e.g. L1.2 — optional, defaults to the next todo task]"
---

You are acting as **supervisor**, not implementer, for the
`feature/landscape-layout` proposal (responsive layout: side-rail nav,
three-tier content width, per-page reflow — see the docs below for the
full picture). Your job is to read this proposal's tracking docs, figure out
what to work on, and delegate actual implementation to subagents with
tightly scoped instructions — you do not write application code yourself
except to fix something small a subagent got wrong.

## 0. Orient (read only these, in this order)

1. Confirm the current branch is `feature/landscape-layout` (`git branch --show-current`). If it isn't, check it out; if it doesn't exist, stop and ask the user — don't create it yourself.
2. `docs/proposals/landscape-layout/PROGRESS.md` — the task table and session log. This is the source of truth for status.
3. If `$ARGUMENTS` names a task ID, use that task. Otherwise pick the first `todo` task in the table, respecting phase order (L0 → L4) and each row's `Notes` dependency (e.g. don't start L1.1 before L0.1 is `done`).
4. From `docs/proposals/landscape-layout/IMPLEMENTATION_PLAN.md`, read **only** the entry for the chosen task ID (Grep for it, then read just that section) — not the whole file.
5. If that task references a DESIGN_SPEC section (e.g. "§5.1"), read **only** that section of `docs/proposals/landscape-layout/DESIGN_SPEC.md` — not the whole file.

Do not read any other project files at this stage. You're gathering just enough to write one precise subagent prompt.

## 1. Check for blockers

If the task's Notes in `PROGRESS.md` flag a dependency that isn't yet `done`, or something only the user can decide (a visual taste call not already settled by DESIGN_SPEC §7, access to real hardware for L4.1's bridge-phone check, etc.), stop and ask the user rather than guessing or stubbing around it.

## 2. Delegate

For the chosen task (or a small batch of independent tasks — check the table's dependency notes first), spawn one subagent per task using the Agent tool (`subagent_type: general-purpose`, run in the background unless you have nothing else to do while waiting). Independent tasks in one batch go in a single message with multiple Agent calls, per the tool's parallel-call guidance.

Each subagent prompt must be **self-contained** and **narrow**:
- State the task ID and paste its full scope + acceptance criteria text from `IMPLEMENTATION_PLAN.md` (don't tell the subagent to go read that file itself).
- Paste the specific DESIGN_SPEC excerpt it needs, if any (don't tell it to go read the whole spec).
- Confirm it's working on `feature/landscape-layout` and list the specific files it should create or touch (inferred from the task text — mostly `frontend/src/components/`, `frontend/src/pages/`).
- Say explicitly: implement only this task's scope, don't expand it, don't touch `PROGRESS.md`/`IMPLEMENTATION_PLAN.md`/`DESIGN_SPEC.md` (you own those), and report back concisely — what it built, any decisions it had to make (e.g. exact rail width if the plan left it as "adjust if it looks cramped"), and how it verified the acceptance criteria.
- Tell it to run typecheck (and any relevant test) and report the result rather than just asserting success. For a visual task, tell it to verify in the Browser pane per the project's own `<when_to_verify>`/`<verification_workflow>` conventions rather than asserting the layout looks right.

Do not let a subagent read `PROGRESS.md`, `IMPLEMENTATION_PLAN.md`, or `DESIGN_SPEC.md` — everything it needs should already be in the prompt you wrote. This keeps subagent context small and prevents drift/scope creep.

## 3. Verify

When a subagent reports back, don't take "done" on faith:
- Spot-check the actual files/diff it produced against the acceptance criteria you gave it.
- Run anything cheap yourself if the subagent didn't already (typecheck, a quick browser check).
- If it's short of the mark, send it a follow-up via SendMessage with the specific gap, or fix it inline yourself if trivial.

## 4. Update tracking

Once a task is genuinely done:
- Update its row in `PROGRESS.md`'s task table to `done`, with a one-line note if there's anything a future session should know (e.g. the rail width value actually used).
- Append a session-log entry (newest on top) — what got done, what's next, anything non-obvious.
- If the task surfaced a new open question or blocker, add it to the Open Questions section.
- Stage and commit the task's changes on `feature/landscape-layout` with a message referencing the task ID (e.g. `L1.1: build SideNav component`). Don't push, don't merge to master. Don't commit if the working tree is unexpectedly messy — investigate first.

## 5. Continue or stop

Move to the next `todo` task and repeat from step 0, batching independent tasks where the dependency notes make it safe. Stop and summarize for the user when:
- You hit a genuine blocker (a decision only the user can make, L4.1's real-hardware check).
- A phase boundary is reached and it's a reasonable point for a visual sanity check (e.g. finishing L1 before L2 changes the width — worth eyeballing the rail alone first).
- You've done a substantial batch of work and it's a reasonable point for the user to review — don't grind through every remaining task unattended in one go.

**End every stopping point with:**
1. A short summary: tasks completed this run (with task IDs), current overall status against the full L0-L4 table, and anything non-obvious a fresh session would need to know.
2. A ready-to-use prompt for continuing in a **fresh session**, which — since `PROGRESS.md` always reflects current state — is simply:

   > `/continue-landscape` (from the `feature/landscape-layout` branch)

   If you stopped mid-task or on a specific blocker, name it explicitly instead so the next session doesn't have to rediscover it, e.g. `/continue-landscape L2.1` if L2.1 is next but has an open question attached.
