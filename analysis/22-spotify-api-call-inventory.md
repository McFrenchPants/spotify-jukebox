# Analysis: Spotify API call inventory (BACKLOG.md #22 follow-up)

Full audit of every place this backend calls a real Spotify endpoint, done
2026-09-01 while investigating why the live add-on's rate-limit condition
wasn't clearing on its own. Source of truth: every file matching
`SPOTIFY_API_BASE`/`accounts.spotify.com` under `backend/src`, cross-checked
against every frontend call site that triggers each backend route.

## Always-on background load (independent of guest count)

| Source | Endpoint | Frequency | Notes |
|---|---|---|---|
| Now-playing poller ([nowPlaying.ts](../backend/src/spotify/nowPlaying.ts)) | `GET /v1/me/player/currently-playing` | **Every 4s, continuously** | The dominant, constant source of load — ~900 calls/hour, ~21,600/day, running whenever the backend process is up, regardless of whether any guest is connected. Skips a tick outright while an active rate-limit backoff window is armed. |
| Device-status fallback ([nowPlaying.ts](../backend/src/spotify/nowPlaying.ts):`checkDeviceStatusFallback`) | `GET /v1/me/player/devices` | Throttled to ≤1 per 5 min | Only fires when the currently-playing response has no `device` field (nothing actively playing/paused) — largely dormant while music is playing, since device presence is read for free off the currently-playing response otherwise. |
| Token refresh ([tokenRefresh.ts](../backend/src/spotify/tokenRefresh.ts)) | `POST accounts.spotify.com/api/token` | Every 50 min | Accounts service, a separate quota bucket from the Web API per Spotify's docs — but this app arms the same shared backoff on a 429 from it regardless. |

## Guest/admin-triggered, on demand

| Source | Endpoint | Trigger | Caching / dedup |
|---|---|---|---|
| **`GET /api/device`** ([device.ts](../backend/src/routes/device.ts) → [device.ts](../backend/src/spotify/device.ts)`resolveDevice`) | `GET /v1/me/player/devices` | **Once per page load, per client** — every guest's `NowPlayingPage` mounts `PlaybackControls`, which calls this on mount; every admin's `SettingsPage` mounts `DeviceSelector`, which also calls it on mount **and re-fetches on every `device-status` SSE event** | **None.** No cache, no dedup, and `rateLimitBackoff.ts` explicitly exempts on-demand calls from its backoff gate by design (see its own header comment) — this call always goes out live. |
| Search ([search.ts](../backend/src/routes/search.ts) → [client.ts](../backend/src/spotify/client.ts)`searchTracks`) | `GET /v1/search` | Guest typing in Find Music, 380ms debounce | 30s TTL cache, keyed by exact query text — shared across all guests, so concurrent identical searches don't re-hit Spotify. |
| Track lookup ([queue.ts](../backend/src/routes/queue.ts), [favorites.ts](../backend/src/routes/favorites.ts) → `getTrack`) | `GET /v1/tracks/{id}` | Once per queue-add and once per favorite-add (server re-fetches authoritative metadata, never trusts the client) | 10 min TTL cache per track id. |
| Artist lookup ([artist.ts](../backend/src/routes/artist.ts) → `getArtist`) | `GET /v1/artists/{id}` | Once per "About the artist" panel expansion, per distinct artist id | 10 min TTL cache. |
| Queue state ([queue.ts](../backend/src/routes/queue.ts) → [queue.ts](../backend/src/spotify/queue.ts)`getQueueState`) | `GET /v1/me/player/queue` | Once per queue-add (duplicate-prevention check) | None. |
| Add to queue ([queue.ts](../backend/src/routes/queue.ts) → `addTrackToQueue`) | `POST /v1/me/player/queue` | Once per successful queue-add | N/A (mutation). |
| Queue resync ([admin.ts](../backend/src/routes/admin.ts) moderation routes → [queueSync.ts](../backend/src/spotify/queueSync.ts)) | `GET /v1/me/player/currently-playing` + `PUT /v1/me/player/play` (2 calls) | Once per admin moderation action (remove one track / clear queue) | None. |
| Playback controls ([playback.ts](../backend/src/routes/playback.ts) → [playback.ts](../backend/src/spotify/playback.ts)) | `PUT .../pause`, `PUT .../play`, `POST .../next`, `POST .../previous`, `PUT .../volume` | One call per guest button press / debounced slider release | N/A (mutations). |
| One-time OAuth consent ([auth.ts](../backend/src/routes/auth.ts)) | `POST accounts.spotify.com/api/token` (authorization_code grant) | Manual, rare (admin re-auth) | N/A. |

## The one real per-guest multiplier: `GET /api/device`

Every other piece of Spotify-backed state in this app follows the
"poll once server-side, fan out over SSE" pattern
([nowPlaying.ts](../backend/src/spotify/nowPlaying.ts) → [events/bus.ts](../backend/src/events/bus.ts))
that `CLAUDE.md`'s own architecture note calls out — guest count doesn't
multiply Spotify load for that path. `GET /api/device` is the exception:
it's a plain per-request handler with no cache and no shared state, called
directly by `PlaybackControls` (mounted on the page every guest lands on
first) and `DeviceSelector` (mounted whenever an admin has Settings open,
and re-triggered on every device-status flip). **If N guests open the app
within a short window — the exact "party start" scenario — that's N real,
simultaneous `GET /v1/me/player/devices` calls**, on top of the constant
4s now-playing poll. This is the most concrete, fixable contributor to
burst load this audit found; everything else in the table above is either
constant-rate (the poller/token refresh) or already cache-protected.

## Steady-state totals (rough)

- Now-playing poll alone: ~21,600 calls/day if the backend runs 24/7
  uninterrupted (it doesn't need to — see BACKLOG.md item 20 re: stray
  processes multiplying this).
- Token refresh: ~29/day.
- Device-status fallback: capped at ~288/day, usually far less (mostly
  dormant while music plays).
- Everything else scales with actual guest activity, mitigated by caching
  except `GET /api/device`.

## Resolved 2026-09-01 — the account/quota picture, from Spotify's own docs

The user researched this directly against Spotify's developer docs/support
material. Key facts, folded in here as the authoritative answer to the
"not yet known" questions above:

- **Two genuinely distinct 429 causes, not one.** Spotify separates:
  - **Rate limiting** — too many requests in a rolling **30-second**
    window (not a fixed per-minute bucket). Community testing estimates a
    soft ceiling around **180 requests/minute**, though Spotify doesn't
    publish a hard number and it can vary by endpoint/load. This class
    includes a `Retry-After` header (seconds) telling the caller how long
    to back off — this is the only case
    [rateLimitBackoff.ts](../backend/src/spotify/rateLimitBackoff.ts)
    currently models.
  - **Quota exceeded** — the app's broader Development Mode resource
    allocation is exhausted. Distinguished by the 429 response **body**
    carrying a structured `"reason": "QUOTA_EXCEEDED"` field, not by
    headers. This is a materially longer-lived condition than a rolling
    30s rate limit, and **this app's code currently has zero awareness of
    it** — `recordRateLimitFromResponse()` only ever reads the
    `Retry-After` header (or falls back to a flat 30s), so a real
    `QUOTA_EXCEEDED` block gets treated identically to an ordinary
    30-second rate limit: the poller waits ~30s, then immediately retries,
    gets `QUOTA_EXCEEDED` again, waits ~30s again — indefinitely, with no
    actual progress toward recovery, and (worse) it keeps consuming
    request budget against a quota that isn't the thing recovering on a
    30s cadence in the first place. **This is very likely the concrete
    mechanism behind the "stuck for hours, restarts don't help" symptom**
    this incident showed, not just an unusually long ordinary rate limit.
- **Development Mode's 5-user cap is a non-issue for this app specifically**
  — confirmed by rereading [P2.2](../docs/proposals) 's session-token
  design: guests never perform their own Spotify OAuth login at all; they
  get an app-issued guest session token
  (`guest_sessions`/`x-guest-token`), and only the single admin account
  that completed the one-time consent flow ever counts as an authenticated
  Spotify user against that cap. Guest count has no bearing on it. (Already
  noted in `BACKLOG.md` item 20; reconfirmed here rather than assumed.)
- **Quota pooling per developer account, not per Client ID**, and
  **Extended Quota Mode requiring 250k+ MAU / a registered business
  entity** — both already known from item 20's research, now corroborated
  by the same independent source.
- **The CORS caveat about reading `Retry-After` doesn't apply here** —
  that warning is for a pure browser-based app calling Spotify directly
  from client-side JS. This backend's Spotify calls are all server-side
  (Node `fetch`), so there's no CORS boundary in play; the header is
  already read reliably today.

## Concrete follow-up this unlocks

`recordRateLimitFromResponse()` should be extended to read the 429
response **body** (not just the `Retry-After` header) and check for a
`QUOTA_EXCEEDED` reason, applying a much longer backoff (and a distinctly
worded log line — "quota exhausted, no known reset time" rather than "back
off for Ns") when it's present, instead of treating every 429 identically.
The exact JSON shape of Spotify's quota-exceeded body isn't independently
confirmed against this app's own traffic yet (the source described it as
a `"reason": "QUOTA_EXCEEDED"` field but not its exact nesting) — worth
logging the raw 429 body once, the next time this triggers for real, to
confirm the shape empirically before hard-coding a parse path.
