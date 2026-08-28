# Changelog

All notable changes to the Guest Jukebox Home Assistant Add-on. Version numbers match `config.yaml`.

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
