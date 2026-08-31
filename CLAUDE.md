# Project instructions

## Roles & boundaries: implementer vs. supervisor

This repo splits agent work into two roles, because this project's mistakes
so far have all been the same shape: something that only should have
happened once, carefully, from a live system instead ended up happening
repeatedly and quietly from a local session (see BACKLOG.md items 20/21).

- **Implementer (the default for any task not explicitly about
  merging/deploying/live-verifying)**: scoped entirely to this repo and
  this machine. Edit files, run the local test/build commands in
  [docs/TESTING.md](docs/TESTING.md), commit to a feature branch. **Never**
  `git push`, merge into `master`, or run `ssh`/`hass-cli`/`adb`/any
  request to the Home Assistant host or a physical device — including "just
  to double check."
- **Supervisor** (`.claude/agents/supervisor.md`): the only role that
  merges to `master`, pushes to the remote, or reaches the Home Assistant
  server or the Android Master Device. Use the `Agent` tool with
  `subagent_type: supervisor` for that work, and see
  [docs/SUPERVISOR_RUNBOOK.md](docs/SUPERVISOR_RUNBOOK.md) for the exact
  commands and safety guardrails (minimize live checks, read-only by
  default, never loop/poll a live system, never touch HA host-level
  settings).

Claude Code doesn't hard-sandbox this split at the tool level (both roles
can technically call `Bash`) — this is an enforced-by-policy boundary, not
a technical one, backed by the harness's own permission prompts for
anything destructive/remote. Follow it anyway: it's the difference between
one deliberate, logged live check and the kind of untracked repeated access
that caused real incidents here.

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
3. Before finishing, re-check that nothing you started is still listening
   (`netstat -ano | grep 8085` for the backend's default port) — a `tsx
   watch` process in particular respawns on file changes and can look "gone"
   between edits while still holding the port.

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
