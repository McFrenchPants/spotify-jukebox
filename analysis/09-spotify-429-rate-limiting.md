# Analysis: stale/stuck Now Playing + Settings device-list 429 (BACKLOG.md item 9)

## What was actually happening

Three distinct, independently-triggerable bugs were bundled under one symptom report. None of them require a new rate-limit *mechanism* — `rateLimitBackoff.ts` already exists and does its job. The bugs are all about what happens *around* it: what gets cached, what gets surfaced, and what gets refreshed.

### Bug A — `GET /api/now-playing` serves a silently-frozen cache during an active backoff window, and a page refresh can't fix it

`routes/nowPlaying.ts` just returns `getNowPlayingState()`, which is `nowPlaying.ts`'s module-level `lastState` — never a live Spotify call. `pollNowPlaying()` (the only writer of `lastState`) returns immediately, before touching `lastState`, whenever `isRateLimited()` is true:

```ts
// nowPlaying.ts:217-219
if (isRateLimited()) {
  return;
}
```

So while a backoff window is active (default 30s, or Spotify's own `Retry-After`, and — per the already-documented duplicate-poller incident — potentially re-armed repeatedly for as long as two backend instances keep hammering the same account), `lastState` is frozen at whatever it was when the window opened. Every consumer of `GET /api/now-playing` — including a literal browser page reload, which fully remounts `NowPlaying.tsx` and re-fetches — gets the exact same frozen snapshot. This is the one part of the bug report a plain refresh genuinely cannot fix, matching "refresh doesn't fix it" literally.

Nothing in the response shape says "this might be stale" — `NowPlayingState` has no timestamp or rate-limited flag, so the frontend has no way to distinguish "confirmed nothing changed" from "we stopped looking a while ago."

### Bug B — Settings' device-list picker surfaces a raw 429 instead of the friendly message the app already has infrastructure for

`listDevices()` (`spotify/device.ts`) already arms the shared backoff on a Web API 429 (`recordRateLimitFromResponse(response)`), but still throws a **plain `Error`**:

```ts
throw new Error(`Spotify device list failed: ${message}`);
```

Compare `tokenRefresh.ts`, which on a 429 from Spotify's *token* endpoint throws the dedicated `SpotifyRateLimitedError` — and `classifySpotifyAuthError()` (`spotify/errors.ts`) already has a clean case for exactly that: a 503 `spotify_rate_limited` with a friendly message. Because `listDevices()`'s Web-API 429 is a plain `Error`, it doesn't match that classifier, falls through, and `routes/device.ts`'s `handleSpotifyError()` gives it the generic 502 `spotify_device_lookup_failed` with the raw Spotify error text — which is exactly the "device list failed, too many requests" message from the report. The fix infrastructure already exists; `listDevices()` just isn't using it.

### Bug C — an SSE reconnect never triggers a refetch, so a client that silently drops and recovers keeps stale state indefinitely

`useEventStream.ts` relies on the browser's built-in `EventSource` auto-reconnect and only exposes `isStale` (non-open for >5s) as a signal. `RootLayout.tsx`'s only response to that is a manual "tap to refresh" banner (`handleManualRefresh` → bumps `refreshKey`) — and the banner **auto-hides itself the instant `isStale` goes false again** (`onopen` resets it immediately, before the user necessarily notices or reacts).

Nothing re-fetches automatically when the connection transitions from disconnected back to open. Because the backend's `now-playing` SSE event is a *delta* (only emitted when `hasChanged()` trips), a client that was disconnected while the track changed — and stays connected afterward with no further change — will never receive that missed transition. This is highly plausible for a bridge phone: long-running open tab, WiFi power-saving/Doze-style background throttling on Android, brief network blips — the kind of thing that self-heals in well under 5s and would never even surface the manual-refresh banner.

## Fix directions (concrete, no open design questions left)

1. **Bug A**: have `nowPlaying.ts` track a `lastPolledAt` timestamp and expose it (plus the current `isRateLimited()` value) via `GET /api/now-playing`'s response — e.g. add `polledAt: number` and `rateLimited: boolean` fields to the shape returned by that route. This turns silent staleness into an honest, checkable signal; the frontend can then decide to show something like "last updated Ns ago, Spotify is rate-limiting requests" instead of confidently showing wrong data. Deliberately **not** attempting a live on-demand Spotify call from this route during an active backoff window — that would defeat the backoff's whole purpose.
2. **Bug B**: make `listDevices()` throw `SpotifyRateLimitedError` (imported from `./errors`, already used by `tokenRefresh.ts`) instead of a plain `Error` when `recordRateLimitFromResponse(response)` returns true. `classifySpotifyAuthError()` already handles this correctly everywhere it's called (`routes/device.ts` included) — no new classification logic needed, just throwing the right type.
3. **Bug C**: `RootLayout.tsx` already owns a single `refreshKey` shared by every consumer that needs a "refetch now" signal (`NowPlaying.tsx` and `QueueList.tsx` both take `refreshKey` as a prop and re-fetch whenever it changes, alongside their SSE-driven live updates — likely more consumers use the same prop too). Currently the *only* thing that bumps it is the manual "tap to refresh" banner click (`handleManualRefresh`). Fix: have `RootLayout` (or `useEventStream` itself, exposing something like a `reconnectedAt` timestamp/counter) auto-bump `refreshKey` whenever the connection transitions from a **real disconnect** back to `'open'` — not on the very first connect on mount, only on recovery from an actual drop. Because every `refreshKey` consumer already re-fetches on that prop changing, this one central fix automatically resyncs `NowPlaying`, `QueueList`, and anything else wired the same way, with no per-component changes needed. The manual banner can stay as a backstop for a connection that's visibly down long enough to show `isStale`, but the common case — a quick silent drop-and-recover well under the 5s `isStale` threshold — needs this automatic path, not a UI affordance the user has to notice and click in time.

None of these three fixes depend on each other and they touch different files, so they can be implemented and verified independently.
