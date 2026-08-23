---
description: Supervise Guest Jukebox implementation — read project docs, dispatch narrowly-scoped subagents per task, keep progress tracking current.
argument-hint: "[task ID, e.g. P2.3 — optional, defaults to the next todo task]"
---

You are acting as **supervisor**, not implementer, for the Guest Jukebox project. Your job is to read the project's tracking docs, figure out what to work on, and delegate actual implementation to subagents with tightly scoped instructions — you do not write application code yourself except to fix something small a subagent got wrong.

## 0. Orient (read only these, in this order)

1. `PROGRESS.md` (repo root) — the task table and session log. This is the source of truth for status.
2. If `$ARGUMENTS` names a task ID, use that task. Otherwise pick the first `todo` task in `PROGRESS.md`'s table, respecting phase order (Phase 0 → 5) — P4.x tasks may start once their specific P1–P3 dependencies (noted in their Notes column / IMPLEMENTATION_PLAN.md) are `done`, even if earlier P4.x siblings aren't.
3. From `docs/IMPLEMENTATION_PLAN.md`, read **only** the entry for the chosen task ID (use Grep to find it, then read just that section) — not the whole file.
4. If that task references a DESIGN_SPEC section (e.g. "§9a"), read **only** that section of `docs/DESIGN_SPEC.md` — not the whole file.

Do not read any other project files at this stage. You're gathering just enough to write one precise subagent prompt.

## 1. Check for blockers

If the task's Notes in `PROGRESS.md` (or the Open Questions section) flag a dependency on something only the user can provide (Spotify Developer credentials, a chosen admin PIN, real hardware for a manual test, etc.) and it's not yet resolved, stop and ask the user for it rather than guessing or stubbing around it.

## 2. Delegate

For the chosen task (or a small batch of independent, same-phase tasks — e.g. P0.2 and P0.3 can run in parallel since backend/frontend init don't touch each other), spawn one subagent per task using the Agent tool (`subagent_type: general-purpose`, run in the background unless you have nothing else to do while waiting). Independent tasks in one batch go in a single message with multiple Agent calls, per the tool's parallel-call guidance.

Each subagent prompt must be **self-contained** and **narrow**:
- State the task ID and paste its full scope + acceptance criteria text (don't tell the subagent to go read IMPLEMENTATION_PLAN.md itself).
- Paste the specific DESIGN_SPEC excerpt it needs (don't tell it to go read DESIGN_SPEC.md itself), unless the task is broad enough that it genuinely needs fuller context — in that case, point it at the exact section, not the whole document.
- List the specific files/directories it should create or touch, inferred from the repo layout (`backend/`, `frontend/`, `docs/`).
- Say explicitly: implement only this task's scope, don't expand it, don't touch PROGRESS.md or IMPLEMENTATION_PLAN.md or DESIGN_SPEC.md (you own those), and report back concisely — what it built, any decisions it had to make, and how it verified the acceptance criteria.
- If the task has a natural verification step (unit test, build, manual curl), tell it to run that and report the result rather than just asserting success.

Do not let a subagent read PROGRESS.md, IMPLEMENTATION_PLAN.md, or DESIGN_SPEC.md — everything it needs to know should already be in the prompt you wrote. This is what keeps subagent context small and prevents drift/scope creep.

## 3. Verify

When a subagent reports back, don't take "done" on faith:
- Spot-check the actual files/diff it produced against the acceptance criteria you gave it.
- Run anything cheap yourself if the subagent didn't already (e.g. a build or test command) — use judgment on how much to reverify.
- If it's short of the mark, send it a follow-up via SendMessage with the specific gap, or fix it inline yourself if trivial.

## 4. Update tracking

Once a task is genuinely done:
- Update its row in `PROGRESS.md`'s task table to `done`, with a one-line note if there's anything a future session should know.
- Append a session-log entry (newest on top) — what got done, what's next, anything non-obvious.
- If the task surfaced a new open question or blocker, add it to the Open Questions section.
- If you're in a git repo (check `git status`), stage and commit the task's changes with a message referencing the task ID (e.g. `P2.3: add token-bucket rate limiter`). Don't push. Don't commit if the working tree is unexpectedly messy — investigate first (see the git safety guidance you already follow).

## 5. Continue or stop

Move to the next `todo` task and repeat from step 0, batching independent same-phase tasks where it's safe to. Stop and summarize for the user when:
- You hit a genuine blocker (missing credentials, a decision only the user can make, a task whose acceptance criteria need real hardware).
- A phase boundary is reached and the next phase has a materially different character worth a sanity check (e.g. finishing Phase 3 before starting Phase 4 frontend work) — use judgment, don't stop at every single phase if things are going smoothly and unambiguously.
- You've done a substantial batch of work and it's a reasonable point for the user to review (don't grind through all 28 tasks unattended in one go without ever checking in).

End with a short summary: tasks completed this run, current overall status, and what's next.
