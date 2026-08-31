# Design spec: portable SDLC supervisor framework

**Status:** draft, for review — resolves the open questions in
[analysis.md](analysis.md) with recommendations. Not yet an implementation
plan; nothing gets built from this until it's reviewed and the naming/scope
calls below are confirmed.

## 1. Portability mechanism — resolved

**Finding: this is a Claude Code plugin, not a Cowork plugin, and the two
are unrelated despite the name collision.**

`cowork-plugin-management:create-cowork-plugin` targets Claude Cowork (the
desktop knowledge-work app) and packages a `.plugin` file into an "outputs"
directory that only exists in that app's session type. It has nothing to do
with this project — this repo runs under the Claude Code CLI, which has its
own, separate, plugin system:

- A plugin is a plain directory: `.claude-plugin/plugin.json` (manifest,
  optional) plus `skills/`, `commands/`, `agents/`, `hooks/hooks.json`,
  `.mcp.json`. No special mode or environment required.
- Distribution is git-based: a **marketplace** is just a git repo Claude
  Code can add (`claude plugin marketplace add`), and `claude plugin
  install <name>@<marketplace>` copies it to `~/.claude/plugins/cache/`.
  Marketplace installs auto-update; this answers analysis.md's open
  question 5 (versioning) — a repo that installed the plugin gets command/
  skill improvements through normal plugin updates, while the repo-local
  files the plugin *writes* (`BACKLOG.md`, `PROGRESS.md`) are untouched by
  that update, exactly as they should be.
- There's also a **skills-directory** local-dev mode
  (`~/.claude/skills/<name>/.claude-plugin/plugin.json`) that loads with no
  install step at all — useful for iterating on this framework itself
  before it's ever published anywhere.

**Recommendation:** build it as a real Claude Code plugin from the start —
there's no feasibility risk to hedge against, so the earlier
template-folder fallback is unnecessary. Develop it in a dedicated repo
(not inside spotify-jukebox) using the skills-directory local-dev mode for
fast iteration, install it into spotify-jukebox to validate end-to-end, then
decide later whether it's worth a public/team marketplace or stays a
personal one.

Prior art worth borrowing from (researched, not adopted wholesale):

- **BMAD-METHOD** (multi-agent Claude Code plugin, 9 role-agents + 26
  workflow-skills): its core lesson is *"roles become agents, workflows
  become skills — don't conflate the two."* That maps directly onto this
  framework's split between the supervisor **persona** (a role) and the
  lifecycle **skill** (`continue-development`, a workflow) — validates the
  direction already set in analysis.md rather than changing it. Its
  `/bmad:status` command and session-resumable workflow state are worth
  copying in spirit (our equivalent is `PROGRESS.md` plus git branch
  state).
- **ai-native-sdlc** (Plan→Design→Build→Test→Deploy→Maintain loop): its
  strongest idea is a `workflow-graph.yaml` making phases and gates into an
  explicit directed graph, and the framing *"the agent can do everything up
  to the production gate, but never crosses it"* — a clean one-line
  description of exactly what this repo's implementer/supervisor split
  already enforces. No need to adopt its graph-file mechanism; `BACKLOG.md`
  / `PROGRESS.md` / git state already serve that purpose here, more simply.

## 2. Naming — needs your pick

Candidates, biased toward something that reads as a role/loop rather than a
generic buzzword (avoiding collision with "BMAD," "cowork," or Anthropic's
own product names):

| Name | Read |
|---|---|
| **`sdlc-supervisor`** | Plainest, most discoverable, zero personality. Downside: long to type in command names (`/sdlc-supervisor:continue-development`). |
| **`loopwright`** | Evokes "the one who runs the loop" (like playwright/shipwright). Short, distinctive, no collisions found. |
| **`runbook`** | Short, familiar ops term, but likely to collide conceptually with this repo's own `docs/SUPERVISOR_RUNBOOK.md` and other teams' existing "runbook" tooling. |
| **`foreman`** | Construction-site supervisor metaphor — oversees work done by others, doesn't do it all itself. Short, memorable, no obvious collision. |

My pick would be **`foreman`** (clear metaphor, short command prefix like
`/foreman:continue-development`) or **`sdlc-supervisor`** if you'd rather
optimize for self-explanatory over evocative. Tell me which direction you
like or give your own.

## 3. Scope — unified lifecycle, two entry points

Per your answer, both use cases share one lifecycle rather than being
designed separately:

```
        intake
          │
   ┌──────┴──────┐
   │             │
new project   existing project
(init-sdlc)   (continue-development)
   │             │
   └──────┬──────┘
          ▼
     analysis (critical-eye pass on the idea itself)
          ▼
     design spec  ──── human checkpoint ────┐
          ▼                                  │
     master/implementation plan              │
          ▼                                  │
     delegate to scoped subagents            │
     (skill-backed, cheaper model where fit) │
          ▼                                  │
     verify + track (PROGRESS.md)            │
          ▼                                  │
     supervisor persona: merge/push/deploy ◄─┘
     (only role that ever does this)
```

- **`init-sdlc` command** (new): for a fresh repo with no `BACKLOG.md`/
  `PROGRESS.md` yet. Asks project-specific questions (real test commands,
  real deploy mechanism — never placeholders), scaffolds
  `BACKLOG.md`/`PROGRESS.md`/`docs/TESTING.md`/a `CLAUDE.md` roles section,
  writes an initial analysis + design spec + master plan for reaching MVP,
  then hands off into the same loop `continue-development` already runs.
  Never overwrites existing files silently — if `BACKLOG.md` etc. already
  exist, it defers to `continue-development` instead of re-scaffolding.
- **`continue-development` skill** (existing, generalized): becomes the
  plugin's core skill. Changes from today's repo-specific version:
  - Add a standing "critical eye applies at every phase" section — today
    it's scoped to backlog intake only; generalize to analysis, design,
    and completed-work review too.
  - Add an explicit "check for/create an expertise skill before
    delegating" step in the Delegate section.
  - State plainly that the supervisor persona owns merge/push/deploy-verify
    directly, retiring the separate spawnable-subagent model — this repo's
    own `.claude/agents/supervisor.md` gets retired or reduced to a pointer
    once the plugin exists (tracked as follow-up, not part of this design).
- **Auto-trigger rule**: ship as a documented, judgment-based instruction
  in the plugin's guidance (a session should invoke the lifecycle skill
  before proposing/making a change, unless already running as that
  persona) — explicitly *not* a technical hook, matching the same honest
  framing already used for the implementer/supervisor split itself.

## 4. Unattended/scheduled use — deferred

No scheduled/headless entry point in this design. If a real need shows up
later, the `schedule` skill can invoke the lifecycle skill directly as a
prompt — worth revisiting only once there's an actual case, not designed
speculatively now.

## 5. Remaining open items (from analysis.md, still genuinely open)

These don't block writing an implementation plan, but should get an
explicit answer before or during that plan:

- **Q4 (content genericization):** recommend the plugin ship
  `BACKLOG.md`/`PROGRESS.md` templates as *one opinionated default*
  (reusing this repo's numbering/status-legend conventions, since they're
  already proven here) rather than presenting multiple layout options —
  simpler to build and maintain, and `init-sdlc` can still ask
  yes/no on adopting the default per-project.
- **Q6 (skill-creation authority):** recommend the supervisor persona can
  create a new expertise skill unilaterally (same judgment tier as its
  existing delegation-prompt decisions), but must log the decision in
  `PROGRESS.md` so a human reviewing later can see why it exists — no
  separate check-in gate needed.

## Next step

Once you confirm the name and skim sections 1–4, the next artifact is an
implementation plan: concrete file list for the plugin repo
(`plugin.json`, `skills/continue-development/SKILL.md`,
`commands/init-sdlc.md`, templates), a validation pass (skills-directory
install into this repo), and a rollout step for retiring
`.claude/agents/supervisor.md` here once the plugin is live.
