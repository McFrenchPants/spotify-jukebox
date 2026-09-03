# Completed change archive

Condensed record of every shipped change: the problem, the approach taken,
and where to find the actual technical detail (a branch, a release version,
or a commit) if it's ever truly needed. This intentionally does **not**
reproduce implementation detail, code excerpts, or diagnostic play-by-play —
that lives in git history and the commit(s) themselves. This file exists so
a future session (or you, months later) can answer "what happened with X"
in one paragraph without re-reading a whole proposal folder.

Entries that originated as a numbered `BACKLOG.md` item keep that number for
cross-reference (code comments and other docs still say "BACKLOG.md item
N" in places — the number is what's stable, not the file it currently lives
in). Ordered by item number where one exists, then by rough shipping order
for the rest.

Full design/implementation history for anything that had its own
`docs/proposals/<slug>/` folder (design spec, implementation plan, its own
progress log) existed at that path before being condensed into the entry
below and deleted — recoverable from git history if ever needed.

---

## 1. Lyrics integration
A "Lyrics" button on the Now Playing card reveals synced lyrics (via
[LRCLIB](https://lrclib.net/), free/open, no ToS risk) that auto-scroll
with playback, with tap-to-expand for free scrolling. Backend fetches once
per track change and fans out over the existing SSE bus rather than
per-guest polling; non-favorited tracks' lyrics are evicted on track
change, favorited tracks' persist. `feature/lyrics-integration`, merged to
`master`.

## 2. Landscape layout for the bridge device
Responsive layout instead of phone-portrait-only: nav becomes a fixed
left icon+label rail at `sm` (640px), content width steps 512px → 672px →
capped 1200px at `lg`, and History/Settings/Now Playing reflow
side-by-side at `lg`. `feature/landscape-layout`, merged to `master`.

## 3. Favorites / like a song
Guests can heart any track (Now Playing, Queue, History, search) —
color-coded by whether nobody, someone else, or the viewing guest
favorited it — backed by existing guest-session identity, extended with an
optional nickname/avatar on a new "Me" tab. A dedicated Favorites tab
lists/sorts/filters/re-queues. `feature/favorites`, merged to `master` via
PR #1.

## 4. "Connect" nav item on the master device
Reframed from a QR icon on Now Playing into device-conditional nav: the
registered Jukebox master device shows a "Connect" tab (QR code, guest
URL, instructions) in place of "Me", via a new public
`GET /api/jukebox-device/mine` endpoint. `feature/master-device-connect-nav`,
merged to `master`, add-on `1.0.18`.

## 5. Move "Playback Device" above "Queue Moderation" in Settings
Trivial reorder in `SettingsPage.tsx`.

## 6. Trust mode toggle: "Restricted" label overlapped the switch
Widened the `Switch` component (7.5rem → 11rem) so the "Restricted" label
fits inside its half without the sliding pill covering it.

## 7. Play count display undercounted plays
The Now Playing card's play count reused a top-10 leaderboard lookup
(silently 0 if the track wasn't in the top 10) instead of a real
per-track count. Fixed with a dedicated
`GET /api/leaderboard/track/:trackId` endpoint backed by a real
`getTrackPlayCount()`.

## 8. Master Device Mode — Android app build + local volume control
Spotify reports `supports_volume: false` for phones acting as a Connect
receiver, so guest-facing volume control didn't work when the bridge
device's audio path ran through a phone. Shipped: the web app is also
buildable as an installable native Android app (Capacitor) with a custom
`AudioManager` plugin; a "this is the Jukebox device" designation in
Settings routes volume commands to it over SSE instead of Spotify's Volume
API. Confirmed working against real hardware (Pixel 7 Pro + Bluetooth
speaker). `feature/master-device-mode`, merged to `master`. Self-hoster
docs: [docs/MASTER_DEVICE_MODE.md](../MASTER_DEVICE_MODE.md); Android build
prerequisites: [docs/ANDROID_BUILD.md](../ANDROID_BUILD.md).

## 9. Stale/stuck Now Playing after idle + Settings device-list 429
Three independent bugs: `GET /api/now-playing` silently served a frozen
cache during an active rate-limit backoff with no staleness signal;
`listDevices()`'s 429 threw a plain `Error` instead of the existing
`SpotifyRateLimitedError` type; an SSE reconnect never triggered any
consumer to refetch. All three fixed independently. `fix/stale-now-playing-429`,
merged to `master`, add-on `1.0.17`.

## 10. Desktop volume slider/label alignment
The volume slider was centered at `lg` but its label and unsupported-volume
message stayed left-aligned. Centered both to match.
`fix/desktop-volume-slider-alignment`, merged to `master`.

## 11. Favorites alongside Search on wide screens
At `lg`, Find Music now renders Search and Favorites side-by-side instead
of behind a tab toggle, reusing the item 2 layout pattern. First real
(non-framework) task run through the sdlc-supervisor framework.
`feature/favorites-two-column-layout`, merged to `master`.

## 12. Favorites list: "Add" button renamed to "Add to Queue"
Trivial copy change in `FavoriteRow.tsx`. `fix/favorites-add-to-queue-copy`,
merged to `master`.

## 13. Nav order: "Me" moved after "Settings"
Single array reorder in `navItems.tsx`. `fix/nav-me-after-settings`, merged
to `master`.

## 14. Now Playing expanded card: more track stats
`ArtistInfoPanel.tsx` replaced by `SongInfoPanel.tsx` ("About the song"):
play count, a new favorite count, plus existing artist photo/name/
followers/genres — consolidating two previously-duplicate artist-fetching
code paths into one. Landed together with item 29.
`feature/now-playing-song-info`, merged to `develop`.

## 15. Artist lookup 502 on some artist IDs
`getArtist()` read `artist.followers.total`/`artist.images[0]` unguarded;
Spotify omits both for some artists, throwing an unhandled `TypeError`
that fell through to a generic 502. Guarded both fields, typed them
optional. `fix/artist-followers-guard`, merged to `master`, add-on `1.0.15`.

## 16. Album art flashed to black navigating to Now Playing
`NowPlaying` remounted on route change with `snapshot` starting `null`,
and an effect immediately pushed that `null` up, clobbering the
already-correct background art before the real snapshot arrived. Fixed
with an early-return guard. `fix/album-art-flash`, merged to `master`,
add-on `1.0.16`.

## 17. Song card consistency across Leaderboard/Recently Played/Search/Favorites
Narrowed via user check-in to favorite + add-to-queue parity only
(expand-for-details deferred). One shared `SongCard.tsx` replaced four
bespoke row components. `feature/song-card-consistency`, merged to
`master`, add-on `1.0.19`.

## 19. Volume slider sync with the Jukebox device's actual volume
Two parts, both fixed: initial load seeded from a hardcoded default
instead of the device's real volume; ongoing out-of-band changes
(hardware buttons) left every guest's slider stale. Fixed with a real
`getVolume()` read-back, self-reporting every 5s, and a live SSE sync
event — drag-aware so an incoming update never fights an in-progress
drag. `feature/jukebox-volume-sync`, merged to `master`, add-on `1.0.20`.

## 20. Spotify rate-limiting recurrence: stray local dev backend + quota pooling
A leftover local `tsx watch` backend was still polling Spotify on top of
the live add-on, from the same pooled developer-account quota (Spotify's
July 2026 quota update pools Development Mode quota per developer
account, not per Client ID). Killed the stray process; added the
CLAUDE.md rule to always shut down dev servers; surfaced `rateLimited`
state in the UI; added short-lived caches for search/track/artist lookups.

## 21. Unusable add-on logs: no timestamps, "fetch failed" hid the real cause
Every backend log line was a bare, timestamp-less `console.*` call, and
Node's generic `fetch failed` TypeError hid the actual cause in
`err.cause`, unread. Added a timestamped logger that unwraps the cause and
throttles repeated poller failures instead of logging every ~4s tick.
Follow-up same day: a real 429 arming the rate-limit backoff was
previously logged nowhere at all — fixed to log every time the backoff is
armed.

## 22. Recurrence: another stray local backend left running
A second real recurrence of item 20's failure mode (a `node.exe` process
listening on `:8085` for 21+ hours). Shipped
[scripts/check-stray-backend.mjs](../../scripts/check-stray-backend.mjs), a
real cross-platform check (report-only by default, opt-in `--kill`)
replacing the memory-only CLAUDE.md reminder that had already failed once.
`fix/stray-backend-check-script`, merged to `master`.

## 23. Uncaught crash on missing `artist.genres` blanked the entire live app
`getArtist()` guarded `images`/`followers` (item 15) but not `genres`;
Spotify omitting it threw an unhandled render-time `TypeError` with no
error boundary anywhere in the app to catch it, crashing the whole React
tree to a black screen. Guarded `genres` the same way, added
defense-in-depth on the frontend panel. **Not fixed** (flagged as a real
gap): no app-wide React error boundary exists — this is the second time
one unguarded Spotify-response field caused a real production incident.

## 24, 25, 26. Reduce Spotify API load from now-playing polling
One incident, three fixes, from the same investigation (a Spotify API call
inventory found the flat 4s now-playing poll was the dominant load
source): (24) replaced the constant-interval poll with
event-scheduled polling — immediate poll after this app's own playback
actions, one scheduled around each track's expected end, a 15s safety
net — cutting estimated calls from ~900/hr to ~150-350/hr; (25)
`rateLimitBackoff.ts` now recognizes a `QUOTA_EXCEEDED` 429 body distinctly
from an ordinary rate limit and applies a much longer, separately-logged
backoff; (26) added a short-TTL cache with explicit invalidation for
`GET /api/device` so N guests opening the app doesn't mean N Spotify
calls. `feature/reduce-nowplaying-polling`, merged to `master`, add-on
`1.0.26`.

## 28. "About the artist" panel always showed 0 followers
Root-caused with live diagnostic logging: Spotify's `GET /artists/{id}`
genuinely omits the `followers` field entirely for some artists (confirmed
against two well-known bands) — not a code bug. The existing `?? 0`
fallback is already correct; no code change needed. A low-noise diagnostic
log was left in place for future evidence.

## 29. Now Playing card: default to expanded on desktop
`NowPlaying.tsx`'s `expanded` state now initializes from a one-time
`window.matchMedia('(min-width: 1024px)')` check at mount. Landed together
with item 14. `feature/now-playing-song-info`, merged to `develop`.

## 30, 31. Jukebox device resilience: screen-pinning + live online-status
Guest-facing volume control went offline when the Master Device phone was
backgrounded, and didn't reliably reconnect. User confirmed pinned-
foreground as the accepted deployment mode (no foreground-service/wake-lock
work). Shipped: a native `AppPinning` plugin (screen-pinning query/enable)
surfaced on the Connect page; and a real bug fix — the backend already
emitted a `jukebox-device-status` SSE event the frontend never subscribed
to. Also (item 31): the Master Device now controls its own volume directly
via the native plugin instead of round-tripping guest-style through the
backend, so it can no longer show a confusing "offline" message about
itself. `feature/jukebox-device-resilience`, merged to `develop`.

## 32. "Up next" queue didn't update after a skip
`POST /api/playback/skip` correctly updated the backend's queue mirror on
a detected track change but never emitted `queue-update`, so the frontend
never learned to refetch. One-line fix: emit it alongside the existing
`leaderboard-update`. `fix/queue-skip-update-lyrics-lag`, merged.

## 33. Synced lyrics highlight lagged the actual audio by ~1s
The frontend's local progress clock resynced from a snapshot's
`progressMs` as if it were captured the instant it arrived, ignoring the
backend poll round-trip delay already baked into it. Backend now also
emits `polledAt` on the SSE payload (previously REST-only); frontend adds
the elapsed time since that poll (clamped) before seeding the local clock.
`fix/queue-skip-update-lyrics-lag`, merged.

## 34. Lyrics auto-scroll forced the page back to the active lyric line
`LyricsPanel.tsx`'s auto-scroll used `scrollIntoView()`, which walks every
scrollable ancestor including the browser window — so scrolling away from
Now Playing got forcibly undone on the next synced-lyric-line change.
Fixed with container-scoped `scrollTo()` math that never touches the page.
`fix/lyrics-autoscroll-page-jump`, merged to `develop`.

## 35. Master Device volume slider defaulted to max on first launch
On the Master Device, the resolved Spotify device is itself, and a
freshly-connected Connect receiver reports `volume_percent: 100`
regardless of the phone's real volume — that value won the slider's
initial seed with nothing else yet stored to correct it. Fixed by skipping
that seed on the Master Device and reading real hardware state via
`VolumeControl.getVolume()` instead (native path not live-testable in this
dev environment). `fix/master-device-volume-initial-seed`, merged to
`develop`.

---

## Non-backlog work

### sdlc-supervisor framework
A portable Claude Code lifecycle/supervisor framework (task packets,
machine state via `.sdlc/state.json`, restricted `implementer`/`verifier`
agent roles), built and dogfooded in this repo before being usable
elsewhere. Still active/in-use — its own docs remain at `docs/sdlc/`
(deliberately not archived here). `feature/sdlc-supervisor`, merged to
`master`.

### Spotify 429 rate-limit resilience (early fix, predates backlog numbering)
Local dev and the HA add-on were both polling the same Spotify account
simultaneously. Added `rateLimitBackoff.ts` so automatic pollers back off
on a 429 instead of continuing to hammer Spotify every tick.

### Reduce background Spotify polling volume
Device-status detection reuses the `device` field already present in
every currently-playing response instead of a separate device-list call
every ~12s; added `SpotifyRateLimitedError` handling to the token-refresh
endpoint, which previously had none.

### Add-on changelog missing
The HA add-on page showed "No changelog found" because `CHANGELOG.md`
didn't exist at the repo root. Added it (reconstructed from git history)
plus a process reminder so future version bumps update it too.
