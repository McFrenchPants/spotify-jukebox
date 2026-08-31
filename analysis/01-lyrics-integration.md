# Analysis: Lyrics integration (BACKLOG.md item 1)

## Problem

Guests currently have no way to see the lyrics of the song playing. This is
a pure enhancement — nothing is broken — but it's a common, well-understood
feature for a "now playing" screen and there's no licensing obstacle to
doing it well (see Provider below), so the cost/value tradeoff is
favorable.

## Value

Moderate. Doesn't fix anything, doesn't unblock other work. Nice-to-have
polish that fits the app's existing "now playing" surface well, low
complexity relative to recent proposals (Favorites, Master Device Mode).

## Provider decision: LRCLIB

Researched three options:

- **[LRCLIB](https://lrclib.net/)** — free, MIT-licensed, open database, no
  API key, no rate limit, CORS-enabled. Purpose-built for exactly this use
  case (FOSS/self-hosted music players wanting free synced lyrics). Returns
  time-stamped (LRC) lyrics when available. **Chosen.**
- **Musixmatch official API** — free tier caps out at a ~30% lyrics
  preview; full/synced lyrics require a paid tier. Not worth the cost/setup
  for this app.
- **Musixmatch unofficial/reverse-engineered API** — real legal/ToS risk
  (unauthorized reproduction of copyrighted lyrics) and practical risk of
  the shared community key being revoked without notice. Ruled out.
- **Genius API** — doesn't return lyrics via the API at all; every
  "Genius lyrics" library scrapes the HTML page, which explicitly violates
  Genius's ToS. Ruled out.

Known limitation: LRCLIB's coverage isn't universal — obscure/indie tracks
may come back empty. The UI needs a plain "no lyrics found" state, not an
error.

## Architecture: fetch once on the backend, fan out over existing SSE

LRCLIB is CORS-open, so guest browsers could technically call it directly —
but that means every connected guest independently querying LRCLIB for the
same currently-playing track. This project already has a poll-once/fan-out
pattern for exactly this shape of problem
([backend/src/spotify/nowPlaying.ts](../backend/src/spotify/nowPlaying.ts) →
[backend/src/events/bus.ts](../backend/src/events/bus.ts)), per
[CLAUDE.md](../CLAUDE.md)'s "don't add per-guest Spotify polling" note (the
same principle applies here even though LRCLIB isn't Spotify). Decision:
the backend fetches lyrics once per track change and pushes the result to
guests over the existing SSE bus, rather than each guest hitting LRCLIB
directly.

## Caching

Confirmed with the user: cache lyrics server-side (avoids re-querying
LRCLIB every time the same track plays again), and specifically persist
lyrics for **favorited** tracks into a local DB table (the favorites
feature, BACKLOG.md item 3, already tracks per-track state) so a
frequently-replayed favorite never needs a repeat LRCLIB round-trip. Tracks
that are played but never favorited can use a lighter in-memory/TTL cache
rather than growing the DB unboundedly.

## UX (confirmed with the user)

- A **"Lyrics" button** on the Now Playing song-info card reveals lyrics
  below the song info (i.e. not a separate page/route).
- Lyrics render in their **own card**, auto-scrolling to track the
  currently-sung line using the same playback-position data already driving
  the progress bar in
  [NowPlaying.tsx](../frontend/src/components/nowplaying/NowPlaying.tsx).
- That lyrics card can be **clicked to expand** to full size, at which point
  the guest can scroll freely to read ahead/behind instead of being locked
  to the auto-scroll position.
- No lyrics found → a plain empty state, not an error.

## Open questions carried into the design spec

- Exact expand/collapse interaction details (e.g. does auto-scroll resume
  on collapse, is there a "jump back to current line" affordance in the
  expanded view).
- Whether the lyrics-cache DB table should be scoped strictly to favorited
  tracks or also given a bounded LRU/TTL for non-favorited tracks (vs. pure
  in-memory for those) — an implementation-level call, not something that
  needs to block scoping.
- Behavior when a track has plain (unsynced) lyrics only, or truly no
  timing data despite lyrics existing.

These are small enough to resolve in the design spec rather than needing a
further round of user check-in.
