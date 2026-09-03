# Supervisor runbook: merge, push, and live verification

This document is for the **supervisor role only** — see
[.claude/agents/supervisor.md](../.claude/agents/supervisor.md) and
[../CLAUDE.md](../CLAUDE.md) for why that boundary exists. An agent
implementing a feature/fix should never need anything in this file; it
should stop at [TESTING.md](TESTING.md) and hand off.

Everything here reaches outside this repo/machine: the git remote, the
Home Assistant server, or a physical Android device. Treat every command in
this file as something to run deliberately and sparingly, not to loop or
poll with.

## Guardrails (read before running anything below)

1. **Local tests pass first, always.** Never merge/push/verify-live on a
   change that hasn't cleanly passed [TESTING.md](TESTING.md)'s checks.
2. **Verify, don't iterate, against the live system.** Live checks
   (hass-cli/curl/ssh/adb) are for confirming a already-tested change
   actually deployed correctly — not a debugging loop. If something's
   broken live, the fix happens locally (edit, retest, redeploy), not by
   repeatedly poking the live instance.
3. **Minimize call count.** One status check to confirm a deploy landed is
   normal. Polling every few seconds, or re-running the same check
   "just to be sure" more than once or twice, is not — if you need to wait
   for something (an add-on rebuild, an SSE reconnect), wait a sensible
   real amount of time once, not in a tight loop.
4. **Read-only by default.** Prefer `hass-cli state get`/`curl GET` over
   any command that changes state (`service call`, `addon_restart`,
   `ssh ... rm`/`reboot`/etc.). Only take a state-changing action when the
   task actually requires it, and say what you're about to do and why
   before doing it.
5. **Never run a destructive or host-level Home Assistant action**
   (`hassio.host_reboot`, `hassio.host_shutdown`, `hassio.backup_*`,
   `hassio.restore_*`, anything under `ha os`/`ha host` over SSH) **without
   explicit, per-instance user confirmation** — these are out of scope for
   this app's supervisor role entirely; if one seems necessary, stop and
   ask instead.
6. **Never touch Home Assistant configuration/automations/dashboards** as
   part of this app's supervisor duties — this repo's supervisor role is
   scoped to the Guest Jukebox add-on and its own repo, not general HA
   administration.
7. **The dedicated SSH key is single-purpose.** It was generated
   specifically for reading Guest Jukebox add-on logs and restarting that
   one add-on — not for anything else on the HA host. If you no longer need
   it, tell the user they can remove it from the SSH add-on's
   `authorized_keys`.
8. **Log what you actually did.** When a supervisor session performs a
   live merge/push/deploy-verify, note the real commands run in the
   BACKLOG.md entry or commit/PR description for that change — this repo
   already has a strong convention of documenting incidents and fixes this
   way (see BACKLOG.md items 9, 20, 21).

## Staging: one-time Home Assistant setup

Do this once to get the staging add-on installed and running for the first
time; skip it once it's already set up.

1. **Add a second, separate add-on repository** pointing at `develop`,
   alongside your existing production repository entry (don't replace it).
   In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ (top-right
   menu) → Repositories**, add:
   ```
   https://github.com/McFrenchPants/spotify-jukebox#develop
   ```
   Since `develop`'s `config.yaml` has a different `name`/`slug` than
   production's (see "Staging identity" below), this shows up as a
   distinct installable add-on — "Guest Jukebox (Staging)" — not a
   duplicate of the existing production one. If a push to `develop`
   doesn't show up as an available update, the Supervisor's cached clone
   is stale — remove and re-add this repository entry to force a refresh
   (a smaller hammer than uninstall/reinstall; confirmed to work in
   practice, see root `PROGRESS.md`'s 2026-08-25 session log entry).
2. **Register a new Spotify Developer app** for staging at
   [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard),
   under a Spotify account dedicated to this deployment — never production's
   credentials (see CLAUDE.md's Spotify-credentials section). Add
   `http://127.0.0.1:8086/api/auth/callback` as its Redirect URI (port
   `8086`, not `8085` — staging's add-on maps to a different host port so
   it can run alongside production, see "Staging identity" below).
3. **Fill in the Configuration tab before pressing Start**:
   `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` from step 2, and a real
   `ADMIN_PIN` (not the `change-me` default) — **this has to happen before
   the first login attempt, not after**. The PIN hash is lazily created
   once, ever, on first use (`ensureAdminPinHash()` in
   `backend/src/auth/adminToken.ts`) — there's no "change PIN" endpoint
   anywhere in the app, so editing `ADMIN_PIN` in the Configuration tab
   after that first login has no effect at all. (If this is ever missed,
   the only fix is deleting the stored `admin_pin_hash` row directly from
   the add-on's persisted SQLite `app_settings` table, same as the real
   incident documented in `docs/proposals/master-device-mode/PROGRESS.md`.)
4. **Complete the one-time Spotify consent.** Leave `SPOTIFY_REFRESH_TOKEN`
   blank, start the add-on, then from a browser on the HA host itself (or
   via `ssh -L 8086:localhost:8086 <user>@<ha-host>` and a browser on your
   own machine — Spotify only accepts the literal `127.0.0.1` loopback for
   plain-HTTP redirects), visit:
   ```
   http://127.0.0.1:8086/api/auth/login
   ```
   and log in with the new dedicated Spotify account when prompted. One-time
   only — the app stays authorized on its own afterward (see `DOCS.md` for
   the equivalent production instructions and the "Option A" refresh-token
   alternative, which does not apply here since staging needs its own
   fresh consent, not production's).

### Staging identity

See `config.yaml`'s own header comment — `develop`'s `name`, `slug`,
`version`, and host port (`8086`) are deliberately different from
`master`'s production values, so the two add-ons can coexist on the same
Home Assistant server. Never let these leak into `master` on a promotion
— see Stage 2 below and `scripts/check-config-identity.mjs`.

## Merge & push workflow

Two-stage, per [CLAUDE.md](../CLAUDE.md)'s "Branch strategy" section:
feature branches fork from and merge into `develop` (staging) as a
routine, automatic step; `develop` only promotes to `master` (production)
on an explicit live instruction. Both stages still require
[TESTING.md](TESTING.md) fully green first.

### Stage 1 — feature branch → `develop` (routine, no approval record needed)

```bash
# From a feature branch, tests already green:
git add <specific files>              # never `git add -A`/`.` blindly
git commit -m "..."

git checkout develop
git merge --no-ff <feature-branch> -m "Merge branch '<feature-branch>'"
git push origin develop
git branch -d <feature-branch>
```

Do this as the normal way a finished task/proposal wraps up — no need to
wait for the user to separately ask for this merge, and no approval record
to write for it. Pushing `develop` is what triggers this project's
separate staging deployment (external to this repo).

### Stage 2 — `develop` → `master` (production; requires a live instruction + approval record)

**`develop`'s `config.yaml` deliberately differs from `master`'s** (name,
slug, version format, port — see `config.yaml`'s own comment and
CLAUDE.md's "Branch strategy" section, staging needs a distinct HA
Supervisor identity so it can run side by side with production). A plain
merge silently carries `develop`'s side of those lines into `master`
(git's 3-way merge takes the only side that changed, no conflict raised)
— so this stage always needs one manual fix-up step after merging, before
pushing:

```bash
git checkout master
git merge --no-ff develop -m "Merge develop into master: <summary>"

# The merge above just clobbered config.yaml's identity with develop's
# staging values (name/slug/port) -- restore production identity by hand:
#   name: "Guest Jukebox"
#   slug: "guest_jukebox"
#   ports: 8085/tcp: 8085
#   SPOTIFY_REDIRECT_URI default: http://127.0.0.1:8085/api/auth/callback
# Bump `version` to the next PRODUCTION version (no "-staging" suffix --
# this is independent of whatever version string development was using on
# `develop`), and add a matching CHANGELOG.md entry (HA Supervisor won't
# offer an update on an unchanged version -- see config.yaml's own comment).

node scripts/check-config-identity.mjs   # must print OK before proceeding

git add config.yaml CHANGELOG.md
git commit -m "Restore production identity + version bump for <summary>"
git push origin master
```

Never skip the `check-config-identity.mjs` run, and never push if it
fails — that's exactly the "staging identity leaked into production" bug
this script exists to catch (same spirit as `check-stray-backend.mjs` for
BACKLOG.md items #20/#22: a "remember to fix it" instruction alone wasn't
reliable, so this is a real, runnable check instead).

This add-on has `auto_update: true` (confirmed via the HA check below), so
pushing to `master` with a bumped `config.yaml` version is normally
sufficient for the live instance to update on its own within a short
window — no separate manual "deploy" step for the HA add-on path. This is
the step that reaches guests at an actual party — never do it without the
approval-record check above.

## Home Assistant: read-only checks (preferred)

Requires `HASS_SERVER`/`HASS_TOKEN` env vars (already configured in this
environment) and/or LAN reachability to the add-on's own port.

**Confirm the add-on actually updated** (the single most useful check —
this is what resolved a real "did my fix even deploy?" confusion):

```bash
hass-cli state get update.guest_jukebox_update
# or, for the version numbers directly:
curl -s -H "Authorization: Bearer $HASS_TOKEN" \
  http://homeassistant.local:8123/api/states/update.guest_jukebox_update
```
Look at `installed_version` vs `latest_version` in the attributes — equal
means it's live.

**Spot-check the deployed app's own health** (never loop this):

```bash
curl -s http://<ha-lan-ip>:8085/api/now-playing
curl -s http://<ha-lan-ip>:8085/api/device
```

**List/inspect any HA entity** (general-purpose, rarely needed for this
app specifically):

```bash
hass-cli state list
hass-cli state get <entity_id>
```

## Home Assistant: state-changing actions (use deliberately, say why first)

```bash
# Restart just this add-on (not a host restart):
hass-cli service call hassio.addon_restart --arguments addon=guest_jukebox
hass-cli service call hassio.addon_start   --arguments addon=guest_jukebox
hass-cli service call hassio.addon_stop    --arguments addon=guest_jukebox
```

There is no `hassio.addon_update`/rebuild service exposed this way — a
version update happens via `auto_update` (above) or the Add-on Store UI;
supervisor-role SSH access (below) can also drive it via the `ha` CLI if
ever needed, but restarting is almost always sufficient.

## Home Assistant: SSH (only once the user has granted it)

The SSH add-on ("Advanced SSH & Web Terminal") is already installed on this
HA instance. Access requires the user to add a supervisor-generated public
key to that add-on's `authorized_keys` config and restart it — this is
never something the supervisor role does to itself; it's requested from the
user and confirmed working before use.

```bash
ssh -i <path-to-dedicated-private-key> -p <configured-port> root@homeassistant.local "ha addons logs guest_jukebox"
ssh -i <path-to-dedicated-private-key> -p <configured-port> root@homeassistant.local "ha addons info guest_jukebox"
```

Use this only for reading logs / confirming add-on state that `hass-cli`
can't reach (raw container log tail, testing outbound network from inside
the container, e.g. `curl -v https://api.spotify.com`). Never use it for
host-level administration (see Guardrail 5/6).

## Android: adb (Master Device verification only)

Requires the phone already connected (wireless debugging or USB) — never
initiate pairing/enable developer options on the user's behalf; assume it's
already set up, and ask if it isn't.

```bash
adb devices -l                          # confirm the Master Device is connected, get its serial
adb -s <serial> install -r <path-to-apk-built-from-this-repo>
adb -s <serial> logcat -d | grep -i jukebox   # one-shot dump, not a live/streaming tail left running
```

Never `adb -s <serial> shell` into arbitrary commands beyond what's needed
to install/verify this app's build, and never factory-reset, wipe, or
change system settings on the device.
