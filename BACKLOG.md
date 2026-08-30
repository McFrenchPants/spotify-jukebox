# Backlog

Running list of change requests that aren't scheduled yet. Add new items at the
bottom of the list with a status; move to "Done" (or delete) once shipped.

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

Every item below should eventually have a corresponding
`analysis/NN-slug.md` (NN = the item number, zero-padded to 2 digits) that
goes deeper than this single-paragraph backlog entry: what problem it's
actually solving, what's been learned so far, open questions, and (once
known) acceptance criteria. This is the step *before* a design doc — it's
where ambiguity gets surfaced and questioned, not resolved by assumption.

- If an item's `**Analysis:**` line below says "not yet written," that's a
  gap. When `/continue-development` (or anyone) picks up an item with no
  analysis file, writing that analysis — including asking the user
  clarifying questions where the item is genuinely underspecified — is
  itself a legitimate first unit of work, done *before* jumping to a design
  spec or code.
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
- Items that already shipped, or that already have a full
  `docs/proposals/<name>/DESIGN_SPEC.md`, don't need a separate analysis
  file — the design spec (or the shipped result) supersedes it. Marked
  `N/A` below.
- Analysis files are working documents, not backlog items themselves — they
  don't get a status, and they're expected to end in open questions for
  items still at `idea`/`needs research`.

---

## 1. Lyrics integration
**Status:** needs research
**Type:** enhancement
**Analysis:** analysis/01-lyrics-integration.md (not yet written)

Show lyrics for the currently playing track. Needs research into providers —
whether there's a usable free API (e.g. lrclib, Musixmatch's unofficial API)
or whether a paid API (Musixmatch, Genius) is the more reliable route.
Licensing/ToS should be checked before committing to a provider.

## 2. Landscape layout for the bridge device
**Status:** done
**Type:** enhancement
**Analysis:** N/A — shipped

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
**Type:** enhancement
**Analysis:** N/A — shipped (pending merge)

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
**Type:** enhancement
**Analysis:** analysis/04-qr-code-now-playing.md (not yet written)

Add a small icon/affordance on the main (now playing) screen that reveals the
QR code for controlling the jukebox from a guest's own phone. Intent: when the
bridge device is sitting on a table unattended, people nearby should be able
to discover that they can control it remotely. Placement TBD — should not
clutter the primary layout.

## 5. Move "Playback Device" above "Queue Moderation" in Settings
**Status:** done
**Type:** enhancement
**Analysis:** N/A — shipped

Reordered in [SettingsPage.tsx](frontend/src/pages/SettingsPage.tsx) —
`DeviceSelector` now renders directly above `QueueModeration`.

## 6. Trust mode toggle: "Restricted" label overlaps the switch
**Status:** done
**Type:** bug
**Analysis:** N/A — shipped

Widened the `Switch` component ([Switch.tsx](frontend/src/components/ui/Switch.tsx))
from 7.5rem to 11rem (each half-label area from 60px to ~88px) and its pill
to match, so "Restricted" now fits inside its half without the sliding
"Trusted" pill covering it. Verified via DOM measurement in both toggle
states — the label's `scrollWidth` (85px) now fits inside its `clientWidth`
(~85.3px) instead of overflowing a 60px box. Also added `truncate` as a
safety net in case a future label is even longer.

## 7. Play count display seems to undercount plays
**Status:** display bug fixed — watch for recurrence
**Type:** bug
**Analysis:** analysis/07-play-count-undercount.md (not yet written — worth
writing if this recurs, to capture the track-ID-fragmentation theory below
as a real open question rather than a footnote)

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
**Status:** done
**Type:** enhancement
**Analysis:** N/A — see design spec below

Spotify's API reports `supports_volume: false` for phones acting as a Spotify
Connect receiver (confirmed live against the real deployment: the bridge
Pixel 7 Pro reports `supports_volume: false` while desktop-class devices on
the same account report `true`) — this is a platform-level Spotify Connect
limitation, not fixable via scopes or app code. Since the physical jukebox
enclosure's audio path may run entirely through that Android phone (Bluetooth
speaker with no native Spotify Connect support of its own), guest-facing
in-app volume control doesn't work for that setup today.

Shipped: the existing web app is now also buildable (`npm run build:android`)
as an installable native Android app via Capacitor, with a custom plugin
giving it direct `AudioManager` access. A "this is the Jukebox device"
designation in Settings registers a specific installed client; the backend
routes volume commands to it over the existing SSE event bus instead of
Spotify's Volume API when it's registered and online. The regular web
deployment (Docker / HA Add-on) is unaffected — this is an additional build
target from the same repo, not a replacement. **Confirmed working against
real hardware** (the actual bridge Pixel 7 Pro + Bluetooth speaker) — the
guest volume slider genuinely changes real audio output.

Getting a real build working also surfaced and fixed several real gaps the
original design didn't anticipate: no way for the native app to know the
backend's LAN address (added a first-run setup screen), no CORS support on
the backend for the native app's cross-origin requests, Android's default
cleartext-HTTP block, and Capacitor's default HTTPS-origin causing a
mixed-content block — all fixed on the branch. Also found (and fixed) that
the guest volume slider was seeded from a hardcoded default instead of the
device's real current volume. Two related rough edges were deliberately
**not** fixed here and are tracked separately: item 19 (the Jukebox device's
volume can still drift out of sync if changed on the phone directly — no
live read-back exists yet) and item 9 (a sharper root-cause understanding of
the pre-existing stale-Now-Playing/queue issue, found during this testing).

Design spec: [docs/proposals/master-device-mode/DESIGN_SPEC.md](docs/proposals/master-device-mode/DESIGN_SPEC.md).
Self-hoster docs: [docs/MASTER_DEVICE_MODE.md](docs/MASTER_DEVICE_MODE.md).
Full implementation/session history:
[docs/proposals/master-device-mode/PROGRESS.md](docs/proposals/master-device-mode/PROGRESS.md).
Implemented on `feature/master-device-mode`, merged to `master`.

## 9. Spotify 429 "Too Many Requests" — stale/stuck Now Playing after idle, device list fails in Settings
**Status:** done
**Type:** bug
**Analysis:** [analysis/09-spotify-429-rate-limiting.md](analysis/09-spotify-429-rate-limiting.md)

Recurring issue: after the bridge device/app had been idle a while, the app
showed a track playing that wasn't actually current, stuck once its timer
ran out — refresh didn't fix it — even though the bridge device itself kept
playing correctly. Separately, Settings' device picker sometimes showed
"device list failed, too many requests." Turned out to be three independent
bugs, not one:

1. **`GET /api/now-playing` silently served a frozen cache** during an
   active rate-limit backoff, with no staleness signal — even a full page
   reload got the same frozen snapshot. Fixed: the route now also returns
   `polledAt`/`rateLimited` so a stale snapshot is at least detectable.
2. **`listDevices()`'s Web API 429 threw a plain `Error`** instead of the
   `SpotifyRateLimitedError` type `classifySpotifyAuthError()` already
   handled cleanly elsewhere (the token-endpoint 429 case) — it fell through
   to a generic 502 with the raw Spotify error text. Fixed: throws the right
   type, reuses existing classification, no new logic needed.
3. **An SSE reconnect never triggered any consumer to refetch** —
   `RootLayout`'s shared `refreshKey` (read by both `NowPlaying` and
   `QueueList`) only bumped on a manual "tap to refresh" banner click, which
   auto-hides the instant the connection reopens — so a quick silent
   drop-and-recover (very plausible for a long-running bridge-device tab:
   WiFi power-saving, Android Doze mode, a brief network blip) left stale
   state with no visible recovery path. Fixed: `useEventStream` now exposes
   a `reconnectedAt` signal that only fires on a genuine drop-then-reopen
   (never on the initial mount), and `RootLayout` auto-bumps `refreshKey` on
   it — resyncing every `refreshKey` consumer automatically.

All three implemented independently in parallel, verified together
(338/338 backend tests, clean typecheck both sides, clean frontend
build/lint). Implemented on `fix/stale-now-playing-429`.

## 10. Desktop: playback controls/volume slider centered but labels aren't
**Status:** ready
**Type:** bug
**Analysis:** analysis/10-desktop-volume-slider-alignment.md (not yet
written — but this one's small enough it could reasonably skip straight to
a fix; write the analysis first only if scope creeps)

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
**Type:** enhancement
**Analysis:** analysis/11-favorites-two-column-layout.md (not yet written)

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
**Type:** enhancement
**Analysis:** N/A — copy change, trivial enough to skip an analysis file

The button that queues a favorited track currently just says "Add":
[FavoriteRow.tsx:75](frontend/src/components/favorites/FavoriteRow.tsx:75)
(`status === 'adding' ? 'Adding…' : status === 'added' ? 'Added' : 'Add'`).
Change the default label to "Add to Queue" (and consider whether "Adding…"
should become "Adding to Queue…" for consistency).

## 13. Nav order: move "Me" to the end, after "Settings"
**Status:** ready
**Type:** enhancement
**Analysis:** N/A — single array reorder, trivial enough to skip an analysis file

Swap the order of the last two nav items. Currently `NAV_ITEMS` in
[navItems.tsx:58-64](frontend/src/components/nav/navItems.tsx:58-64) lists
Now Playing, Find Music, History, Me, Settings — Settings should move before
Me so Me is last. Single array reorder, consumed by both
[BottomNav.tsx:21](frontend/src/components/nav/BottomNav.tsx:21) and
[SideNav.tsx:21](frontend/src/components/nav/SideNav.tsx:21).

## 14. Now Playing expanded card: add more track stats (favorite count, etc.)
**Status:** needs research
**Type:** enhancement
**Analysis:** analysis/14-now-playing-more-stats.md (not yet written)

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

## 15. Artist lookup 502: "Cannot read properties of undefined (reading 'total')"
**Status:** done
**Type:** bug
**Analysis:** N/A — root cause and fix are already fully scoped below

`GET /api/artist/:id` threw for at least one artist ID
(`3QFXxlWMDSRABMc79TKS5U`), surfacing as a generic 502
`spotify_artist_lookup_failed`. Root cause: `getArtist()` in
[client.ts](backend/src/spotify/client.ts) read `artist.followers.total` and
`artist.images[0]` unguarded off the raw Spotify `GET /artists/{id}`
response. When Spotify omits or partially returns `followers`/`images` for a
given artist, that throws a `TypeError`, which isn't a shape the route's
error handler ([artist.ts](backend/src/routes/artist.ts)) recognizes as a
404, so it fell through to the generic 502.

**Fixed**: both fields guarded (`artist.followers?.total ?? 0`,
`artist.images?.[0]?.url ?? null`); `SpotifyArtistResponse`'s `images`/
`followers` typed optional to match observed reality. Added a `getArtist()`
unit test (missing-fields case) and a route-level regression test
confirming `GET /api/artist/:id` now returns 200 instead of 502. Implemented
on `fix/artist-followers-guard`.

## 16. Album art background flashes to black when navigating to Now Playing
**Status:** done
**Type:** bug
**Analysis:** N/A — root cause and fix direction are already fully scoped below

Switching from any page to Now Playing briefly lost the blurred background
album art (went black) while the song-info card's own art stayed visible.
Root cause: `NowPlaying` remounts on route change and initializes its
`snapshot` state to `null`, and an effect fired immediately on mount pushing
that `null` art up to `RootLayout` → `AppShell`, triggering `AppShell`'s
fade-out transition before the real snapshot arrived from the initial fetch
or the next SSE `now-playing` event.

**Fixed**: the `onAlbumArtChange` effect in
[NowPlaying.tsx](frontend/src/components/nowplaying/NowPlaying.tsx) now
returns early while `snapshot` is still the initial unloaded `null`, so a
fresh mount no longer clobbers `RootLayout`'s already-correct background art
— since `snapshot` is only ever set from real data and never reset back to
`null` afterward, this only suppresses the one spurious pre-load call; the
legitimate "nothing playing" case still forwards `null` once actually
loaded. Verified via a mocked-fetch-delay + real-callback-logging approach
(screenshot compositing and computed-style opacity inspection were both
unreliable in that session — the tab was backgrounded, which blocks
`requestAnimationFrame` and makes `AppShell`'s rAF-gated fade-in opacity a
false baseline regardless of the fix). `npm run build`/`npm run lint` clean.
Implemented on `fix/album-art-flash`.

## 17. Make song cards consistent across Leaderboard, Recently Played, Search, and Favorites
**Status:** idea
**Type:** enhancement
**Analysis:** analysis/17-song-card-consistency.md (not yet written)

Every list currently has its own bespoke row component with a different
subset of behavior — no shared `TrackCard`/`SongCard` exists, so the same
song looks and behaves differently depending on which list it's found in:
- [Leaderboard.tsx:30-84](frontend/src/components/leaderboard/Leaderboard.tsx:30-84)
  (`LeaderboardRow`) — favorite toggle only.
- [RecentlyPlayed.tsx:31-77](frontend/src/components/recent/RecentlyPlayed.tsx:31-77)
  (`RecentlyPlayedRow`) — favorite toggle only.
- [TrackRow.tsx:21-74](frontend/src/components/search/TrackRow.tsx:21-74)
  (search results) — add-to-queue only.
- [FavoriteRow.tsx:29-79](frontend/src/components/favorites/FavoriteRow.tsx:29-79) —
  favorite toggle + add-to-queue; its own comment
  ([FavoriteRow.tsx:21-28](frontend/src/components/favorites/FavoriteRow.tsx:21-28))
  admits it's a deliberate copy of `TrackRow` rather than a shared component.
- Click-to-expand-for-more-info exists nowhere in these four lists today —
  it's only implemented on the Now Playing hero card
  ([NowPlaying.tsx:202-223](frontend/src/components/nowplaying/NowPlaying.tsx:202-223)).

Requested: every list should support the same three actions — expand for
details, favorite, add to queue. Likely needs a shared card component
(consolidating the existing bespoke rows, particularly `TrackRow` and the
already-duplicated `FavoriteRow`) rather than bolting the missing actions
onto each row individually.

## 19. Volume slider doesn't stay in sync with the Jukebox device's actual volume
**Status:** ready (Spotify-device case, initial-load half already shipped) / needs research (Jukebox-device case)
**Type:** bug
**Analysis:** N/A — root cause and fix direction already scoped below

Reported during Master Device Mode's real-hardware testing, in two parts:

1. **Initial load**: the guest volume slider started at a hardcoded default
   ([PlaybackControls.tsx:127](frontend/src/components/playback/PlaybackControls.tsx:127),
   `useState(50)`) rather than the device's actual current volume — so the
   first touch snapped real playback volume to wherever the guessed default
   was, an abrupt/surprising jump. **Fixed for the standard Spotify-device
   path**: `GET /api/device` already returns `volume_percent`
   ([api.ts:510](frontend/src/lib/api.ts:510)), now used to seed the slider
   once the device resolves.
2. **Ongoing drift, Jukebox-device path specifically**: even after the fix
   above, adjusting the phone's volume out-of-band (its hardware buttons, or
   Android's own volume UI) leaves every guest's slider stale until they
   themselves touch it — at which point it silently overwrites whatever the
   phone was actually at, rather than reflecting reality first.

Both are really the same underlying gap: **there is no mechanism at all to
read the phone's actual current `AudioManager` volume back into the app** —
neither once on load nor live while the slider is open. The design spec
explicitly scoped this out for v1 (one-way app→phone control only, see
[DESIGN_SPEC.md §4.3](docs/proposals/master-device-mode/DESIGN_SPEC.md)),
accepting it as a known limitation — now confirmed as a real, not just
theoretical, rough edge from actual use. Would need: a `getVolume()`
counterpart to the existing native plugin's `setVolume()`, a way to fetch it
on load (closing gap 1 for this path too), and probably a periodic poll or a
native-side volume-change listener pushed back over SSE to close gap 2 (live
drift) — worth scoping as a proper follow-up rather than a quick patch,
since the live-sync half in particular has real design questions (how often
to poll, whether a guest's own in-flight drag should be interrupted by an
incoming update, etc.).

## 18. Clarify/hide playback-permission settings when a master device is active
**Status:** needs research
**Type:** enhancement
**Analysis:** analysis/18-master-device-permission-clarity.md (not yet
written)

Question raised: when a guest is connected while a Jukebox master device is
designated (item 8), do the admin's global playback-permission toggles
(pause/resume, skip, volume, reorder) still do anything, or does the master
device silently take priority — leaving a setting visible in Settings that
has no real effect?

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
