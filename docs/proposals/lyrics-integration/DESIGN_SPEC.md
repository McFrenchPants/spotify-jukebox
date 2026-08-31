# Lyrics Integration — Design Spec (non-technical)

**Backlog item:** [BACKLOG.md #1 "Lyrics integration"](../../../BACKLOG.md)
**Analysis:** [analysis/01-lyrics-integration.md](../../../analysis/01-lyrics-integration.md)
**Status:** proposal

## What this feature is

A guest can reveal the lyrics of the song currently playing, scrolling
automatically in time with playback, directly from the Now Playing screen —
no separate page, no login, nothing to configure.

## Provider: LRCLIB

Lyrics come from [LRCLIB](https://lrclib.net/) — a free, open (MIT-licensed)
lyrics database purpose-built for this exact use case (synced lyrics for
self-hosted/FOSS music players), with no API key, no rate limit, and no
licensing risk. See the analysis file for the full comparison against
Musixmatch (paid for full lyrics; its unofficial API is a real ToS/ban risk)
and Genius (its API doesn't return lyrics at all without scraping, which
violates its ToS).

LRCLIB's coverage isn't universal — some tracks, especially obscure or
non-mainstream ones, won't have a match. That's an expected, normal outcome,
not an error condition.

## Where lyrics come from, architecturally

The backend — not each guest's browser — is the one that talks to LRCLIB.
When the currently-playing track changes, the backend looks up lyrics for
it once and makes the result available to every connected guest over the
app's existing live-update channel (the same mechanism that already pushes
now-playing/queue/favorites updates instantly to every guest, see
[CLAUDE.md](../../../CLAUDE.md)'s architecture note on not duplicating
per-guest external-API calls). No guest's browser ever calls LRCLIB
directly.

## Caching

- Lyrics are cached server-side so the same track doesn't trigger a repeat
  LRCLIB lookup every time it's played again.
- Specifically, lyrics for **favorited** tracks (BACKLOG.md item 3) are
  persisted to a local database table — a favorited song is one a guest has
  explicitly signaled they care about, so its lyrics are worth keeping
  indefinitely rather than letting them fall out of a short-lived cache.
- Non-favorited tracks can use a lighter, bounded cache (exact
  shape — in-memory vs. a TTL'd table row — is an implementation detail, not
  a product decision).
- If a track is later favorited after its lyrics were already fetched (or
  unfavorited after being persisted), the cache should reflect that rather
  than silently diverging — exact mechanics are for the implementation plan.

## UI

- The Now Playing card gains a **"Lyrics" button**, separate from the
  card's existing tap-to-expand behavior (which reveals play count/artist
  info). Tapping "Lyrics" reveals a lyrics panel **below** the song info,
  inside its own card — it doesn't replace or collapse the existing
  expanded track-info section, both can be open at once.
- The lyrics panel **auto-scrolls** to keep the currently-sung line in view,
  driven by the same playback-position clock `NowPlaying.tsx` already
  tracks for its progress bar — no separate polling loop needed for timing.
- The lyrics card can be **tapped to expand** to full size (similar spirit
  to the existing card's own expand affordance, but this is the lyrics
  card's own independent expand state). Expanded, the guest can **scroll
  freely** to read ahead or back, and auto-scroll pauses while they do —
  it shouldn't fight a guest trying to read ahead.
- **No lyrics found**: a plain, friendly empty state inside the lyrics card
  (e.g. "No lyrics found for this song"), never treated as an error.
- **Unsynced lyrics** (LRCLIB has the words but no timing data): show the
  full lyrics as static text, no auto-scroll, rather than hiding them.
- Closing the "Lyrics" button (tapping it again) hides the panel; it
  reappears from a collapsed/reset scroll position next time it's opened
  for a track, rather than remembering where the guest scrolled to.

### Interaction with track changes

If the guest has the lyrics panel open and the track changes (naturally, or
via skip), the panel updates to the new track's lyrics automatically rather
than requiring the guest to re-tap "Lyrics." If the new track has no lyrics,
it shows the empty state instead of silently closing the panel.

## Visual theming

Follows the same "slick glass" language as the rest of the app (frosted/
translucent [Card](../../../frontend/src/components/ui/Card.tsx), soft
borders, restrained color) — the lyrics card should read as a natural
sibling of the existing Now Playing card, not a visually distinct overlay
or modal. The currently-sung line should be visually emphasized (e.g. full
opacity/accent color against dimmer surrounding lines) so the sync is
obviously legible at a glance, similar to how commercial lyrics UIs
(Spotify, Apple Music) highlight the active line.

## Non-goals

- No lyrics editing, correction submission, or contribution back to LRCLIB.
- No lyrics search independent of "what's currently playing" (e.g. no
  browsing lyrics for a queued-but-not-yet-playing song).
- No offline/download support — lyrics are fetched live (through the
  backend) and shown only while relevant.

## Open questions for the implementation plan

- Exact caching mechanics for non-favorited tracks (in-memory LRU vs. a
  TTL'd DB row) and what happens to a favorited track's cached lyrics if it
  is later unfavorited.
- Whether the "currently sung line" highlight needs sub-line (word-level)
  precision or line-level is sufficient — LRCLIB's synced format is
  line-level, so line-level highlighting is the natural default.
- Exact auto-scroll resume behavior after a guest finishes manually
  scrolling in the expanded view (e.g. does it resume immediately, after a
  short idle delay, or only if they tap a "jump to current line" control) —
  small enough to decide during implementation rather than blocking this
  spec.
