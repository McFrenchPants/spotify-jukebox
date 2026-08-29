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
**Status:** done

Reframed during scoping: phone stays the primary target for both the bridge
device and guests, but the app should respond well to tablets and desktop
too, not just handle a landscape-orientation special case. Design spec:
[docs/proposals/landscape-layout/DESIGN_SPEC.md](docs/proposals/landscape-layout/DESIGN_SPEC.md) —
nav switches to a fixed icon+label left rail at `sm` (640px), content width
steps from 512px → 672px → capped at 1200px, and HistoryPage/SettingsPage/
NowPlaying reflow side-by-side at `lg` (1024px). Implemented on
`feature/landscape-layout` and merged to `master`. Verified via browser-
emulation DOM/computed-style checks across phone portrait/landscape,
tablet, and desktop widths (screenshot capture wasn't available in the
implementing session's environment); a final pass on the actual bridge
Pixel 7 Pro hardware is still worth doing but isn't blocking.

## 3. Favorites / like a song
**Status:** done

Design spec: [docs/proposals/favorites/DESIGN_SPEC.md](docs/proposals/favorites/DESIGN_SPEC.md).
Guests can heart any track (Now Playing, Queue, History, search results) —
gray/amber/red depending on whether nobody, someone else, or the viewing
guest favorited it — backed by the existing per-browser guest-session
identity (`guest_sessions` + `x-guest-token`), extended with an optional
nickname/avatar settable on a new "Me" tab. Queued tracks show the adder's
nickname/avatar when set. A dedicated Favorites tab on Find Music lists,
sorts, filters, unfavorites, and re-queues. Implemented on
`feature/favorites`; pushed for PR review, not yet merged to `master`.

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

## 9. Spotify 429 "Too Many Requests" — stale/stuck Now Playing after idle, device list fails in Settings
**Status:** needs research

Recurring issue (reported several times before, keeps coming back): after the
bridge device/app has been idle a while, the app shows a track playing that
isn't actually the current track, and when that (stale) track's timer runs
out the UI just sits there acting like something is still playing — refresh
doesn't fix it — even though the bridge device itself is actually still
playing music correctly. Separately, the Settings page's playback-device
picker shows "device list failed, too many requests." Suspect these are the
same root cause: Spotify API rate limiting (HTTP 429).

Starting points for the investigation:
- Now Playing poller runs every 4s
  ([nowPlaying.ts:14](backend/src/spotify/nowPlaying.ts:14),
  [nowPlaying.ts:328-333](backend/src/spotify/nowPlaying.ts:328-333)); poll
  logic at [nowPlaying.ts:209-318](backend/src/spotify/nowPlaying.ts:209-318).
- Device list is fetched from two places:
  [device.ts:38-87](backend/src/spotify/device.ts:38-87) `listDevices()`, via
  a throttled fallback inside the poller
  ([nowPlaying.ts:159-191](backend/src/spotify/nowPlaying.ts:159-191), gated
  to once per 5 minutes), and on-demand from `resolveDevice()`
  ([device.ts:108](backend/src/spotify/device.ts:108)) — the latter is what
  Settings' device picker calls directly, which is the likely source of the
  "too many requests" message.
- A shared 429 backoff already exists
  ([rateLimitBackoff.ts](backend/src/spotify/rateLimitBackoff.ts)): any 429
  arms a 30s (or `Retry-After`-driven) cooldown that background pollers
  check and skip. A code comment there
  ([rateLimitBackoff.ts:13-18](backend/src/spotify/rateLimitBackoff.ts:13-18))
  documents a past real incident: two backend instances (local dev + Home
  Assistant add-on) polling the same Spotify account simultaneously doubled
  request volume and triggered 429s. The backoff is shared within one
  process but **not** across separate deployments/instances — if the user is
  running more than one backend against the same Spotify account (e.g. a dev
  instance left running alongside the HA add-on), that would reproduce this.
- On-demand calls — search, a manual "retry" in Settings, adding to the
  queue — are explicitly **not** gated by the backoff
  ([rateLimitBackoff.ts:7-11](backend/src/spotify/rateLimitBackoff.ts:7-11)),
  so a user clicking around in Settings while the account is already
  rate-limited can trigger a raw, unhandled 429 (hence the error message
  surfacing directly instead of retrying/backing off gracefully).
- Also worth checking: what the frontend does when a poll fails/returns
  stale data — the "stuck on a track that already ended" symptom suggests
  the UI isn't distinguishing "poll failed, keep last known state
  indefinitely" from "poll succeeded, nothing changed," and there's no
  visible reconnect/error state or automatic recovery once rate limiting
  clears.
- Next steps: confirm whether multiple backend instances are actually
  running against production; add a visible "connection lost / stale data"
  UI state instead of silently freezing; consider gating on-demand device
  calls behind the same backoff (with a clear "try again in Ns" message
  instead of a raw error); consider whether the 4s poll interval is more
  aggressive than needed.

## 10. Desktop: playback controls/volume slider centered but labels aren't
**Status:** ready

In [PlaybackControls.tsx](frontend/src/components/playback/PlaybackControls.tsx),
on wide screens the volume slider is centered (`lg:mx-auto lg:max-w-sm` on
the slider input, [PlaybackControls.tsx:263](frontend/src/components/playback/PlaybackControls.tsx:263))
but the "Volume" label above it ([PlaybackControls.tsx:254](frontend/src/components/playback/PlaybackControls.tsx:254))
and the "volume can't be controlled remotely" message (always shown,
[PlaybackControls.tsx:66-67](frontend/src/components/playback/PlaybackControls.tsx:66-67)/[279-280](frontend/src/components/playback/PlaybackControls.tsx:279-280))
stay left-aligned, so on desktop the text visibly sits to the left of the
centered slider/controls instead of lining up with them.

## 11. Find Music page: Favorites should sit alongside search, not in a separate tab, on wide screens
**Status:** idea

On tablet/desktop widths, Favorites shouldn't be a separate tab a guest has
to switch to — it should display side-by-side with search in a two-column
layout (search/queue on one side, favorites on the other). Currently both
live in one component with tab switching, no wide-screen split:
[SearchAndQueue.tsx](frontend/src/components/search/SearchAndQueue.tsx) —
tab state at [SearchAndQueue.tsx:26](frontend/src/components/search/SearchAndQueue.tsx:26),
tab buttons at [SearchAndQueue.tsx:184-197](frontend/src/components/search/SearchAndQueue.tsx:184-197),
Favorites section at [SearchAndQueue.tsx:274-431](frontend/src/components/search/SearchAndQueue.tsx:274-431)
(rendered conditionally, not laid out side-by-side). Should follow the same
`lg` (1024px) breakpoint convention used elsewhere for reflowing to
side-by-side layouts (see item 2).

## 12. Favorites list: rename "Add" button to "Add to Queue"
**Status:** ready

The button that queues a favorited track currently just says "Add":
[FavoriteRow.tsx:75](frontend/src/components/favorites/FavoriteRow.tsx:75)
(`status === 'adding' ? 'Adding…' : status === 'added' ? 'Added' : 'Add'`).
Change the default label to "Add to Queue" (and consider whether "Adding…"
should become "Adding to Queue…" for consistency).

## 13. Nav order: move "Me" to the end, after "Settings"
**Status:** ready

Swap the order of the last two nav items. Currently `NAV_ITEMS` in
[navItems.tsx:58-64](frontend/src/components/nav/navItems.tsx:58-64) lists
Now Playing, Find Music, History, Me, Settings — Settings should move before
Me so Me is last. Single array reorder, consumed by both
[BottomNav.tsx:21](frontend/src/components/nav/BottomNav.tsx:21) and
[SideNav.tsx:21](frontend/src/components/nav/SideNav.tsx:21).

## 14. Now Playing expanded card: add more track stats (favorite count, etc.)
**Status:** needs research

When a guest expands the Now Playing card, it currently shows play count and
artist/genre details ([NowPlaying.tsx](frontend/src/components/nowplaying/NowPlaying.tsx),
expand toggle at [NowPlaying.tsx:60](frontend/src/components/nowplaying/NowPlaying.tsx:60)/[212](frontend/src/components/nowplaying/NowPlaying.tsx:212),
play count at [NowPlaying.tsx:280-284](frontend/src/components/nowplaying/NowPlaying.tsx:280-284),
artist/genre block at [NowPlaying.tsx:288-329](frontend/src/components/nowplaying/NowPlaying.tsx:288-329)).
Requested: show how many guests have favorited the current track (data we
already have via the favorites feature, item 3), plus whatever other
interesting stats are feasible.

Spotify API research (as of 2026): Spotify deprecated `audio-features`,
`audio-analysis`, `recommendations`, and `related-artists` for apps without
an existing extended-quota grant (November 2024) — so per-track attributes
like danceability/energy/tempo/key/valence are **not** available to this app
and shouldn't be planned around. Still available from the standard
`GET /tracks/{id}`, `GET /artists/{id}`, and `GET /albums/{id}` endpoints:
track popularity score (0-100), explicit flag, duration, release date,
album art/type, and artist-level popularity, follower count, and genres.
Realistic stat additions: track popularity score, artist follower count,
artist genres (if not already shown), and album release date — alongside
the in-app favorite count.
