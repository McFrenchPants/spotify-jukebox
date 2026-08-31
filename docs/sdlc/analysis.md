# Analysis: a portable SDLC supervisor framework

**Status:** first-pass analysis — written for review, not yet a design spec
or implementation plan. Following this project's own convention (see
`.claude/commands/continue-development.md`'s "Scaffold new work" step):
analysis first, then a reviewed design spec, then an implementation plan,
only then delegated implementation. This document deliberately stops at
analysis — it names the problem, what already exists, the two decisions
made so far, and the open questions a design pass still needs to close, not
file-level detail to hand to a subagent yet.

## Problem

This session built, incrementally and somewhat reactively, a safety
boundary for this repo: an implementer/supervisor role split, a
`.claude/agents/supervisor.md` subagent scoped to merge/push/live-verify,
and docs recording exact remote-access commands and guardrails
(`docs/TESTING.md`, `docs/SUPERVISOR_RUNBOOK.md`). That work fixed a real
incident (an agent hit a "hard wall" trying to merge to master — turned out
to be this session's own overly-absolute `CLAUDE.md` wording, not an actual
Claude Code restriction) but it was built one patch at a time, for this
repo only, and — as became clear once the user articulated the actual
goal — modeled "supervisor" inconsistently with a better answer that was
already sitting in the repo.

The user's actual goal is bigger than this repo: a reliable, safe framework
for running the SDLC through Claude Code sessions, where a **supervisor**
role acts like a product owner — critical review of intake, proposals, and
completed work, not just execution — across the full lifecycle (intake,
analysis, design, plan, implement, test, version control, deploy), always
aware of project state and next steps, delegating implementation to
tightly-scoped subagents backed by domain-specific skills so they can't
wander off scope. And it needs to be **portable**: clone a new repo, run
one command, get the same setup.

## What already exists (and the inconsistency it revealed)

`.claude/commands/continue-development.md` already implements most of the
product-owner lifecycle described above, and already frames it correctly:
the **acting session itself** adopts the persona ("You are acting as
supervisor, not implementer, for this project") rather than supervisor
being something you spawn. It already:

- Orients from `BACKLOG.md`/`PROGRESS.md`/branch state before doing
  anything (intake + "always know project state").
- Scrutinizes a backlog item's own merit before scaffolding it — "a backlog
  entry is someone's raw idea, not a pre-approved plan" — and stops for a
  human check-in before finalizing an analysis file (a real, if narrow,
  instance of the "critical eye" the user wants applied everywhere).
- Scaffolds proportionally (design spec only for the "significant" tier),
  tracks via `PROGRESS.md`, and delegates to narrowly-scoped, self-contained
  subagent prompts that don't get to read the plan/spec docs themselves
  (Delegate → Verify → Track → Continue-or-stop loop).
- Already gates merge/push behind an explicit human go-ahead, not an
  assumed one.

It's already close to project-agnostic — nothing in it actually references
Spotify, Home Assistant, or this repo's specifics by name.

**The inconsistency**: this session separately created
`.claude/agents/supervisor.md`, a spawnable Agent-tool subagent type
*also* called "supervisor," modeled completely differently — as something
you delegate merge/push/live-verify *to*, rather than a persona the current
session adopts. Confirmed directly: when I tried to actually hand off a
merge to that subagent type mid-session, it didn't even exist yet in the
running session's available-agent list (Claude Code loads that list at
session start, not live from disk) — a concrete sign these two models were
never reconciled. The user's own stated intent settles which model is
right: *"the agent should summarize the context/request and invoke
continue-development skill... making itself a supervisor agent."*
Supervisor is a persona a session adopts via `continue-development`, not a
subagent type to spawn. There is no clear use case yet for a spawnable
"supervisor" subagent distinct from that.

## Decisions already made (in conversation, before this doc)

1. **Portability mechanism: Claude Code plugin**, preferred over a
   copyable template folder — install once, any repo gets the commands.
   Real open risk, not yet verified: the `cowork-plugin-management:
   create-cowork-plugin` skill (the likely path to actually building one)
   says it needs "Cowork mode with access to the outputs directory," which
   may or may not be available in this CLI environment. If it isn't, the
   copyable-template-folder approach is the agreed fallback, not a dead
   end.
2. **Expertise skills (domain-specific guardrails for delegated
   subagents) are created on demand, not pre-built.** No backend-
   conventions/frontend-conventions example skills are being authored
   preemptively for this repo — the supervisor persona should check
   whether a relevant skill exists before delegating, and use its own
   judgment about whether a recurring domain is worth turning into a
   reusable skill versus one-off inline instructions.

## Direction that seems right, pending design-phase scrutiny

- Generalize `continue-development.md` rather than replace it: add a
  standing "critical eye applies at every phase" section (not just backlog
  intake), add an explicit "check for/create an expertise skill before
  delegating" step to the existing Delegate section, and add an explicit
  statement that the supervisor persona owns merge/push/deploy-verify
  directly — retiring the separate spawnable-subagent model.
- A new `init-sdlc`-style bootstrap command, packaged alongside it, that
  scaffolds `BACKLOG.md`/`PROGRESS.md`/`docs/TESTING.md`/
  `docs/SUPERVISOR_RUNBOOK.md`/a `CLAUDE.md` roles section into a fresh
  repo — asking for project-specific details (real test commands, real
  deploy mechanism) rather than leaving placeholders, and never
  overwriting existing files silently.
- An explicit, honestly-scoped auto-trigger rule in `CLAUDE.md`: any
  session should invoke `/continue-development` before proposing/making a
  code change in this repo, unless already running as that persona —
  documented plainly as a judgment-based instruction the model has to
  recognize and act on, *not* a technical hook, since Claude Code has no
  mid-conversation intent-detection mechanism. This mirrors a correction
  already made once this session (the implementer/supervisor split itself
  isn't a technical wall either, just a strong default a direct user
  instruction can override) — worth stating consistently rather than
  re-learning per rule.
- Retire `.claude/agents/supervisor.md` in this repo (delete it, or reduce
  it to a pointer at the `continue-development` persona) and re-frame
  `docs/SUPERVISOR_RUNBOOK.md`'s existing command reference as "what the
  supervisor persona runs when it needs to merge/push/live-verify," not
  "what a spawned subagent does" — the actual hass-cli/ssh/adb/git commands
  in that file stay correct as-is, only the framing paragraph changes.

## Open questions for the design phase

These are genuinely undecided — a design spec should resolve them with the
user before an implementation plan gets written, not guess:

1. **Plugin feasibility.** Is Cowork mode actually available in this
   environment? This should be checked *first*, since it decides which of
   the two portability mechanisms the rest of the design builds on.
2. **Naming.** What is this framework/plugin actually called? (Affects
   command names, e.g. whether `init-sdlc` is the right name, and whether
   it collides with anything already reserved.)
3. **Unattended/scheduled use.** Is there a real near-term case for a
   scheduled task or other unattended trigger acting as supervisor with no
   one typing (the one scenario where a distinct non-interactive entry
   point might still matter)? If yes, does invoking `continue-development`
   directly from a scheduled context actually work the same way, or does
   headless/scheduled invocation need something different from the
   interactive command?
4. **How much of spotify-jukebox's *content* (not mechanism) should the
   template generalize?** e.g. this repo's `BACKLOG.md` numbering
   convention, status legend, and `docs/proposals/` layout are all specific
   choices — should `init-sdlc` reproduce them exactly as the default, or
   are they this-repo opinions that a template should present as one
   example among options?
5. **Versioning/updates.** Once a repo is bootstrapped, how do improvements
   to the plugin's commands reach repos that already ran `init-sdlc`? (Not
   a concern for a copied template-folder approach, but a real one for the
   plugin approach — plugins presumably update centrally, but the
   repo-local files `init-sdlc` writes, like `BACKLOG.md`, wouldn't.)
6. **Scope of "expertise skill" creation authority.** When the supervisor
   persona decides a domain is "worth turning into a reusable skill,"
   should that itself require a check-in with the user before committing
   the new skill, or is that a judgment call the supervisor can make
   unilaterally the same way it already makes small delegation-prompt
   decisions today?
