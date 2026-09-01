# Analysis: replace the constant 4s now-playing poll with event-scheduled polling

## Original ask

User's proposal, in response to [item 22's API call inventory](22-spotify-api-call-inventory.md)
showing the now-playing poller as the dominant source of Spotify load
(~900 calls/hour, continuous, regardless of guest activity):

> unless something happens to change the current song (someone skips),
> there's little value in constantly syncing the status of the song that
> is playing... When a song starts playing, we know the length/duration
> and we just show the progress as an assumed value. We could still
> maintain a low frequency check to ensure we're in sync (maybe 10-15
> seconds) if necessary. Otherwise, a skip event would push that status
> update and force clients to refresh.

## Problem it's actually solving, and for whom

Directly reduces Spotify API load on the account that's currently
rate-limited/quota-blocked (this project's single most acute operational
problem right now), without requiring anything from Spotify's side
(dashboard changes, quota grants) or degrading the guest-facing experience.
Benefits everyone using the app, indirectly, by making the live deployment
more resilient to the exact condition it's stuck in today.

## Why this is safe: the frontend already does the hard part

[NowPlaying.tsx:148-159](../frontend/src/components/nowplaying/NowPlaying.tsx:148)
already interpolates progress locally: on receiving a snapshot, it stores
`{ progressMs, at: Date.now() }` in `syncRef` and ticks a local `setInterval`
that computes `syncRef.current.progressMs + elapsed`, capped at duration.
The UI does **not** need a fresh backend snapshot every few seconds to look
smooth — it only needs an occasionally-correct baseline to interpolate
from. This means the proposed change is almost entirely a backend
scheduling change, not a frontend rework.

## Design

Three poll triggers replace the single flat `setInterval(4000)`:

1. **Own-action fast path.** After this app's own
   `pause`/`resume`/`skip`/`previous` calls succeed
   ([playback.ts](../backend/src/routes/playback.ts)), trigger one
   immediate one-shot `pollNowPlaying()` call. This isn't optional for
   skip/previous specifically — Spotify's control endpoints return `204`
   with no track info, so the app has no way to know what's now playing
   without asking. Doing the same for pause/resume too (rather than
   optimistically flipping local state) keeps the logic uniform and avoids
   a second code path that could drift from what `pollNowPlaying()` itself
   decides is "the state."
2. **Scheduled end-of-track poll.** When a poll (of any origin) confirms
   `isPlaying: true` with a known `durationMs`/`progressMs`, schedule a
   one-shot poll at `(durationMs - progressMs) + buffer` (buffer TBD at
   implementation time, likely 500ms-1s, to avoid firing a hair early and
   seeing the same track still playing) to catch Spotify auto-advancing to
   the next track — the one case genuinely invisible to anything else,
   since nothing pushes that event to this app.
3. **Low-frequency safety-net poll — 15 seconds** (confirmed with the
   user). Catches everything the above two don't: playback changed via
   something other than this app (a hardware remote, another logged-in
   Spotify client, the bridge device's own native media controls),
   general drift, and it's also what keeps device online/offline detection
   alive (piggybacks on every poll's `device` field today, same as now).

**The key simplification**: `pollNowPlaying()`'s actual body — track-change
detection, play-history/leaderboard recording, lyrics lookup, device-status
updates, rate-limit backoff checking — needs **no changes at all**. Every
one of the three triggers above is just a different caller of the exact
same function; this is purely a change to *when* it's called, not what it
does once called. That significantly de-risks this compared to touching
the poll's own logic.

## Estimated impact

Rough, depends heavily on real skip frequency during a party:
- Baseline (nothing happening): ~1 poll per 15s = 240/hour, a ~73%
  reduction from today's ~900/hour.
- Every skip/pause/resume adds one extra call, but even a very active
  session (a skip every 30s) only adds ~120/hour on top of the baseline —
  still well under today's constant rate.
- Every track's natural end triggers one extra call regardless of guest
  activity, comparable in volume to what skips add.

Realistic range: roughly **150-350 calls/hour**, versus ~900/hour today —
a 60-75%+ reduction depending on how active a given session is.

## Real tradeoff, stated plainly

Anything that changes playback **outside this app entirely** — a physical
button, a notification media control, someone opening the Spotify app
directly on the bridge device or their own phone and hitting play/skip on
the same account — is invisible until the next safety-net poll fires,
bounded to a **worst case of ~15 seconds** of staleness (versus ~4s today).
For a home-party jukebox where control is meant to happen through this
app, this seems like an easy trade — flagged explicitly rather than
silently accepted, since it is a real, user-visible behavior change if
someone does control playback out-of-band.

## Alternatives considered

- **Keep the 4s poll, just make it smarter about backing off during
  quiet periods** (e.g. exponential backoff while nothing changes). More
  complex to reason about (a moving interval vs. three simple, named
  triggers), and doesn't fundamentally change the poll's blind reliance on
  wall-clock ticking to notice a track ending — the end-of-track scheduled
  poll is a strictly better mechanism for that specific case regardless of
  interval choice.
- **Fully event-driven, no safety net at all.** Rejected — this is exactly
  what would silently miss out-of-band changes indefinitely (the progress
  bar would just keep counting up past the real state until *something*
  forces a resync), which the user's own proposal already correctly ruled
  out by keeping the low-frequency check.

## Is this a good idea?

Yes. It's a substantial, well-targeted reduction in the app's single
largest source of Spotify load, doesn't touch the actual poll logic (only
its scheduling), and the frontend groundwork to make it safe already
exists. The out-of-band-control staleness tradeoff is real but bounded and
reasonable for this app's actual usage pattern.

## Scope for implementation

- Rewrite `startNowPlayingPoller`'s scheduling in
  [nowPlaying.ts](../backend/src/spotify/nowPlaying.ts) to compute the next
  poll's delay as `min(estimatedEndOfTrackDelay, SAFETY_INTERVAL_MS)`
  after each poll, rather than a flat `setInterval`. `SAFETY_INTERVAL_MS`
  = 15000.
- Add an immediate one-shot poll trigger to
  [playback.ts](../backend/src/routes/playback.ts)'s pause/resume/skip/
  previous route handlers, after the underlying Spotify call succeeds.
- No changes needed to `pollNowPlaying()`'s own body, `queueSync.ts`, or
  any of the play-history/leaderboard/lyrics logic — confirmed above.
- Existing rate-limit backoff (`isRateLimited()` check at the top of
  `pollNowPlaying()`) continues to apply regardless of trigger source —
  no change needed there either.
- Test coverage should cover: the scheduling math (does it pick the
  sooner of the two delays correctly), that an own-action poll doesn't
  also leave a stale end-of-track timer running from before the action
  (old timer must be cleared/rescheduled), and that nothing-playing state
  falls back to the safety interval alone (no end-of-track timer to
  schedule against).
