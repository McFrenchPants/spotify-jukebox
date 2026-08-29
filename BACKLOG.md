# Backlog

Running list of change requests that aren't scheduled yet. Add new items at the
bottom of the list with a status; move to "Done" (or delete) once shipped.

Status legend: `idea` (not scoped), `needs research`, `ready`, `in progress`, `done`

---

## 1. Lyrics integration
**Status:** needs research

Show lyrics for the currently playing track. Needs research into providers —
whether there's a usable free API (e.g. lrclib, Musixmatch's unofficial API)
or whether a paid API (Musixmatch, Genius) is the more reliable route.
Licensing/ToS should be checked before committing to a provider.

## 2. Landscape layout for the bridge device
**Status:** design spec reviewed, ready for implementation plan

Reframed during scoping: phone stays the primary target for both the bridge
device and guests, but the app should respond well to tablets and desktop
too, not just handle a landscape-orientation special case. Design spec:
[docs/proposals/landscape-layout/DESIGN_SPEC.md](docs/proposals/landscape-layout/DESIGN_SPEC.md) —
nav switches to a fixed icon+label left rail at `sm` (640px), content width
steps from 512px → 672px → capped at 1200px. Still needs a
`feature/landscape-layout` branch before implementation starts (held off
since another session has unrelated proposal work uncommitted in this same
working directory).

## 3. Favorites / like a song
**Status:** idea

Let a guest heart/like a song to add it to a favorites list, and let them
review favorites quickly to re-add them to the queue. Needs a data model
(likely session- or device-scoped, not Spotify-account-scoped, since guests
don't log in) and UI for both liking and browsing favorites.

## 4. On-demand QR code on the Now Playing screen
**Status:** idea

Add a small icon/affordance on the main (now playing) screen that reveals the
QR code for controlling the jukebox from a guest's own phone. Intent: when the
bridge device is sitting on a table unattended, people nearby should be able
to discover that they can control it remotely. Placement TBD — should not
clutter the primary layout.

## 5. Move "Playback Device" above "Queue Moderation" in Settings
**Status:** done

Reordered in [SettingsPage.tsx](frontend/src/pages/SettingsPage.tsx) —
`DeviceSelector` now renders directly above `QueueModeration`.

## 6. Trust mode toggle: "Restricted" label overlaps the switch
**Status:** done

Widened the `Switch` component ([Switch.tsx](frontend/src/components/ui/Switch.tsx))
from 7.5rem to 11rem (each half-label area from 60px to ~88px) and its pill
to match, so "Restricted" now fits inside its half without the sliding
"Trusted" pill covering it. Verified via DOM measurement in both toggle
states — the label's `scrollWidth` (85px) now fits inside its `clientWidth`
(~85.3px) instead of overflowing a 60px box. Also added `truncate` as a
safety net in case a future label is even longer.

## 7. Play count display seems to undercount plays
**Status:** display bug fixed — watch for recurrence

Reported: a track that's "definitely" been played several times shows
"Played 1 time" when expanding the Now Playing card.

Findings so far:
- There's no retention limit or cleanup job on `play_history` /
  `track_stats` in production code (only test suites `DELETE FROM` those
  tables) — [trackStats.ts](backend/src/db/trackStats.ts) counts are
  unbounded and never pruned.
- The Now Playing card's play count
  ([NowPlaying.tsx:170-174](frontend/src/components/nowplaying/NowPlaying.tsx:170))
  gets its number by calling `getLeaderboard()` with **no limit**, which
  defaults to the **top 10** tracks server-side
  ([trackStats.ts:95](backend/src/db/trackStats.ts:95),
  [api.ts:152](frontend/src/lib/api.ts:152)), then finding this track in that
  list. If the track isn't currently in the top 10 by play count, the lookup
  finds no match and silently shows 0 — this is a plausible bug (using a
  top-N leaderboard as a single-track lookup) but doesn't by itself explain a
  count of "1" rather than "0".
  - Fix direction: add a dedicated single-track stats lookup/endpoint instead
    of reusing the leaderboard, or bump the leaderboard call's limit high
    enough to always include the current track.
- Plays are only recorded in
  [nowPlaying.ts](backend/src/spotify/nowPlaying.ts:281-312) when the poller
  (every ~4s) detects the currently-playing track id or play/pause state
  actually change from the *in-memory* `lastState`. Two things can suppress a
  legitimate replay from being counted:
  - `lastState` resets on backend restart, but that would cause over- not
    under-counting.
  - Spotify sometimes has multiple distinct track IDs for what a person
    perceives as "the same song" (album version vs. single/remaster/radio
    edit). Plays under a different ID are tracked completely separately in
    `track_stats`, which would explain a low count for a song the user
    recognizes as familiar.
- **Fixed:** added a dedicated `GET /api/leaderboard/track/:trackId` endpoint
  ([leaderboard.ts](backend/src/routes/leaderboard.ts)) backed by
  `getTrackPlayCount()` ([trackStats.ts](backend/src/db/trackStats.ts)), which
  reads a track's full play_count directly instead of scanning the top-10
  leaderboard. [NowPlaying.tsx](frontend/src/components/nowplaying/NowPlaying.tsx:170)
  now calls this instead of `getLeaderboard()`.
- If a count still looks low after this fix for a specific song, the
  remaining suspect is Spotify serving a different track ID for what feels
  like "the same song" (remaster/single/radio edit vs. album version) — those
  are tracked as separate rows in `track_stats` and can't be merged from the
  UI side. Worth checking the actual `spotify_track_id` values next time it
  comes up.

## 8. Master Device Mode — Android app build + local volume control on the bridge device
**Status:** in progress — design spec in review

Spotify's API reports `supports_volume: false` for phones acting as a Spotify
Connect receiver (confirmed live against the real deployment: the bridge
Pixel 7 Pro reports `supports_volume: false` while desktop-class devices on
the same account report `true`) — this is a platform-level Spotify Connect
limitation, not fixable via scopes or app code. Since the physical jukebox
enclosure's audio path may run entirely through that Android phone (Bluetooth
speaker with no native Spotify Connect support of its own), guest-facing
in-app volume control doesn't work for that setup today.

Proposed direction: wrap the existing web app with Capacitor to produce an
installable native Android build with direct `AudioManager` access, add a
"this is the Jukebox device" designation in Settings, and have the backend
push volume commands to that specific client over the existing SSE event bus.
The regular web deployment (Docker / HA Add-on) is unaffected — this is an
additional build target from the same repo, not a replacement.

Design spec: [docs/proposals/master-device-mode/DESIGN_SPEC.md](docs/proposals/master-device-mode/DESIGN_SPEC.md)
(branch `feature/master-device-mode`). Implementation plan to follow after
design review.
