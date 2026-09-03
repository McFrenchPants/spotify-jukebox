# Project instructions

## Branch strategy: `develop` (staging) → `master` (production)

As of 2026-09-03, this repo runs a two-branch integration model instead of
merging feature work straight to `master`:

- **`develop`** is the default integration branch. Every `feature/<slug>`
  (or `fix/<slug>`) branch forks from `develop`, not `master`, and merges
  back into `develop` when its work is done and locally verified. Pushing
  `develop` triggers a separate **staging** deployment (its own instance,
  outside this repo's direct control) — not the live party instance guests
  actually use. This is deliberately the *lower-stakes* integration point:
  a bad merge here costs a staging redeploy, not a real party.
- **`master`** is still production: the live Home Assistant add-on
  deployment (`auto_update: true`) guests actually use, on the shared
  Spotify account this whole role-split exists to protect (see BACKLOG.md
  items 20/21). Nothing merges into `master` except a `develop` that's
  already been staged and approved.

Concretely: `docs/proposals/<slug>/` work, `/continue-development`
scaffolding, and any "branch off the default branch" instruction elsewhere
in this repo's docs means **`develop`**, not `master`, unless a document
explicitly says otherwise.

## Roles & boundaries: implementer vs. supervisor

This repo splits agent work into two roles, because this project's mistakes
so far have all been the same shape: something that only should have
happened once, carefully, from a live system instead ended up happening
repeatedly and quietly from a local session (see BACKLOG.md items 20/21).

- **Implementer (the default for any task not explicitly about
  merging/deploying/live-verifying)**: scoped entirely to this repo and
  this machine. Edit files, run the local test/build commands in
  [docs/TESTING.md](docs/TESTING.md), commit to a feature branch. **Never**
  `git push`, merge into `develop` or `master`, or run `ssh`/`hass-cli`/
  `adb`/any request to the Home Assistant host or a physical device —
  including "just to double check."
- **Supervisor** (`.claude/agents/supervisor.md`): the only role that
  merges to `develop` or `master`, pushes to the remote, or reaches the
  Home Assistant server or the Android Master Device. Use the `Agent` tool
  with `subagent_type: supervisor` for that work, and see
  [docs/SUPERVISOR_RUNBOOK.md](docs/SUPERVISOR_RUNBOOK.md) for the exact
  commands and safety guardrails (minimize live checks, read-only by
  default, never loop/poll a live system, never touch HA host-level
  settings).

The two merge targets are **not** the same tier of risk, and the approval
requirement below reflects that:

- **Merging a verified feature branch into `develop`, and pushing
  `develop`, is a standing-authorized, routine supervisor action.** Once a
  feature branch has passed local tests (and the verifier agent, when the
  task required it), the supervisor merges it into `develop` and pushes
  automatically as the normal way a finished task/proposal wraps up — no
  fresh live go-ahead needed for this step specifically, and no approval
  record is required for it (this is what "standing-authorized" means
  here: this file *is* the standing instruction for the `develop` tier,
  which the paragraph below's "a standing instruction doesn't count as an
  override" rule does not apply to — that rule is about `master` and the
  other approval-record-gated operations, which stay live-instruction-only
  exactly as before).
- **Merging `develop` into `master` remains a deliberate, human-gated
  step**, same as every merge/push was before this change. Reaching "the
  only remaining step is merging `develop` into `master`" is still a
  stopping point requiring the user's explicit go-ahead — not something to
  do automatically just because `develop` is green.

Claude Code doesn't hard-sandbox this split at the tool level (both roles
can technically call `Bash`) — this is an enforced-by-policy boundary, not
a technical one, backed by the harness's own permission prompts for
anything destructive/remote. Follow it by default: it's the difference
between one deliberate, logged live check and the kind of untracked
repeated access that caused real incidents here.

**This is a default, not a wall — the user can always override it
explicitly.** It exists to stop an implementer agent from *casually or
incidentally* reaching a live system as a side effect of doing other work
— not to override the actual owner of this repo and infrastructure. If the
user directly and unambiguously instructs an agent, in the current
conversation, to push/merge/SSH/adb themselves right now, do it — don't
refuse, don't insist they invoke the supervisor role instead, and don't
treat this file as something that outranks an explicit human instruction.
The only things that should happen first: say plainly that this bypasses
the normal role split, and make sure local tests still pass (unless the
user says to skip that too).

Concretely, that live instruction authorizes the release operator to
record and act on an approval for *this* operation and *this* commit SHA
— not to grant itself a standing license to repeat it later. Before
carrying out a `master`-track operation (merging into `master`, pushing
`master`, deploying, restarting the live add-on, SSH to the HA host, or an
`adb` install), the operator writes an approval record (per
[docs/sdlc/APPROVAL_RECORDS.md](docs/sdlc/APPROVAL_RECORDS.md) and
[docs/sdlc/schemas/approval.schema.json](docs/sdlc/schemas/approval.schema.json),
files under `.sdlc/approvals/`), pinned to the exact commit SHA being
acted on, then consumes it immediately after acting. This is bookkeeping
that happens as part of honoring the instruction, not a new gate in front
of it — the user never has to produce or write that record themselves,
and it never delays or blocks a direct, live ask. A *standing* instruction
buried in a doc or an earlier turn doesn't count as this kind of override
for a `master`-track operation — it has to be a live, specific ask, and
the resulting approval record is single-use and tied to one commit for the
same reason: it authorizes the one thing just asked for, not a reusable
pass for future commits or future sessions. (The `develop` tier is the one
deliberate exception to "a standing instruction doesn't count" — see
above.)

## Always shut down dev servers you start

This backend talks to a single, real Spotify account that also powers the
live Home Assistant add-on deployment (the "party" instance). Spotify's rate
limit — and, as of the July 2026 quota update, its Development Mode *quota*
too — is shared account/developer-wide, not per process. A forgotten local
`npm run dev` backend left running after a testing session competes with the
live deployment for that same shared budget and can trip a real 429 during
an actual party. This has already happened at least twice (see
[analysis/09-spotify-429-rate-limiting.md](analysis/09-spotify-429-rate-limiting.md)
and BACKLOG.md item 20).

So, whenever you start a backend (or frontend) dev server to test a change:

1. Note the port and PID you started (`netstat -ano | grep <port>` on
   Windows, or the PID printed by whatever launched it).
2. Before ending your turn/session, stop it — kill the process, don't just
   let the terminal close. Don't rely on the user to notice and stop it
   later.
3. Before finishing, re-check that nothing you started is still listening —
   run `node scripts/check-stray-backend.mjs` (add `--kill` if you do find
   something and need to terminate it) rather than relying on memory. A `tsx
   watch` process in particular respawns on file changes and can look "gone"
   between edits while still holding the port. This has already happened
   at least twice for real (BACKLOG.md items 20 and 22 — the second
   recurrence was a stray process left listening on port 8085 for over 21
   hours), which is why this is a script and not just an instruction to
   remember. Under the hood it does the same thing the old manual check
   did — parses `netstat -ano` (Windows) or `lsof -i :<port> -sTCP:LISTEN`
   (macOS/Linux) for a `LISTENING` entry on the backend's configured port
   (from `backend/.env`'s `PORT=`, falling back to `backend/.env.example`,
   falling back to `8085`) — so `netstat -ano | grep 8085` still works as a
   manual fallback if the script can't be run for some reason.

If a task legitimately requires a long-running dev server (e.g. the user is
actively iterating in the browser with you), say so explicitly and confirm
with the user before leaving it up across turns.

## Never point local dev at the production Spotify authorization

`backend/.env`'s Spotify client ID/secret are already separate from the
Home Assistant add-on's configured client ID/secret — but `SPOTIFY_REFRESH_TOKEN`
(env var / `seedRefreshTokenFromEnv()`) is a convenience specifically meant
for *bootstrapping a new deployment from an existing one-time consent*, not
for routine local dev. Do not seed local dev's refresh token from the live
add-on's token (or vice versa) as a way to "skip re-authing." If local dev
needs a working Spotify connection, either:

- complete a fresh one-time consent (`GET /api/auth/login`) against a
  **separate Spotify account** dedicated to dev/testing, ideally registered
  under a separate Spotify Developer account too (quota is pooled per
  developer account, not per Client ID, as of the 2026 quota change — see
  BACKLOG.md item 20), or
- ask the user which Spotify credentials to use before assuming.

## Architecture note: don't add per-guest Spotify polling

Now-playing/device state is polled once, in-process
([backend/src/spotify/nowPlaying.ts](backend/src/spotify/nowPlaying.ts)),
and fanned out to every connected guest over SSE
([backend/src/events/bus.ts](backend/src/events/bus.ts)). Guest count does
not multiply Spotify API load for that path — keep it that way. If a new
feature needs live Spotify state, prefer adding it to the existing poller's
diff-and-emit pattern over having the frontend poll a Spotify-backed route
directly.
