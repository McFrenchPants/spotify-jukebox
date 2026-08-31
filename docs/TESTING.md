# Local testing procedures

Everything in this file runs **entirely inside this repo, on this machine**
— no network access beyond `npm`/`pip`-style package resolution, no SSH, no
`adb`, no reaching the Home Assistant server or any deployed instance of the
app. This is the complete test suite any agent implementing a change should
run before handing off — see [../CLAUDE.md](../CLAUDE.md) and
[SUPERVISOR_RUNBOOK.md](SUPERVISOR_RUNBOOK.md) for why live/remote
verification is a separate, more restricted step.

## Backend

```bash
cd backend
npx tsc --noEmit     # typecheck
npx vitest run       # full unit/integration test suite (in-memory SQLite, no real Spotify calls)
```

Both must be clean (typecheck: no output; vitest: all green) before a change
is considered done. The test suite mocks Spotify's HTTP calls throughout —
nothing in `npx vitest run` ever makes a real network request.

## Frontend

```bash
cd frontend
npx tsc --noEmit     # typecheck
npm run build        # production build, catches anything tsc alone misses (e.g. Vite-specific issues)
```

There is no frontend unit test suite as of this writing — typecheck + a
clean build is the bar. If you're verifying a UI change visually, use the
Browser pane against `npm run dev` (local Vite dev server, still entirely
local) — never against the deployed Home Assistant add-on.

## Android (`frontend/android/`, Master Device Mode only)

Native Java/Capacitor changes can be typechecked/built locally:

```bash
cd frontend/android
./gradlew assembleDebug
```

This compiles the app without touching a device. **Installing the build,
reading logcat, or otherwise exercising it on the real Master Device phone
is supervisor-only** (see [SUPERVISOR_RUNBOOK.md](SUPERVISOR_RUNBOOK.md)) —
it requires `adb` access to hardware outside this repo/machine boundary.

## What "local" deliberately excludes

None of the above should ever need, and should never attempt:
- `git push`, or merging into `master` (see [CLAUDE.md](../CLAUDE.md))
- `ssh`, `hass-cli`, or any HTTP request to the Home Assistant host
  (`homeassistant.local` / its LAN IP) or the live add-on's API
- `adb` commands against a physical device
- Any credential, token, or key beyond what's already in this repo's own
  `.env`/test fixtures

If a task seems to require one of those to verify it's "really" done, that's
a signal the task has crossed into deployment/live-verification territory —
flag it rather than reaching for those tools directly; that step belongs to
the supervisor role.
