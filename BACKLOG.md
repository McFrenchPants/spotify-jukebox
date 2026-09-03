# Backlog

Running list of change requests that aren't scheduled yet. Add new items at
the bottom of the list with a status. **Once an item ships, its entry moves
out of this file entirely** — condense it into a short paragraph (the
problem, the approach taken, and the branch/release it shipped on — not
implementation detail) in
[docs/proposals/ARCHIVE.md](docs/proposals/ARCHIVE.md), then delete it from
here. This file is meant to stay short enough to scan in one pass; the
archive is where shipped work's history lives.

Status legend: `idea` (not scoped), `needs research`, `ready`, `in progress`, `done`

Type legend:
- `bug` — something is broken relative to how the app is already supposed to
  behave (a crash, a visual defect, incorrect data, a regression).
- `enhancement` — a new capability, a design/UX change, or a preference —
  even when the fix would be trivial to implement, this is not "wrong,"
  it's a choice. Nothing here should be treated as a firm requirement just
  because it's written down — several of these are half-formed and need
  brainstorming or a design pass before they're worth building.

## Analysis files

Once an item gets its first real investigation (not just this one-paragraph
entry), it gets its own `docs/proposals/<slug>/ANALYSIS.md` — the step
*before* a design doc, where ambiguity gets surfaced and questioned, not
resolved by assumption. That folder then holds everything generated for
this change over its life (analysis → design spec → implementation plan →
its own progress log), so there's one place to look, not several. On
completion, its content gets condensed into one `ARCHIVE.md` entry (see
above) and the folder is deleted — git history keeps every draft if it's
ever actually needed again.

- If an item below has no `**Analysis:**` line, that's a gap. When
  `/continue-development` (or anyone) picks up an item with no analysis
  yet, writing it — including asking the user clarifying questions where
  the item is genuinely underspecified — is itself a legitimate first unit
  of work, done *before* jumping to a design spec or code.
- **Backlog entries are raw, not vetted.** They're often a one-line
  reaction someone had in the moment — not a scoped, pre-approved plan.
  Don't treat an entry's existence as proof the work is worth doing.
  Writing the analysis means genuinely scrutinizing the item first:
  - What problem is it actually solving, and for whom (guest, admin,
    self-hoster)? If that's unclear, say so rather than inventing a
    plausible-sounding justification.
  - What value does it bring relative to its cost/complexity? An idea can
    be legitimate and still not worth building right now.
  - Are there simpler or more elegant ways to reach the same underlying
    goal than the literal thing the entry describes (including "don't
    build this, do X instead" or "this is actually already covered by
    Y")?
  - Is this even a good idea? A skeptical first pass belongs in the
    analysis file, not just agreement plus scoping.
  - Read the item's `**Type:**` line for the amount of latitude to
    expect: `enhancement` entries are explicitly not firm requirements
    (per the Type legend above) and should be scrutinized hardest;
    `bug` entries still deserve a sanity check on whether the described
    behavior is really wrong, but less license to second-guess the goal
    itself.
  - **Before the analysis file is considered complete, check in with the
    user at least once**: share the initial assessment (the problem
    reading, the value judgment, any alternatives found) and ask for
    their reaction — confirmation, correction, or a steer — before
    finalizing the document. This is a real checkpoint, not a formality;
    don't write it as a rhetorical question you then answer yourself in
    the same pass. Only skip it if the user explicitly says to proceed
    without checking in on a given item or for a stretch of work.

---

## 18. Clarify/hide playback-permission settings when a master device is active
**Status:** needs research
**Type:** enhancement
**Analysis:** not yet written

Question raised: when a guest is connected while a Jukebox master device is
designated (see `docs/proposals/ARCHIVE.md` item 8), do the admin's global
playback-permission toggles (pause/resume, skip, volume, reorder) still do
anything, or does the master device silently take priority — leaving a
setting visible in Settings that has no real effect?

What was found: the permission gate itself is *not* bypassed by master-device
routing — every playback action (including volume) still passes through
`checkTrustModeGate()` / `resolveEffectivePermission()` before the
master-device branch runs
([playback.ts:39-53](backend/src/routes/playback.ts:39-53), volume path at
[playback.ts:150-161](backend/src/routes/playback.ts:150-161)), so the
toggles in [SettingsForm.tsx:51-56](frontend/src/components/admin/SettingsForm.tsx:51-56)
aren't dead. However, a related staleness issue was found while checking
this: `PlaybackControls` fetches jukebox-device online status
(`GET /api/trust-mode`) once on mount with no live SSE update
([PlaybackControls.tsx:104-113,131-144](frontend/src/components/playback/PlaybackControls.tsx:104-113)),
and `volumeAllowed` is computed from that snapshot
([PlaybackControls.tsx:219](frontend/src/components/playback/PlaybackControls.tsx:219)) —
so if the Jukebox bridge device goes offline mid-session, the volume slider
can keep rendering as enabled until the guest refreshes, even though a
submitted change would now silently no-op or fall back to the
"can't control volume remotely" copy. Worth deciding: (a) should this stale
state be fixed by pushing device-online changes over SSE, and (b) is there a
genuinely dead/no-op setting in this scenario that the original report had
in mind — worth re-confirming the specific setting/scenario with the
reporter before scoping further.

## 27. Jukebox device card shows its "native app only" note on every device, not just the master device

**Status:** idea
**Type:** enhancement

In Settings, [JukeboxDeviceCard.tsx:74-80](frontend/src/components/admin/JukeboxDeviceCard.tsx:74-80)
renders an explanatory note — "Jukebox device mode is only available from
the native Android app..." — whenever `!Capacitor.isNativePlatform()`, i.e.
on every browser-based admin session, regardless of whether a Jukebox
master device (see `docs/proposals/ARCHIVE.md` item 8) is even configured
for this deployment. Reported: this section shouldn't show at all except
on the master device itself.

Worth deciding during scoping: what "shouldn't show" should actually mean
here — (a) hide it on every non-native/non-master session unconditionally,
or (b) keep showing it on non-native admin sessions only until a master
device has been registered at all (so a fresh deployment's admin still
discovers the feature exists, matching the intent described in the
component's own comment at
[JukeboxDeviceCard.tsx:23-26](frontend/src/components/admin/JukeboxDeviceCard.tsx:23-26):
"browser-only admins know the feature exists"), then hides it once one is
registered. Whichever behavior is wanted, the card already has the data it
needs (`registeredClientId` from `GET /api/jukebox-device`) to condition
on "is a master device registered" — it just isn't used to gate the
non-native branch today.
