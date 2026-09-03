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

```bash
# Version bump + changelog, if the change is user-visible (see config.yaml's
# own comment: HA Supervisor won't offer an update on an unchanged version):
# bump config.yaml's version, add a CHANGELOG.md entry, commit that too
# (on develop, before promoting).

git checkout master
git merge --no-ff develop -m "Merge develop into master: <summary>"
git push origin master
```

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
