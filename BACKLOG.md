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
**Status:** done
**Type:** enhancement
**Analysis:** [analysis/01-lyrics-integration.md](analysis/01-lyrics-integration.md)

Shipped: a "Lyrics" button on the Now Playing card reveals synced lyrics
(via [LRCLIB](https://lrclib.net/), free/open, no ToS risk) that
auto-scroll in time with playback, with a tap-to-expand for free scrolling.
Backend fetches lyrics once per track change and fans out over the existing
SSE bus (same poll-once/fan-out pattern as now-playing state); non-favorited
tracks' cache entries are evicted when the track changes, favorited tracks'
lyrics persist indefinitely. A track with no LRCLIB match shows a plain
empty state; unsynced-only lyrics render as static text. Full
design/implementation history in
`docs/proposals/lyrics-integration/` (DESIGN_SPEC.md, IMPLEMENTATION_PLAN.md,
PROGRESS.md). Implemented on `feature/lyrics-integration`, not yet merged
to `master` (pending user go-ahead).

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
**Analysis:** N/A — shipped

Design spec: [docs/proposals/favorites/DESIGN_SPEC.md](docs/proposals/favorites/DESIGN_SPEC.md).
Guests can heart any track (Now Playing, Queue, History, search results) —
gray/amber/red depending on whether nobody, someone else, or the viewing
guest favorited it — backed by the existing per-browser guest-session
identity (`guest_sessions` + `x-guest-token`), extended with an optional
nickname/avatar settable on a new "Me" tab. Queued tracks show the adder's
nickname/avatar when set. A dedicated Favorites tab on Find Music lists,
sorts, filters, unfavorites, and re-queues. Implemented on
`feature/favorites`, merged to `master` via PR #1.

## 4. "Connect" nav item on the master device (was: QR code on Now Playing)
**Status:** done
**Type:** enhancement
**Analysis:** [analysis/04-qr-code-now-playing.md](analysis/04-qr-code-now-playing.md)

Reframed during analysis/user check-in (2026-08-30): rather than an
icon/modal on the Now Playing screen shown identically to every device,
the master/bridge device's nav swaps its "Me" tab (a personal
favorites/nickname tab that doesn't apply to a shared bridge device) for a
"Connect" tab, leading to a page with the QR code, guest URL, and brief
instructions — visible only on the one device where it's actually useful.
Scoped to Master Device Mode (item 8) specifically: the swap fires only
when this client's `clientId` matches the registered Jukebox device, via a
new public (unauthenticated) `GET /api/jukebox-device/mine` endpoint.
Implemented on `feature/master-device-connect-nav`, live-verified
end-to-end, not yet merged to `master`.

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
**Status:** done
**Type:** bug
**Analysis:** N/A — root cause and fix are already fully scoped below

In [PlaybackControls.tsx](frontend/src/components/playback/PlaybackControls.tsx),
on wide screens the volume slider was centered (`lg:mx-auto lg:max-w-sm` on
the slider input) but the "Volume" label above it and the "volume can't be
controlled remotely" message stayed left-aligned, so on desktop the text
visibly sat to the left of the centered slider/controls instead of lining
up with them.

**Fixed**: applied `block lg:mx-auto lg:max-w-sm` to the "Volume" `<span>`
and `lg:mx-auto lg:max-w-sm` to the unsupported-volume message paragraph,
matching the input's existing centering. (First attempt put `lg:mx-auto
lg:max-w-sm` on the wrapping `<label>` itself instead — that broke, since
auto margins on a flex item's cross axis disable flex "stretch," collapsing
the label — and its `w-full` input inside it — down to the range input's
tiny ~129px browser-default width. Caught via live DOM/computed-style
inspection before committing, not just a build check.) Verified live via
`getBoundingClientRect()` at a 1280px viewport: label span, input, and
message now share the same centered 384px column. Implemented on
`fix/desktop-volume-slider-alignment`.

## 11. Find Music page: Favorites should sit alongside search, not in a separate tab, on wide screens
**Status:** done
**Type:** enhancement
**Analysis:** [analysis/11-favorites-two-column-layout.md](analysis/11-favorites-two-column-layout.md)

Shipped: at the `lg` (1024px) breakpoint, [SearchAndQueue.tsx](frontend/src/components/search/SearchAndQueue.tsx)
now renders Search and Favorites side-by-side (Search left, Favorites
right, each ~half-width) with the tab toggle hidden entirely — reusing the
same `lg:flex-row`/`lg:w-1/2` pattern already used by item 2's work
(HistoryPage, SettingsPage, NowPlaying). Below `lg`, today's tab-switching
behavior is unchanged. `FavoritesSection` is mount-gated (not just
CSS-hidden) below `lg` so it doesn't eagerly fetch before a guest switches
to that tab. Verified live via the Browser pane at both 375px and 1280px
(computed styles + network requests, not just code review). Implemented on
`feature/favorites-two-column-layout` (off `feature/sdlc-supervisor`, not
yet merged), the first real (non-framework) task run through the
sdlc-supervisor framework's implementer mechanism.

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
**Status:** done
**Type:** enhancement
**Analysis:** N/A — shipped

Button label in [FavoriteRow.tsx](frontend/src/components/favorites/FavoriteRow.tsx)
changed from `'Add'`/`'Adding…'` to `'Add to Queue'`/`'Adding to Queue…'`
(the `'Added'` state was left as-is). Implemented on
`fix/favorites-add-to-queue-copy`.

## 13. Nav order: move "Me" to the end, after "Settings"
**Status:** done
**Type:** enhancement
**Analysis:** N/A — shipped

Swapped the order of the last two entries in `NAV_ITEMS`
([navItems.tsx](frontend/src/components/nav/navItems.tsx)) — order is now
Now Playing, Find Music, History, Settings, Me. Consumed as-is by both
`BottomNav.tsx` and `SideNav.tsx`, no other changes needed. Verified live
via the Browser pane's `read_page`. Implemented on
`fix/nav-me-after-settings`.

## 14. Now Playing expanded card: add more track stats (favorite count, etc.)
**Status:** done
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

**2026-09-03: done.** `ArtistInfoPanel.tsx` replaced by
[SongInfoPanel.tsx](frontend/src/components/artist/SongInfoPanel.tsx) ("About
the song"): play count, favorite count (new —
`getFavoriteStatusForTracks` gained a `favoriteCount` field), plus the
existing artist photo/name/followers/genres, consolidating what used to be
two separate duplicate artist-fetching code paths into one.

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
**Status:** done
**Type:** enhancement
**Analysis:** [analysis/17-song-card-consistency.md](analysis/17-song-card-consistency.md)

Narrowed during analysis/user check-in (2026-08-30): scoped to **favorite
+ add-to-queue consistency only** across all four lists, via one shared
[SongCard.tsx](frontend/src/components/songs/SongCard.tsx) component.
"Expand for details" (the third action in the original ask) is
deliberately deferred, not built now — Now Playing's expand makes sense
for the one track a guest is actively engaged with, but whether it's
wanted in a scanning list context is unproven; revisit as its own item
later if real demand shows up.

Gaps this closed: Search results previously had no favorite button at
all (add-to-queue only); Leaderboard and Recently Played previously had
a favorite toggle but no add-to-queue. The old bespoke
`LeaderboardRow`/`RecentlyPlayedRow`/`TrackRow`/`FavoriteRow` rows are
gone — `TrackRow`/`FavoriteRow` were deleted files, the other two were
inline functions removed from their parent components.

## 21. Unusable add-on logs: no timestamps, "fetch failed" hides the real cause
**Status:** done
**Type:** bug

While troubleshooting item 20's ongoing 503s directly against the live add-on
(`192.168.50.179:8085/api/device` still returned `spotify_rate_limited`, and
`GET /api/now-playing` still showed `polledAt: 0`, even after every stray
local backend was confirmed killed), the user checked the add-on's actual
Supervisor logs and found the real problem was unreadable: dozens of
identical, timestamp-less lines —

```
[nowPlaying] Spotify currently-playing poll failed: fetch failed
```

— with no way to tell when the failures started, whether they were ongoing
or historical, or what actually failed. Two real gaps caused this:

1. Every backend log line was a bare `console.log`/`console.error` call with
   no timestamp — findable in code at
   [index.ts:32](backend/src/index.ts:32),
   [tokenRefresh.ts:113](backend/src/spotify/tokenRefresh.ts:113), and
   [homeAssistantOptions.ts](backend/src/config/homeAssistantOptions.ts), in
   addition to the nowPlaying poller below.
2. Node's `fetch failed` is a generic wrapper `TypeError` — the actual reason
   (DNS resolution failure, connection refused, timeout, etc.) lives in
   `err.cause`, which [nowPlaying.ts](backend/src/spotify/nowPlaying.ts)'s
   poller error handler never read, and every poll failure was logged in
   full every single tick (every 4s) for as long as the underlying problem
   lasted, with zero throttling — the "dozens of identical lines" the user
   saw.

This also clarified item 20: a `fetch failed` TypeError is a **network-level**
failure that never reaches Spotify at all (no HTTP response comes back), so
it's a distinct problem from a real Spotify 429 (which *did* happen — item
20's `/api/device` 503 came from an actual Spotify response). Both were
occurring on the same add-on: at least one stretch of genuine outbound
network flakiness from the Home Assistant container, separate from the
account-level rate-limit/quota state from item 20's duplicate-poller
incident. Root cause of the network flakiness itself (Home Assistant host
networking / DNS) is not yet identified — the logging fix here is what makes
that diagnosable next time instead of guessing from silence.

**Fixed**: added [backend/src/logger.ts](backend/src/logger.ts) — a small
timestamped `logInfo`/`logWarn`/`logError` helper that also unwraps
`err.cause` — and switched every existing `console.*` call site to use it.
[nowPlaying.ts](backend/src/spotify/nowPlaying.ts)'s poller now tracks a
consecutive-failure streak: logs the first failure in full (with cause), one
reminder every ~15 ticks (~1 min) while it continues, and a "recovered after
N consecutive failures" line when it succeeds again — replacing what used to
be either total silence (Spotify-side errors, already handled elsewhere) or
unthrottled per-tick spam (network-level errors, this bug). Deliberately
not a full logging framework (no levels config, no transports) — this is a
single-process self-hosted app whose only log sink is the Supervisor's
plain-text viewer, so timestamp + scope + real error detail is the whole
requirement. 355 backend tests pass, `npx tsc --noEmit` clean on both sides.

**Follow-up (same day)**: after deploying the above, the user restarted the
add-on, reloaded both the guest and Master Device pages, and immediately saw
"Could not connect to Spotify" again — but the logs showed *only* the
startup line, nothing else. That silence was itself a real remaining gap,
not a mystery: a real Spotify 429 response (as opposed to a network-level
`fetch failed`) was, by original design, handled entirely silently —
[rateLimitBackoff.ts](backend/src/spotify/rateLimitBackoff.ts)'s
`recordRateLimitFromResponse()` armed the backoff window with no log output
at all, on the reasoning that "an expected 429 every tick isn't worth
logging." That reasoning holds for a *repeated* 429 during an already-known
backoff, but meant the very first 429 — the one that actually explains why
the app is down — left zero trace. Combined with the restart (which resets
`blockedUntil` to 0 in memory), this meant every restart's very first poll
could silently re-arm the exact same backoff with nothing in the logs to
show it happened, which is exactly what the user hit.

**Fixed**: `recordRateLimitFromResponse()` now logs a warning every time it
actually arms the window — the caller (now-playing poll, device list, or
token refresh), the backoff duration, and the exact resume timestamp — via
an added `source` parameter threaded through from
[nowPlaying.ts](backend/src/spotify/nowPlaying.ts:278),
[device.ts](backend/src/spotify/device.ts:57), and
[tokenRefresh.ts](backend/src/spotify/tokenRefresh.ts:80). This doesn't
change any behavior, only observability — but it's what will finally show
whether what's being hit is a short-lived rate limit or a much longer quota
block, instead of the app just going quiet. 355 backend tests still pass
(rateLimitBackoff.test.ts's existing single-argument calls are unaffected —
`source` defaults to `"spotify"`).

## 20. Spotify rate-limiting recurrence: stray local dev backend + 2026 quota pooling
**Status:** done
**Type:** bug

Recurring "Spotify is rate-limiting requests from this app right now" 503s
on `GET /api/device`/`GET /api/now-playing`, reported again after an
Android/webapp rebuild-and-restart with the party actively in progress.

**Root cause**: a leftover local `tsx watch` backend (`backend/src/index.ts`)
was still running on the dev machine (Windows, port 8085) from an earlier
agent testing session and never got shut down. It held its own Spotify
authorization and was independently polling `/v1/me/player/currently-playing`
every 4s — on top of the live Home Assistant add-on's identical poll — for
the same account, exactly reproducing the incident already documented in
[rateLimitBackoff.ts](backend/src/spotify/rateLimitBackoff.ts). Confirmed via
`netstat`/`tasklist` (stray process found, PID matched a `tsx` process for
this repo) and by hitting the stray instance's own `/api/device`, which
returned the identical `spotify_rate_limited` 503.

**Contributing factor, newly understood**: dev and the HA add-on already use
*separate* Spotify Client ID/secret pairs, but (a) `seedRefreshTokenFromEnv()`
is a convenience for copying one deployment's refresh token to bootstrap
another, which had been used to give local dev a working Spotify connection
via the *same* authorized account as the live add-on, and (b) as of Spotify's
July 2026 Web API quota update, Development Mode quota is now pooled **per
developer account**, not per Client ID — so even fully separate Client IDs
registered under the same Spotify Developer account draw from one shared
quota bucket. Development Mode is also capped at 5 allowlisted Spotify user
accounts, but that only matters for who can *authorize* the app (the admin) —
guests never authenticate with Spotify themselves (they get an app-issued
session token, see P2.2), so guest count doesn't interact with that cap.
Extended Quota Mode (higher, unpooled limits) was checked and ruled out for
this project: as of May 2025 it's organization-only (registered business,
250k+ MAU, six-week review) — not available to a self-hosted personal app.

**Fixed**:
1. Killed the stray local process; confirmed nothing else is listening on
   8085 besides the HA add-on.
2. Added [CLAUDE.md](CLAUDE.md): agents must track and stop any dev server
   they start before ending a session, and must never seed local dev's
   Spotify refresh token from (or into) the live add-on's authorization.
3. `GET /api/now-playing`'s `rateLimited` flag (already added for item 9) is
   now surfaced in the UI: [NowPlaying.tsx](frontend/src/components/nowplaying/NowPlaying.tsx)
   shows "Could not connect to Spotify" instead of "Nothing playing" when the
   snapshot is rate-limited, instead of silently looking like a confirmed
   empty state.
4. Added a short-lived in-memory cache
   ([backend/src/spotify/cache.ts](backend/src/spotify/cache.ts)) for
   `searchTracks` (30s TTL), `getTrack`, and `getArtist` (10min TTL each) in
   [client.ts](backend/src/spotify/client.ts) — reduces redundant Web API
   calls when multiple concurrent guests search for or queue the same
   popular track, or expand the same currently-playing track's artist info,
   without needing a new rate-limit mechanism. Doesn't change the
   now-playing/device poll, which already scales independently of guest
   count (single in-process poller fanned out over SSE — see
   [events/bus.ts](backend/src/events/bus.ts)).

**Not changed / considered and rejected**: registering a wholly separate
Spotify Developer account (different login) for local dev would give dev
testing its own unpooled quota bucket — worth doing if local dev against
live Spotify becomes routine again, but out of scope for this fix since the
immediate cause was a leftover process, not a legitimate concurrent dev
session.

## 19. Volume slider doesn't stay in sync with the Jukebox device's actual volume
**Status:** done
**Type:** bug
**Analysis:** N/A — root cause and fix direction already scoped below

Reported during Master Device Mode's real-hardware testing, in two parts,
both now fixed:

1. **Initial load**: the guest volume slider started at a hardcoded default
   rather than the device's actual current volume — the first touch snapped
   real playback volume to wherever the guessed default was, an
   abrupt/surprising jump. Fixed for the standard Spotify-device path first
   (`GET /api/device`'s `volume_percent`), then for the Jukebox-device path
   here: the native app now reports its real system volume to the backend
   (`getVolume()` on the native plugin, `POST /api/playback/jukebox-volume-report`),
   and the guest slider seeds from it via `GET /api/playback/jukebox-volume`.
2. **Ongoing drift, Jukebox-device path**: adjusting the phone's volume
   out-of-band (hardware buttons, Android's own volume UI) used to leave
   every guest's slider stale until they touched it themselves. Fixed: the
   native app self-reports every 5s, and a new `jukebox-volume-status` SSE
   event keeps every connected guest's slider live-synced. Confirmed via
   user check-in: an incoming update that arrives while a guest is actively
   dragging the slider is parked, not applied or dropped, until they
   release — it never fights an in-progress drag.

Implemented on `feature/jukebox-volume-sync` across backend (new in-memory
volume-status tracking + two endpoints), the native Android plugin, and
`RootLayout.tsx`/`PlaybackControls.tsx`. The design spec's original v1
scoping-out of this ([DESIGN_SPEC.md §4.3](docs/proposals/master-device-mode/DESIGN_SPEC.md))
is superseded by this fix. Native Java changes couldn't be build-verified
in the implementing environment (no Android SDK) — worth a real on-device
test before this ships in a Master Device Mode release.

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

## 22. Recurrence: another stray local backend left running, tripped a real rate limit
**Status:** done
**Type:** bug

Found 2026-09-01 while trying to live-verify item 11's F11.1 task in the
Browser pane: a `node.exe` process (PID 38052) had been `LISTENING` on
`:8085` since 2026-08-31 ~12:48pm — over 21 hours — confirmed to be a real
instance of this backend by hitting `/api/device` and `/api/now-playing`
directly, both of which returned live data including `rateLimited: true`.
This is the exact same failure mode as item 20 (a leftover `tsx watch`
backend left running from an earlier agent session, polling Spotify's
`currently-playing` endpoint every ~4s on top of whatever else is drawing
from the same account's pooled quota) recurring for at least a second time,
despite item 20's fix already adding the CLAUDE.md rule about always
shutting down dev servers started during a session.

**Immediate action taken:** killed PID 38052 directly
(`Stop-Process -Id 38052 -Force`), confirmed via `netstat` that port 8085
has no remaining `LISTENING` socket. Deliberately did **not** start a fresh
local backend afterward to continue F11.1's live verification, since the
account may still be in the rate-limit backoff window this stray process
had just armed, and the live Home Assistant add-on shares the same pooled
quota — starting another local instance right now risks compounding
whatever's currently happening on the real deployment.

**Not yet done / open questions:**
- Which session left this running, and for how long has it actually been
  polling — the process `StartTime` (8/31 ~12:48pm) roughly lines up with
  this same conversation's earlier SS5.1 work, but that task's own
  completion report only shows `vitest run`/`tsc --noEmit` being run, not
  `npm run dev` — worth checking whether an *earlier* session/task in this
  thread started it and never noticed, since the CLAUDE.md rule is
  "shut down what you start," which only works if the agent that started
  it is the one that notices it's still running.
- Whether the live Home Assistant add-on deployment showed any real user-
  facing impact (503s, stale Now Playing) during this window — worth
  checking the add-on's own logs (item 21's timestamped logging should
  make this checkable now) rather than assuming no impact.
- Item 20's existing mitigation (a CLAUDE.md instruction to always shut
  down dev servers) is clearly not sufficient on its own if it's recurring
  — worth considering something more mechanical: a repo-local script/hook
  that lists or kills anything listening on 8085 before/after a session,
  or a periodic reminder baked into a command like `/continue-development`
  itself to check for stray listeners on the backend's port before doing
  any Spotify-touching verification work.

**Shipped 2026-09-02**: [scripts/check-stray-backend.mjs](scripts/check-stray-backend.mjs) —
a real, runnable cross-platform check (Windows `netstat -ano`, macOS/Linux
`lsof -i :<port> -sTCP:LISTEN`) replacing the memory-only CLAUDE.md
instruction, per the "something more mechanical" option above. Reports the
stray PID, its start time, and its process name/command line (best
effort) so it's identifiable as this backend rather than something
unrelated; an opt-in `--kill` flag terminates it, but report-only stays
the default. Resolves the backend's port from `backend/.env`'s `PORT=`,
falling back to `backend/.env.example`, falling back to `8085`.
`CLAUDE.md`'s "Always shut down dev servers you start" section now points
at this script as the recommended check, keeping the old manual
`netstat`/`grep` command documented as a fallback. Scoped deliberately to
the script alone (not wired into `/continue-development` itself) per the
user's choice — the orchestrator suggestion above is left as a possible
future follow-up, not done here. Implemented on
`fix/stray-backend-check-script` (off `master`, not yet merged).

## 23. Uncaught crash on missing `artist.genres` blanks the entire live app
**Status:** done
**Type:** bug

Reported live 2026-09-01 (v1.0.24): the deployed app went fully black with
`Uncaught TypeError: Cannot read properties of undefined (reading
'length')` in the console, alongside a `GET /api/device 503` (a real
Spotify rate-limit, tracked separately as item 22).

**Root cause**: [client.ts](backend/src/spotify/client.ts)'s `getArtist()`
guards `images`/`followers` against Spotify sometimes omitting them for a
given artist ID (fixed for item 15) but never applied the same guard to
`genres` — `genres: artist.genres` is passed through unguarded, and
`SpotifyArtistResponse.genres` is still typed as required `string[]`
despite the same reliability caveat already documented for the other two
fields. [ArtistInfoPanel.tsx:97](frontend/src/components/artist/ArtistInfoPanel.tsx:97)
then calls `artist.genres.length > 0` unguarded, which throws exactly the
reported `TypeError` when `genres` is actually `undefined` at runtime.
Compounding this: **no error boundary exists anywhere in the app** — a grep
for `ErrorBoundary`/`componentDidCatch`/`getDerivedStateFromError` across
`frontend/src` returns nothing — so this one uncaught render error crashes
React's entire tree, unmounting everything and leaving the raw (black)
page background with nothing rendered on top of it. `ArtistInfoPanel`'s own
doc comment says it's meant to "fail silently... since this panel is
decorative, not core functionality," but that intent only covers its own
fetch `.catch()`, not a render-time property-access crash — the two are
different failure modes and only the first was actually guarded against.

**Fixed**:
1. `client.ts`: `genres: artist.genres ?? []` (matching the existing
   `images`/`followers` guard pattern exactly), `SpotifyArtistResponse.genres`
   typed optional with the same reliability comment as `images`/`followers`.
2. `ArtistInfoPanel.tsx`: defense in depth even with the backend fix in
   place — `artist.genres?.length` and `artist.followers?.toLocaleString()`
   guarded so a future unguarded/malformed field on this decorative panel
   degrades gracefully (shows what it can) instead of crashing the whole
   app again.
3. Regression tests added on both sides mirroring item 15's own
   missing-fields test.

**Not done here** (flagged as a real gap, not silently deferred): adding a
top-level React error boundary so *any* future unforeseen render crash
degrades to a "something went wrong, try reloading" message instead of a
silent black screen, rather than relying on guarding every individual
field defensively forever. This is the second time a single unguarded
Spotify-response field has caused a real production issue (item 15's 502,
now this full-app crash) — worth a dedicated follow-up rather than folding
into this already-live-incident-driven fix.

## 24. Replace the constant 4s now-playing poll with event-scheduled polling
**Status:** done
**Type:** enhancement
**Analysis:** [analysis/24-event-scheduled-now-playing-poll.md](analysis/24-event-scheduled-now-playing-poll.md)

The now-playing poller ([nowPlaying.ts](backend/src/spotify/nowPlaying.ts))
calls Spotify's `currently-playing` endpoint every 4 seconds, continuously,
regardless of guest activity — the dominant source of Spotify API load per
[item 22's inventory](analysis/22-spotify-api-call-inventory.md) (~900
calls/hour). User's proposal, confirmed and scoped: since the frontend
already interpolates playback progress locally between snapshots
([NowPlaying.tsx:148-159](frontend/src/components/nowplaying/NowPlaying.tsx:148)),
the backend doesn't need a fresh poll every 4s just to feed a smooth
progress bar — replace the flat interval with event-scheduled polling: an
immediate one-shot poll after this app's own playback actions
(pause/resume/skip/previous), a one-shot poll scheduled around each
track's expected end (to catch Spotify auto-advancing), and a 15-second
safety-net poll for anything else (external/out-of-band changes via a
device's own controls, drift correction, device-status detection).
Estimated ~900/hr → ~150-350/hr depending on skip frequency.

Shipped: [nowPlaying.ts](backend/src/spotify/nowPlaying.ts)'s
`startNowPlayingPoller` rewritten from a flat `setInterval(4000)` to
`setTimeout`-chain scheduling — the next poll fires at whichever is sooner
of an end-of-track estimate (`duration - progress + 750ms buffer`) or a
15s safety-net interval, computed fresh after every poll.
`pollNowPlaying()`'s own logic (track-change detection, play-history/
leaderboard recording, lyrics lookup, device-status) is unchanged — only
the scheduling around it changed. A new exported
`triggerImmediateNowPlayingPoll()` is called (fire-and-forget) from
[playback.ts](backend/src/routes/playback.ts)'s pause/resume/skip/previous
routes right after their Spotify call succeeds, so the app's own actions
get an immediate refresh instead of waiting for the next scheduled tick.
Implemented on `feature/reduce-nowplaying-polling` (off `master`, not yet
merged), via two sdlc-tracked tasks (NP1.1 scheduler, NP1.2 route wiring).

## 25. rateLimitBackoff.ts doesn't distinguish QUOTA_EXCEEDED from an ordinary rate limit
**Status:** done
**Type:** bug

Follow-up from [analysis/22's "concrete follow-up" section](analysis/22-spotify-api-call-inventory.md#concrete-follow-up-this-unlocks).
The user's own research against Spotify's docs confirmed 429s split into
two genuinely different conditions: an ordinary rolling-30s rate limit
(`Retry-After` header, self-clears in seconds) and a `QUOTA_EXCEEDED`
condition (Development Mode's broader resource allocation exhausted,
identified by the 429 response **body**, not headers) — a materially
longer-lived block. [rateLimitBackoff.ts](backend/src/spotify/rateLimitBackoff.ts)'s
`recordRateLimitFromResponse()` currently only ever reads the `Retry-After`
header (or a flat 30s default), so a real `QUOTA_EXCEEDED` block gets the
same short backoff as an ordinary rate limit — the poller waits ~30s,
retries, gets `QUOTA_EXCEEDED` again, waits ~30s again, indefinitely, with
no actual progress and no distinct signal in the logs. This is likely the
real mechanism behind the "stuck for hours, restarts don't help" symptom
from this incident, not just an unusually long ordinary rate limit.

**Fix**: extend `recordRateLimitFromResponse()` to accept the already-parsed
429 response body (each of its three call sites — `nowPlaying.ts`,
`device.ts`, `tokenRefresh.ts` — either already parses the body or can
cheaply do so without a double-read conflict) and check for a
`QUOTA_EXCEEDED` reason (checked at both a top-level `reason` field and a
nested `error.reason`, since the exact shape isn't independently confirmed
against this app's own traffic yet). When found, apply a much longer
backoff than the ordinary 30s default (a named, tunable constant — the
real reset window isn't known, so this is a documented engineering
estimate, not confirmed data) and a distinctly worded log line. Also log
the raw 429 body (truncated) whenever one occurs, regardless of whether
`QUOTA_EXCEEDED` was recognized, so a real future occurrence can confirm
Spotify's actual shape empirically rather than guessing again. No change
to `isRateLimited()`'s existing scope (only gates the automatic poller,
never on-demand/user-triggered calls, per the file's own stated design).

Shipped: `recordRateLimitFromResponse()` gained a third, optional `body`
parameter (stays synchronous, never reads the body itself — each of the
three call sites threads through whatever body they already have/parse,
avoiding a double-read). `body.reason`/`body.error.reason ===
'QUOTA_EXCEEDED'` arms a new 1800s (30 min, documented as an engineering
estimate, not a confirmed reset window) backoff with distinct log wording;
otherwise the existing Retry-After/30s-default behavior is unchanged, and
the raw (truncated) body is now logged for evidence toward confirming
Spotify's actual shape next time this fires for real. Routed through the
`verifier` agent (touches `tokenRefresh.ts`, Spotify token-handling code)
— verdict `pass`, no findings. Implemented on
`feature/reduce-nowplaying-polling` (off `master`, not yet merged).

## 26. Cache GET /api/device so N guests opening the app doesn't mean N Spotify calls
**Status:** done
**Type:** enhancement

Follow-up from [analysis/22](analysis/22-spotify-api-call-inventory.md): `GET /api/device`
([routes/device.ts](backend/src/routes/device.ts) → [device.ts](backend/src/spotify/device.ts)`resolveDevice`)
is the one endpoint in this app that doesn't follow the poll-once/fan-out
pattern `CLAUDE.md`'s architecture note calls for — it's called fresh,
uncached, by every guest's `PlaybackControls` mount (the Now Playing page
everyone lands on) and every admin's `DeviceSelector` mount, with zero
rate-limit gating (on-demand calls are deliberately ungated, per
`rateLimitBackoff.ts`'s own design). N guests opening the app in a short
window means N real, simultaneous `GET /v1/me/player/devices` calls.

**Real correctness constraint a naive TTL cache would break**:
`DeviceSelector` re-fetches `GET /api/device` specifically on the
`device-status` SSE event, so an admin sees a bridge-device online/offline
flip live rather than only on next reload
([DeviceSelector.tsx](frontend/src/components/admin/DeviceSelector.tsx)).
A cache with only a TTL (no invalidation) would silently serve stale data
right when that live refresh matters most.

**Fix**: add a small, dedicated device-resolution cache in
[device.ts](backend/src/spotify/device.ts) (separate from `cache.ts`'s
existing generic `withCache` — deliberately, since this needs explicit
invalidation, not just TTL expiry, which `cache.ts`'s own docs say isn't
worth the complexity for its existing search/track/artist use cases): a
short TTL (~10s) covers the burst-of-simultaneous-guests case, and an
explicit `invalidateDeviceResolutionCache()` call — wired into
[nowPlaying.ts](backend/src/spotify/nowPlaying.ts)'s existing
`device-status`-change detection (both `updateDeviceStatusFromDeviceField`
and `checkDeviceStatusFallback`) and into `POST /api/device/select`'s
success path — keeps it correctly fresh exactly when the underlying state
actually changes. `POST /device/select` itself keeps calling `listDevices()`
directly, uncached, unchanged — it already explicitly re-fetches live on
purpose ("the admin must be selecting from what's currently visible").

Shipped: `getCachedDeviceResolution()` (10s TTL) added to
[device.ts](backend/src/spotify/device.ts), wrapping `resolveDevice()` for
`GET /api/device` only. `POST /device/select` still calls `listDevices()`
directly, unchanged, plus now calls the new `invalidateDeviceResolutionCache()`
on success. That same invalidation is wired into
[nowPlaying.ts](backend/src/spotify/nowPlaying.ts)'s existing
`device-status`-change detection (both `updateDeviceStatusFromDeviceField`
and `checkDeviceStatusFallback`), so `DeviceSelector.tsx`'s live
device-status refresh still sees fresh data immediately rather than a
stale cached result. `resolveDevice()`/`listDevices()` themselves
untouched. Implemented on `feature/reduce-nowplaying-polling` (off
`master`, not yet merged) — completes the full set of three fixes from
this incident's investigation (items 24, 25, 26).

## 27. Jukebox device card shows its "native app only" note on every device, not just the master device

**Status:** idea
**Type:** enhancement

In Settings, [JukeboxDeviceCard.tsx:74-80](frontend/src/components/admin/JukeboxDeviceCard.tsx:74-80)
renders an explanatory note — "Jukebox device mode is only available from
the native Android app..." — whenever `!Capacitor.isNativePlatform()`, i.e.
on every browser-based admin session, regardless of whether a Jukebox
master device (item 8) is even configured for this deployment. Reported:
this section shouldn't show at all except on the master device itself.

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

## 28. "About the artist" panel always shows 0 followers

**Status:** done — confirmed a genuine Spotify API gap, not an app bug
**Type:** bug

Reported: on the Now Playing page's "About the artist" panel (now "About
the song", see item 14; was
[ArtistInfoPanel.tsx:93](frontend/src/components/artist/ArtistInfoPanel.tsx:93),
now [SongInfoPanel.tsx](frontend/src/components/artist/SongInfoPanel.tsx)),
the follower count reads 0 no matter which artist is playing.

**2026-09-03: root-caused with real live evidence.** Added temporary
diagnostic logging to `getArtist()`
([client.ts](backend/src/spotify/client.ts)) that logs the raw
`artist.followers` value whenever it's falsy, then hit it against this dev
environment's real (apparently now-working) Spotify session while two
well-known, high-listener-count bands were playing (Bad Company, Fleetwood
Mac). Both came back with `followers` completely `undefined` — not
`{total: 0}`, the field itself absent from Spotify's response — confirming
this is a genuine gap in what Spotify's `GET /artists/{id}` returns to
this app, not a code bug. `getArtist()`'s existing `artist.followers?.total
?? 0` fallback is already the correct handling for this; nothing further
to fix code-side. The diagnostic log line was left in place (low-noise,
only fires on the falsy case) so any future pattern in *which* artists
this affects becomes visible in the add-on's logs over time.

The backend's `getArtist()` calls Spotify's real `GET /artists/{id}`
endpoint (not a simplified/track-embedded artist object that would lack
follower data) and maps `followers: artist.followers?.total ?? 0`
([client.ts:283](backend/src/spotify/client.ts:283)) — so on its face the
mapping looks correct. An existing comment right above it
([client.ts:278-281](backend/src/spotify/client.ts:278-281)) already notes
that Spotify's artist response has been observed with `genres`, `images`,
and `followers` missing/undefined for some artist IDs, which is one
candidate explanation (silently falling back to 0 for every artist hit so
far) rather than a code bug — but that's not confirmed for this specific
report. Worth checking: (a) log/inspect a raw Spotify artist response for
an artist the reporter tested, to see whether `followers.total` is
actually present and non-zero upstream, and (b) whether
`withCache`'s `ENTITY_CACHE_TTL_MS` could be serving a stale cached 0 from
an earlier bad response for the same artist id, independent of whatever
the root cause turns out to be.

## 29. Now Playing card: default to expanded on large screens (desktop)

**Status:** done
**Type:** enhancement

Reported: on large screens (desktop), the Now Playing song info card should
default to its larger/expanded size instead of starting collapsed like on
phone. The expand/collapse toggle already exists
([NowPlaying.tsx:60](frontend/src/components/nowplaying/NowPlaying.tsx:60)/[212](frontend/src/components/nowplaying/NowPlaying.tsx:212))
but starts collapsed regardless of viewport width; on desktop there's
generally more room for the expanded stats (play count, artist/genre
details — see item 14) to show by default without an extra tap.

**2026-09-03: done.** `NowPlaying.tsx`'s `expanded` state now initializes
from `window.matchMedia('(min-width: 1024px)').matches` — a one-time check
at mount, not a live-resizing subscription.

**2026-09-02 code-review pass (no live Spotify access available in this
dev environment — no `SPOTIFY_REFRESH_TOKEN` configured, and a live test
call would draw on the same pooled quota as the production add-on, so none
was attempted):** read the full path end to end —
[nowPlaying.ts:156](backend/src/spotify/nowPlaying.ts:156) sources a real
Spotify artist ID off the currently-playing track,
[client.ts](backend/src/spotify/client.ts)'s `getArtist()` hits the correct
`GET /artists/{id}` endpoint and maps `followers.total` correctly, the
`/api/artist/:id` route ([artist.ts](backend/src/routes/artist.ts)) passes
the shaped object straight through, and the frontend's `ArtistInfo` type/
render ([ArtistInfoPanel.tsx](frontend/src/components/artist/ArtistInfoPanel.tsx))
matches. `withCache` never caches a rejected fetch
([cache.ts](backend/src/spotify/cache.ts)), so a transient failure can't
get "stuck" as a cached 0 — and since the cache key is per-artist-id, a
single stale entry couldn't explain "0 for every artist" reported across
different tracks either. Found nothing wrong in the code itself. The
`?? 0` fallback is separately confirmed necessary for at least one real
artist (item 15's fix used a concrete example ID,
`3QFXxlWMDSRABMc79TKS5U`, where Spotify genuinely omitted `followers`) —
but that's a per-artist Spotify data-quality quirk, not something that
would explain every artist reading 0. **Next step needs live evidence**:
either check the "About the artist" panel on the deployed add-on for a
well-known artist with a real, large follower count, or add temporary
logging of the raw `artist.followers` value and check the add-on's logs
next time the panel is opened.

## 30. Jukebox device's SSE connection doesn't survive Android backgrounding
**Status:** done
**Type:** bug
**Analysis:** [docs/proposals/jukebox-device-resilience/DESIGN_SPEC.md](docs/proposals/jukebox-device-resilience/DESIGN_SPEC.md)

Reported 2026-09-02: guest-facing volume control went offline
("The Jukebox device is offline — volume control is paused until it
reconnects.") even though the Master Device phone was confirmed running the
app and on wifi (still the active Spotify Connect device, keeping song
info/pause/skip in sync throughout — those go through Spotify's Web API,
unaffected by this). A fresh `master` build was installed via `adb install
-r` and did **not** come back online on its own; it only flipped to online
after explicitly foregrounding the app (`adb shell am start`). So this
isn't primarily a stale-build issue — even a freshly-installed build had a
dead SSE connection until put in the foreground.

Suspected root cause: the SSE connection
([backend/src/events/jukeboxDeviceOnline.ts](backend/src/events/jukeboxDeviceOnline.ts)
tracks it purely as "is there an open `GET /api/events` connection") doesn't
survive Android backgrounding — either Doze/App Standby network restrictions
suspending the connection, or the lack of a foreground service/wake lock
letting the OS pause the WebView's JS timers/network once the activity isn't
resumed. The user has since pinned the app via Android's screen-pinning to
keep it forced in the foreground as a workaround, which should rule out
"another app took focus" but may not rule out Doze kicking in once the
screen itself sleeps/locks — worth confirming whether pinning alone is
sufficient or whether a real fix (foreground service, wake lock, and/or an
app-side reconnect-on-resume handler) is needed.

Worth checking as part of the eventual analysis: whether the app's SSE
client re-establishes on `onResume`/visibility-change at all, or only
connects once at cold start; whether `WAKE_LOCK`/a foreground service is
declared in `frontend/android/app/src/main/AndroidManifest.xml`; and
whether this reproduces with screen-pinning alone or requires the phone to
also stay unlocked/screen-on.

**2026-09-03: scoped and fixed together with item 31** — see
[docs/proposals/jukebox-device-resilience/](docs/proposals/jukebox-device-resilience/).
User check-in confirmed pinned-foreground is the accepted deployment mode
(no foreground-service/wake-lock work); the phone won't be powered 24/7, so
the fix direction was: (a) make pinning easy to set up/verify from within
the app, (b) make every client recognize the device's online/offline state
live instead of only via a page reload. Shipped: a new native `AppPinning`
Capacitor plugin (`isPinned()`/`enablePinning()` via
`ActivityManager.getLockTaskModeState()`/`Activity.startLockTask()`)
surfaced as a status card + "Enable pinning" button on the Master-Device-only
Connect page; and — a real bug found while investigating — the backend
already emitted a `jukebox-device-status` SSE event that the frontend never
actually subscribed to (only a stale code comment referenced it, not the
real event allowlist). Fixed and live-verified end-to-end against the real
dev backend (a genuine SSE connection flipped the already-loaded page's UI
with zero reload). `JukeboxDeviceCard.tsx` (the admin panel's device card)
was found to have no online/offline concept at all today, only
registration status — adding one would be a new UI decision, deliberately
left out of this fix's scope; worth a future item if actually wanted.
Native Java changes unverified beyond code review (no Android SDK in this
dev environment, same known gap as prior Master Device Mode native work).
Implemented on `feature/jukebox-device-resilience`, not yet merged.

## 31. Master Device shows itself as "the Jukebox device is offline"
**Status:** done
**Type:** bug

Reported 2026-09-02, found while investigating item 30: the confusing
"The Jukebox device is offline — volume control is paused until it
reconnects." copy also renders on the Master Device's own screen — i.e. the
phone that *is* the registered Jukebox device sees a message about itself
being disconnected from itself. Nonsensical to show on the one client where
it's least meaningful.

Root cause: [PlaybackControls.tsx](frontend/src/components/playback/PlaybackControls.tsx)
derives `jukeboxOffline`/`volumeAllowed` purely from the generic
`GET /api/trust-mode` `jukeboxDevice.registered`/`online` snapshot, with no
special-casing for "this client itself is the registered Jukebox device."
That check already exists elsewhere —
[useIsJukeboxDevice.ts](frontend/src/hooks/useIsJukeboxDevice.ts) — and
drives the nav swap ("Me" → "Connect") on
[ConnectPage.tsx](frontend/src/pages/ConnectPage.tsx), but `PlaybackControls`
doesn't use it at all. Worth deciding the actual fix during design, not just
better copy: today even the Master Device's own volume slider round-trips
guest-style through the backend (`POST /api/volume` → SSE
`jukebox-volume-command` → itself), instead of using
[volumeControlPlugin.ts](frontend/src/lib/volumeControlPlugin.ts)'s
`VolumeControl.setVolume` directly on-device — which would sidestep this
class of message entirely for the Master Device (no network round trip
needed to change its own system volume) and likely also be more robust/less
latent than looping through the backend.

**2026-09-03: fixed with the deeper option** (user's explicit choice over
just improving the copy) — see
[docs/proposals/jukebox-device-resilience/](docs/proposals/jukebox-device-resilience/),
scoped and fixed together with item 30. `PlaybackControls.tsx` now computes
`isMasterDevice` via the existing `useIsJukeboxDevice()` hook; when true,
the volume slider calls `VolumeControl.setVolume()` directly (the existing
native plugin) instead of the guest-facing `POST /api/volume` round trip,
then reports the new value via the existing `reportJukeboxVolume()` call so
other guests' sliders still sync through the existing broadcast.
`volumeAllowed` for the master device is now gated only by the trust-mode
permission, never by `deviceSupportsVolume`/`jukeboxOnline`/`jukeboxOffline`
— those describe other clients' view of this device, not its own — so the
confusing self-referential "offline" message can no longer render on the
device's own screen. Guest-path behavior is unchanged. Live-verified both
branches in the Browser pane. Implemented on
`feature/jukebox-device-resilience`, not yet merged.

## 32. "Up next" queue doesn't update after a skip
**Status:** done
**Type:** bug

Reported 2026-09-02: after skipping to the next track, the guest-facing
"Up next" list keeps showing stale entries (e.g. still shows the
just-started track, or doesn't drop off the track that was skipped past)
until something unrelated happens to refresh it.

Root cause found in code:
[QueueList.tsx:113](frontend/src/components/queue/QueueList.tsx:113)
only re-fetches `GET /api/queue` on mount and on the `queue-update` SSE
event. `queue-update` is emitted from exactly two places —
[queue.ts:140](backend/src/routes/queue.ts:140) (a guest adds a track) and
[admin.ts:107](backend/src/routes/admin.ts:107)/[112](backend/src/routes/admin.ts:112)
(admin removes/clears) — neither of which fires on skip. Meanwhile
`POST /api/playback/skip` ([playback.ts:122](backend/src/routes/playback.ts:122))
only triggers an immediate now-playing poll
(`triggerNowPlayingPollFireAndForget`), and that poller *does* mutate the
local queue mirror on a detected track change — it calls
`dequeueBySpotifyTrackId` at
[nowPlaying.ts:403](backend/src/spotify/nowPlaying.ts:403) — but never
emits `queue-update` afterward, only `leaderboard-update` and
`now-playing`. So the backend's queue data is actually correct after a
skip; the frontend just never learns to re-fetch it. Fix should be a
one-line addition: emit `queue-update` alongside the existing
`leaderboard-update` right after the `dequeueBySpotifyTrackId` call in
nowPlaying.ts, so it fires on every detected track change (skip, previous,
and natural track-end alike), not just guest add/admin remove.

**Fixed 2026-09-02:** added the one-line `emitEvent("queue-update", {
trackId: nextState.trackId })` right after `dequeueBySpotifyTrackId` in
[nowPlaying.ts](backend/src/spotify/nowPlaying.ts) as diagnosed above.
Backend typecheck + full `vitest run` (417 tests) clean.

## 33. Synced lyrics highlight consistently lags the actual audio by ~1s
**Status:** done
**Type:** bug

Reported 2026-09-02: the highlighted lyric line in the lyrics panel is
consistently a second or so behind what's actually playing.

Root cause found in code: the local progress clock that both the progress
bar and [useSyncedLyrics.ts](frontend/src/hooks/useSyncedLyrics.ts) derive
from is resynced in
[NowPlaying.tsx:147-150](frontend/src/components/nowplaying/NowPlaying.tsx:147)
as `syncRef.current = { progressMs: displaySnapshot?.progressMs ?? 0, at:
Date.now() }` — i.e. it treats the snapshot's `progressMs` as if it were
captured at the instant the frontend received it, then ticks forward from
there every `PROGRESS_TICK_MS`. In reality that `progressMs` value is
whatever Spotify reported as of the backend's *last completed poll*, which
is already some amount old by the time it reaches the frontend (backend
poll round-trip to Spotify + SSE emission + delivery), so the local clock
starts behind and stays behind by that same fixed offset for the rest of
the track. The one field that could correct for this,
`polledAt` ([api.ts:88](frontend/src/lib/api.ts:88), added for BACKLOG.md
item 9's staleness detection), is documented as REST-only and isn't even
present on the `now-playing` SSE event payload
([nowPlaying.ts:428](backend/src/spotify/nowPlaying.ts:428) emits
`nextState` without it) — so there's currently no way for the frontend to
compensate even if it wanted to. Fix likely needs two parts: include a
poll timestamp on the SSE payload too (not just the REST response), and
have the resync effect add `Date.now() - polledAt` to the seeded
`progressMs` before starting the local tick, rather than assuming the
snapshot was captured at the moment it arrived.

**Fixed 2026-09-02:** both parts landed. Backend now emits `polledAt`
(the module-level `lastPolledAt`) on the SSE `now-playing` payload too, not
just the REST response
([nowPlaying.ts](backend/src/spotify/nowPlaying.ts)). Frontend's resync
effect in [NowPlaying.tsx](frontend/src/components/nowplaying/NowPlaying.tsx)
now adds `Date.now() - polledAt` (clamped to
`[0, MAX_POLL_STALENESS_COMPENSATION_MS]` = 5s, to guard against
backend/frontend clock skew or an unexpectedly old snapshot) to the seeded
`progressMs`, and clamps the result to the track's `durationMs` the same
way the existing tick interval already does. Backend + frontend typecheck
clean, frontend production build clean, backend `vitest run` (417 tests)
clean — no frontend unit test suite exists per
[docs/TESTING.md](docs/TESTING.md).

## 34. Lyrics auto-scroll forces the page back to the active lyric line
**Status:** idea
**Type:** bug
**Analysis:** not yet written

Reported 2026-09-03: while a song is playing with lyrics shown, scrolling
away to a different part of the page gets forced back to the active lyric
line. Suspected side effect of the active-line auto-scroll/highlight
behavior (likely in the lyrics panel component, see
[analysis/01-lyrics-integration.md](analysis/01-lyrics-integration.md) for
the original feature) re-scrolling on every synced-line update rather than
only when the user hasn't manually scrolled away. User wants the forced
scroll to stop.

## 35. Master Device volume slider defaults to max on first launch
**Status:** done
**Type:** bug
**Analysis:** not yet written

Reported 2026-09-03: on first launch of the Android app on the Master
Device, the volume slider shows 100% regardless of the device's actual
current volume level (e.g. shows 100% when the device is actually at 30%)
until the user manually adjusts it. Likely the slider's initial state isn't
being seeded from the actual system/Spotify volume before first render.

**2026-09-03: done.** Root cause: on the Master Device, the resolved
Spotify device *is* the Master Device itself (the active Connect
receiver), and Spotify reports a freshly-connected receiver's
`volume_percent` as 100 — not the phone's real system volume — so
`PlaybackControls.tsx`'s `getDevice()` seed effect set the slider to that
wrong value, and on a genuinely first-ever launch the other two seed paths
had nothing stored yet to correct it. Fixed by skipping that seed on the
Master Device and adding a dedicated effect that seeds the slider directly
from `VolumeControl.getVolume()` (the native plugin reading real hardware
state). Implemented on `fix/master-device-volume-initial-seed`; the native
hardware path itself could not be live-tested (no Android device/emulator
in this dev environment) — verified via typecheck/build and manual trace
only.
