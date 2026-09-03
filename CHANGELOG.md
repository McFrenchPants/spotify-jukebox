# Changelog

All notable changes to the Guest Jukebox Home Assistant Add-on. Version numbers match `config.yaml`. Entries with a `-staging` version are changes released to the staging deployment on the `develop` branch (see CLAUDE.md's "Branch strategy" section) ahead of a production release — not yet part of production's own history.

## 1.0.31-staging

- Replaced the SSH-tunnel-only one-time Spotify login with a browser-based authorization page (docs/oauth-callback/index.html, hosted on GitHub Pages) — works from any device, any network, no SSH or localhost access required. The old SSH-tunnel method is still documented as a fallback.
- Spotify authorization is now checked automatically every time the admin Settings page loads — if it isn't connected yet (or a previous connection expired), a "Spotify connection" card explains that and walks you through reconnecting right there, instead of only surfacing as a broken Now Playing screen with no explanation.
- Reconnecting Spotify now takes effect immediately — paste the refresh token from the authorization page into the new Settings card and it's applied live, no add-on restart needed.

## 1.0.30-staging

- No user-facing app change — this is a staging-only identity split (name, add-on slug, and port) so the staging add-on can be installed side by side with production on the same Home Assistant server without colliding. Production is unaffected.

## 1.0.30

- On wide screens (desktop, `lg` breakpoint and up), Now Playing and its playback controls now form a left column next to the Up Next queue as a right column, instead of everything stacking in one long list.
- Lyrics now open in their own section below Now Playing/Up Next instead of inside the Now Playing card itself — consistent at every screen size, not just desktop.

## 1.0.29

- The Master Device (the phone connected to the speakers) can now check whether Android's screen-pinning is turned on, and turn it on with one tap right from the Connect page — this keeps the app locked in the foreground so it doesn't get bumped offline by another app or the phone's screen sleeping.
- The Master Device no longer shows itself the confusing "The Jukebox device is offline" message about itself — and its own volume slider now changes the phone's volume directly instead of round-tripping through the backend first.
- Every connected device — guests and admins alike — now sees the Master Device come back online right away, without needing to reload the page.

## 1.0.28

- Fixed the "Up next" queue not updating after skipping a track — it now refreshes on skip, previous, and natural track-end, not just when a guest adds a song or an admin removes one.
- Fixed synced lyrics (and the progress bar) consistently lagging the actual audio by about a second — the displayed progress now accounts for how long ago the backend actually observed it from Spotify, instead of assuming it was captured the instant it reached your device.

## 1.0.26

- Cut background Spotify API load from the now-playing poller by roughly two-thirds: instead of polling on a constant 4-second timer, it now polls right after a guest's own playback action, estimates and schedules a poll for the end of the current track, and otherwise falls back to a 15-second safety-net interval.
- A real Spotify 429 that carries a `QUOTA_EXCEEDED` reason (developer-quota exhaustion, not an ordinary short rate limit) now triggers a much longer backoff instead of retrying every ~30s and re-tripping the same block repeatedly.
- `GET /api/device` is now cached for 10 seconds and invalidated on real device-status changes, so multiple guests opening the app at the same time no longer means one Spotify device lookup per guest.

## 1.0.25

- Fixed a live-incident bug where an artist with no genre tags (`artist.genres` undefined) crashed the entire app to a black screen with no way to recover — `getArtist()` now guards `genres` the same way it already guarded `images`/`followers`, and the Now Playing artist panel no longer reads `genres.length` unguarded.
- On wide screens (desktop/tablet, `lg` breakpoint and up), Search and Favorites now lay out in two columns instead of one long single-column list.

## 1.0.24

- Added synced lyrics: tap "Lyrics" on the Now Playing screen to reveal a lyrics card that auto-scrolls in time with the song, and can be expanded to read the full lyrics freely. Lyrics come from LRCLIB, a free open lyrics database — not every song will have a match.

## 1.0.23

- A real Spotify rate-limit/quota 429 is now actually logged (which caller hit it, how long the backoff is, and exactly when it resumes) — previously this was silent by design, which made a restart's very first 429 look like nothing had happened at all.

## 1.0.22

- Backend logs now include a timestamp and, for background poll failures, the actual underlying cause (e.g. a DNS/network error) instead of a bare "fetch failed" — and repeated identical failures during an outage are now logged once plus periodic reminders instead of one line per 4-second tick.

## 1.0.21

- Now Playing shows a clear "Could not connect to Spotify" message when Spotify is rate-limiting requests, instead of the misleading "Nothing playing."
- Reduced Spotify API calls when several guests are searching or queueing at the same time, by briefly reusing recent search/track/artist lookups instead of repeating them — helps avoid tripping Spotify's rate limit with multiple concurrent guests.

## 1.0.20

- Fixed the guest volume slider not staying in sync with the Jukebox device's real volume: it now seeds accurately on load (instead of a hardcoded default) and stays live-updated if the phone's volume is changed directly (its hardware buttons or Android's own volume UI), without interrupting a guest who's actively dragging the slider themselves.

## 1.0.19

- Every song list (Search, Leaderboard, Recently Played, Favorites) now supports both favoriting and adding to queue consistently — previously Search had no favorite button, and Leaderboard/Recently Played had no "Add to Queue".

## 1.0.18

- Added a "Connect" tab on the master/bridge device (in place of "Me"), showing a QR code and guest link so nearby guests can discover and join from their own phone. Only appears on the device registered as "the Jukebox device" (Master Device Mode); every other device is unaffected.

## 1.0.17

- Fixed Now Playing getting stuck on an old track (and Settings' device picker sometimes showing "too many requests") after the app sat idle for a while — a background connection could silently drop and reconnect without ever refreshing what's shown, and a Spotify rate-limit could leave the display frozen with no way to tell it was stale. Both are now handled: the app automatically resyncs after a reconnect, and a rate limit now shows a clear, friendly message instead of a raw error.

## 1.0.16

- Fixed the Now Playing screen's blurred background art briefly flashing to black every time you navigated to it, even while a song was already playing.

## 1.0.15

- Fixed a bug where looking up certain artists (e.g. from a track's artist link) could fail with an error instead of showing the artist's info — some artists don't have follower or image data available, and the app now handles that gracefully instead of crashing.

## 1.0.14

- Added Master Device Mode: an optional native Android build (built separately, see `docs/MASTER_DEVICE_MODE.md`) that can register itself as "the Jukebox device" from Settings, giving guests real working volume control on a phone-based Bluetooth-speaker bridge — something Spotify's own API can't do remotely for that setup. No effect on the standard web/guest experience if you don't build/use the Android app.
- Added global CORS support so the native app (and anything else) can reach this backend across origins.

## 1.0.13

- Fixed the bottom nav bar reading as transparent in some embedded views (e.g. a Home Assistant dashboard's "Website" card), letting page content behind it overlap and clash with the bar's own icons/labels. The bar is now solid enough to stay legible even where the intended frosted-glass blur effect doesn't render, and page content now fades out completely before it ever reaches the bar instead of relying on the blur alone to obscure it.

## 1.0.12

- Added Favorites: guests can now tap a heart on any song — while it's playing, queued, or in the play history — to save it. The heart shows gray when nobody's favorited a song, amber when someone else has, and red when you have.
- Added a new "Me" tab where guests can optionally set a nickname and pick an avatar. Once set, songs you add to the queue show your nickname and avatar next to them so others can see who queued what.
- The Find Music page now has a Favorites tab alongside search, listing everything you've favorited with sorting (by name, artist, or most recently favorited), a filter box, and one-tap re-queueing.

## 1.0.11

- Fixed the play count on the expanded Now Playing card being wrong (or stuck at a low number) for any track outside the current top-10 most-played list — it previously looked the track up in that top-10 list and silently fell back to a low/zero count if it wasn't there. It now reads that track's real all-time play count directly instead.
- Settings: the Playback Device section now sits directly above Queue Moderation instead of below it.
- Settings: the Trust mode toggle's "Restricted" label no longer gets covered by the sliding "Trusted" pill graphic.
- Widened the tap target on the expanded Now Playing card's artist link (the whole row is now tappable, not just the thin line of text) so it reliably opens search instead of occasionally missing and collapsing the card.

## 1.0.10

- Full glassmorphism visual pass: cards, buttons, the bottom nav bar, inputs, sliders, modals, and toasts now share one consistent frosted-glass look (translucency, blur, and a soft top-edge highlight) instead of the previous mix of flat and partially-glass surfaces. The active tab in the bottom nav now sits inside a glass pill instead of just changing color.
- Settings: Trust mode is now a custom glass toggle switch instead of a dropdown (it's always exactly two options), and it now sits on the same row as the Explicit filter, which is now a custom glass checkbox instead of the browser's default checkbox. The four permission-override dropdowns are now glass-styled and color-coded (green for "Always allow", red for "Always deny").
- All sliders (rate-limit window, min/max song duration, volume) now use a custom glass track with a glowing accent-colored thumb instead of the plain OS slider control.

## 1.0.9

- Found the actual reason the playback icons kept looking small no matter how much bigger they were made: the buttons mixed a `size` preset (which sets its own left/right padding) with a manual override meant to zero that padding out, and Tailwind always applies the size preset's padding *after* the override in the generated stylesheet — so the override never took effect and was quietly eating almost all of the button's interior space. Icons now render at their actual intended size (fills roughly 60% of the button) instead of being squeezed into a sliver by leftover padding.
- Fixed the "About the artist" link in the expanded Now Playing card actually being unclickable: the card's own animated expand/collapse section was computing to zero height in-browser (a CSS technique that didn't behave the way intended), so the artist name and its link were invisibly stacked on top of the controls below and never received the tap. The expand no longer relies on that technique — the artist section now reliably appears and its link reliably works.

## 1.0.8

- The Print button on the admin Settings page's guest-link QR code now prints only the QR code and its URL, instead of the entire admin panel underneath it.
- Tapping the Now Playing card no longer pops up a separate dialog — it now expands the card itself in place (bigger album art, play count, artist info), and the expanded view keeps the progress bar/time that the popup version had dropped. The artist's name is a link straight to the search tab with that artist already searched.

## 1.0.7

- Playback control icons are bigger still (the 1.0.6 bump wasn't enough) — they now fill about 60% of their button instead of ~50%.
- The rate-limit window setting can now be set to 0 ("Off") to disable it entirely, and its slider's top end was brought down from 60 minutes to a more realistic 5 — the old 1-to-60-minute range made the useful part of the slider hard to land on precisely.

## 1.0.6

- Playback control buttons now have noticeably larger icons instead of small icons floating in a lot of empty button padding.
- The app title in the header is now centered above the content (it used to sit flush against the left edge of wide screens while the cards below it were centered), and its row now matches the same left/right margins as the cards. A search shortcut icon was added next to it.
- Cards now use a translucent "glass" surface with a blur, so the softly blurred album-art background shows through behind them while music is playing, instead of a fully opaque panel.
- Tapping the Now Playing card now expands into a detail view with larger album art, how many times the current song has been played, and artist info (followers, genres) — tapping the artist's name jumps to the search tab with that artist already searched.
- Settings: the rate-limit window and min/max song duration controls are now sliders instead of plain number fields (removing the theme-mismatched up/down spinner arrows browsers add to number inputs), and each has a "?" help button explaining what it actually controls, tappable on mobile or hoverable on desktop.
- Settings: the four permission-override dropdowns (pause/resume, skip, volume, reorder) are now laid out two-per-row instead of stacked one-per-row, since they don't need the full width.

## 1.0.5

- Added this changelog file (the Supervisor was showing "No changelog found" — it reads `CHANGELOG.md` from the same directory as `config.yaml`, which didn't exist before now).

## 1.0.4

- Drastically reduced background Spotify API calls: device-status detection now reuses the `device` field already included in every currently-playing response instead of a separate device-list call every ~12s. That call is now only a rarely-needed fallback (throttled to once per 5 minutes) for when nothing is playing at all.
- Closed a gap where a rate limit on Spotify's token-refresh endpoint specifically could bypass the 429 backoff added in 1.0.3.

## 1.0.3

- Fixed a real-world issue where running this add-on and a separate local dev instance against the same Spotify account simultaneously could trip Spotify's rate limit (429) and not recover, since both kept retrying every few seconds regardless. Automatic background polling now backs off properly on a 429 instead of continuing to hammer Spotify.

## 1.0.2

- Fixed a startup bug: the add-on's non-root user couldn't read `/data/options.json` (Home Assistant's Supervisor mounts `/data` with its own ownership), which also silently left the app listening on the wrong internal port. The container now runs as root, and the correct port is pinned regardless of whether the options file can be read.

## 1.0.0

- Initial Home Assistant OS Add-on release.
