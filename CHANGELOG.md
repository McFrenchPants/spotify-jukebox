# Changelog

All notable changes to the Guest Jukebox Home Assistant Add-on. Version numbers match `config.yaml`.

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
