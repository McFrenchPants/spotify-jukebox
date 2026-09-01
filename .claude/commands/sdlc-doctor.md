---
description: Read-only diagnostic check of the sdlc-supervisor framework's own state -- .sdlc/state.json lifecycle values, the PreToolUse path-enforcement hook wiring, and .sdlc/project.yaml's owned_files -- reporting drift without changing anything.
argument-hint: "[optional -- unused today; reserved for a future narrower scope, e.g. a single task id]"
---

You are running the **sdlc-doctor** diagnostic. This command is
**read-only and diagnostic-only**: it never edits, writes, or deletes any
file, including its own output. Do not call `Edit`, `Write`, or
`NotebookEdit` at any point while running this command, and do not run any
`Bash` command that mutates a file (no `sed -i`, no `>`/`>>` redirection
into a tracked file, no `mv`/`rm` on anything in the repo). Every step
below is "read something, compare it, report what you found." If you
discover drift, your job is to *describe* it clearly enough for a human or
a follow-up task to fix -- not to fix it yourself.

This command does **not** implement `.sdlc` init/migrate/uninstall
(design-spec.md §9) -- that is separate, deferred work. It only inspects
the `.sdlc/` state that's already checked into (or generated within) this
repo.

## What to check

Run these four checks, in order. For each, report one of:
- **PASS (clean)** -- no drift found, with a one-line note of what you
  verified.
- **FAIL (drift found)** -- the specific thing that's wrong, concrete
  enough to act on (exact task id, exact path, exact expected vs. actual
  value).

### 1. Lifecycle-state enum sanity (`.sdlc/state.json`)

Read `.sdlc/state.json` and `scripts/sdlc/validate-state.mjs`. The script
exports `LIFECYCLE_STATES` (currently: `draft`, `design_review`,
`approved`, `implementing`, `verifying`, `ready_to_release`, `released`).
This is a pure enum-membership sanity check, **not** a transition check --
you are not calling `validateTransition`/re-running the CLI here, and you
are not checking whether a task's history of moves was legal, only
whether its *current* value is one of the legal enum members (or `null`).

For every task in every `work_items[].tasks[]` entry (and every
`work_items[]` itself, since it also carries its own `lifecycle_state`),
confirm `lifecycle_state` is either `null` or exactly one of the values in
`LIFECYCLE_STATES`. Report any task/work-item whose value is anything
else (a typo, a stale/renamed state, a non-string) by id and by the bad
value found.

### 2. PreToolUse hook wiring (`.claude/settings.json`)

Read `.claude/settings.json`. Confirm it has a `hooks.PreToolUse` entry
whose `matcher` covers `Edit`/`Write`-family tools and whose `hooks[].command`
references `.claude/hooks/sdlc-path-check.mjs` (the SS3.1 path-enforcement
hook). This check only inspects the settings file's wiring -- it does not
need to invoke the hook script itself. Report drift if the entry is
missing entirely, if the command no longer references
`sdlc-path-check.mjs`, or if the file referenced by that command doesn't
actually exist on disk at `.claude/hooks/sdlc-path-check.mjs`.

### 3. `owned_files` existence (`.sdlc/project.yaml`)

Read `.sdlc/project.yaml`'s `owned_files` list. For each entry:
- If it's a glob ending in `/**` (or similarly a directory-style entry),
  treat it as satisfied if the directory it names exists on disk **and is
  non-empty** (at least one file/dir inside it, checked non-recursively is
  fine -- an empty owned directory is itself worth flagging as drift).
- If it's a literal file path (no wildcard), treat it as satisfied only if
  that exact file exists.

Report any `owned_files` entry that resolves to a missing directory, an
empty directory, or a missing file, by its literal entry text.

### 4. `task_packet_path` referential integrity (`.sdlc/state.json`)

For every task in `.sdlc/state.json` whose `task_packet_path` is
non-null, confirm that path exists as a real file on disk (paths in this
field are repo-relative, e.g. `.sdlc/task-packets/SS4.2.packet.json`).
Report any task whose `task_packet_path` points at a file that does not
exist, by task id and the missing path.

## How to run it

Use `Read`/`Glob`/`Grep` and read-only `Bash` (`ls`, `git status`, `node
-e` that only prints -- never anything that writes) to gather what you
need. A `node -e` one-liner that `import()`s
`scripts/sdlc/validate-state.mjs` to read `LIFECYCLE_STATES` at run time
(rather than hand-copying the enum into this command's own text) is the
most robust way to do check 1, since it stays correct if the enum ever
changes -- but don't invoke anything else from that script, and don't call
its CLI in a way that writes anything (it doesn't, by design, but stay
read-only regardless).

## Report format

End with a short report, one block per check, e.g.:

```
1. Lifecycle-state enum sanity ........ PASS (12 tasks + 1 work_item, all valid enum members or null)
2. PreToolUse hook wiring .............. PASS (matcher Edit|Write|NotebookEdit -> sdlc-path-check.mjs, file exists)
3. owned_files existence ............... PASS (4/4 entries present and non-empty where directories)
4. task_packet_path referential check .. PASS (4/4 non-null paths resolve to existing files)
```

or, with drift:

```
3. owned_files existence ............... FAIL
   - ".claude/agents/verifier.md" listed in owned_files but does not exist on disk
```

Finish by stating plainly that no files were changed while producing this
report. If any check fails, do not attempt to fix it in this same
invocation -- report it and stop; fixing drift is a separate, deliberate
task with its own review, not something this command does automatically.
