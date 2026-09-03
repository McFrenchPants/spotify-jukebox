import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../ui/Card'
import { getArtist, getTrackPlayCount, getNowPlaying, type ArtistInfo, type NowPlayingState, type Track } from '../../lib/api'
import { formatDuration } from '../../lib/format'
import type { EventStream } from '../../hooks/useEventStream'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { useFavoritesStatus } from '../../hooks/useFavoritesStatus'
import { FavoriteButton } from '../favorites/FavoriteButton'

/** Matches --duration-slow in index.css — the crossfade should ride the same token. */
const CROSSFADE_MS = 320
const PROGRESS_TICK_MS = 1000
// Upper bound on how much poll-staleness compensation (BACKLOG.md item 33)
// can advance the seeded progress clock — guards against backend/frontend
// clock skew or an unusually old snapshot producing an implausible jump.
const MAX_POLL_STALENESS_COMPENSATION_MS = 5000

export interface NowPlayingProps {
  subscribe: EventStream['subscribe']
  /** Bumped by the manual-refresh fallback affordance to force a re-fetch. */
  refreshKey: number
  /** Reports the current track's art URL up so RootLayout.tsx can thread it into AppShell's background. */
  onAlbumArtChange?: (albumArt: string | null) => void
  /** Reports the current play state up so RootLayout.tsx can thread it into PlaybackControls (P4.5). */
  onIsPlayingChange?: (isPlaying: boolean) => void
  /** Reports the current track's primary artist id up (P4.8), for ArtistInfoPanel. */
  onArtistIdChange?: (artistId: string | null) => void
  /** Reports the current track's id up so the parent can key/feed a sibling LyricsPanel section. */
  onTrackIdChange?: (trackId: string | null) => void
  /** Reports the locally-ticked playback position up, for the same sibling LyricsPanel. */
  onProgressChange?: (progressMs: number) => void
  /** Whether the lyrics section is currently shown — lifted to the parent so LyricsPanel can render as its own section instead of nested in this card. */
  showLyrics: boolean
  /** Toggles `showLyrics` in the parent. */
  onToggleLyrics: () => void
}

function PlaceholderArt({ className }: { className: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-md bg-surface-overlay text-text-muted ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </div>
  )
}

/**
 * Now-playing hero: album art, title/artist, and an elapsed/remaining
 * progress indicator. Fetches an initial snapshot on mount, then stays live
 * via the `now-playing` SSE event (P4.3) — no polling. Track changes
 * crossfade rather than cutting hard; progress ticks forward locally every
 * second between server updates, resynced whenever a fresh snapshot arrives.
 */
export function NowPlaying({
  subscribe,
  refreshKey,
  onAlbumArtChange,
  onIsPlayingChange,
  onArtistIdChange,
  onTrackIdChange,
  onProgressChange,
  showLyrics,
  onToggleLyrics,
}: NowPlayingProps) {
  const [snapshot, setSnapshot] = useState<NowPlayingState | null>(null)
  const [displaySnapshot, setDisplaySnapshot] = useState<NowPlayingState | null>(null)
  const [visible, setVisible] = useState(true)
  const [progressMs, setProgressMs] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [detailArtist, setDetailArtist] = useState<ArtistInfo | null>(null)
  const [detailPlayCount, setDetailPlayCount] = useState<number | null>(null)
  const pendingRef = useRef<NowPlayingState | null>(null)
  const syncRef = useRef<{ progressMs: number; at: number } | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()
  // See AppShell.tsx's identical comment: the CSS fade shortens under
  // reduced-motion on its own, but this JS timer gating the content swap
  // does not, so it needs its own near-zero delay in that case.
  const swapDelayMs = prefersReducedMotion ? 0 : CROSSFADE_MS

  useEffect(() => {
    let cancelled = false
    getNowPlaying()
      .then((data) => {
        if (!cancelled) setSnapshot(data)
      })
      .catch(() => {
        // Initial-load failure just leaves the empty state showing; the SSE
        // stream (once open) or a manual refresh will populate it.
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(
    () => subscribe('now-playing', (data) => setSnapshot(data as NowPlayingState)),
    [subscribe]
  )

  useEffect(() => {
    // Skip while `snapshot` is still the initial not-yet-loaded `null` (every
    // fresh mount of this routed page starts here, including a same-track
    // revisit) — pushing `null` up now would prematurely clear RootLayout's
    // already-correct background art and flash it to black before the real
    // snapshot (initial fetch or next SSE `now-playing` event) arrives. Once
    // loaded, `snapshot` is always a real NowPlayingState (never reset back to
    // null), so this only ever suppresses that one spurious pre-load call —
    // a genuine "nothing playing" snapshot still has `albumArt` forwarded as
    // null via the `?? null` below, same as before.
    if (!snapshot) return
    onAlbumArtChange?.(snapshot.albumArt ?? null)
  }, [snapshot, onAlbumArtChange])

  useEffect(() => {
    onIsPlayingChange?.(snapshot?.isPlaying ?? false)
  }, [snapshot, onIsPlayingChange])

  useEffect(() => {
    onArtistIdChange?.(snapshot?.artistId || null)
  }, [snapshot, onArtistIdChange])

  useEffect(() => {
    onTrackIdChange?.(displaySnapshot?.trackId ?? null)
  }, [displaySnapshot?.trackId, onTrackIdChange])

  useEffect(() => {
    onProgressChange?.(progressMs)
  }, [progressMs, onProgressChange])

  // Crossfade the displayed content whenever the underlying track (or
  // play/pause state) changes, rather than cutting hard to the new data.
  useEffect(() => {
    if (!snapshot) return

    if (!displaySnapshot) {
      setDisplaySnapshot(snapshot)
      setVisible(true)
      return
    }

    const sameTrack =
      snapshot.trackId === displaySnapshot.trackId && snapshot.isPlaying === displaySnapshot.isPlaying
    if (sameTrack) {
      // Same track — just refresh metadata/progress in place, no fade.
      setDisplaySnapshot(snapshot)
      return
    }

    pendingRef.current = snapshot
    setVisible(false)
    const timer = setTimeout(() => {
      setDisplaySnapshot(pendingRef.current)
      setVisible(true)
    }, swapDelayMs)
    return () => clearTimeout(timer)
    // Intentionally keyed only on `snapshot`/`swapDelayMs` — `displaySnapshot`
    // is read for comparison but must not retrigger this effect on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, swapDelayMs])

  // Resync the local progress clock whenever the displayed snapshot changes.
  // `polledAt` (BACKLOG.md item 33) is when the backend actually observed
  // this progressMs from Spotify — by the time it reaches us (backend poll
  // + SSE delivery + render), that's already some ms in the past, so the
  // clock must start that far ahead rather than assuming progressMs was
  // captured right now. Clamped to [0, MAX_POLL_STALENESS_COMPENSATION_MS]
  // so backend/frontend clock skew or an unexpectedly old snapshot can't
  // swing this the wrong way or jump the display implausibly far forward.
  useEffect(() => {
    const staleness = displaySnapshot?.polledAt
      ? Math.min(Math.max(Date.now() - displaySnapshot.polledAt, 0), MAX_POLL_STALENESS_COMPENSATION_MS)
      : 0
    const duration = displaySnapshot?.durationMs ?? Infinity
    const seeded = Math.min((displaySnapshot?.progressMs ?? 0) + staleness, duration)
    syncRef.current = { progressMs: seeded, at: Date.now() }
    setProgressMs(seeded)
  }, [displaySnapshot])

  // Tick the progress clock forward locally between SSE updates.
  useEffect(() => {
    if (!displaySnapshot?.isPlaying) return
    const interval = setInterval(() => {
      if (!syncRef.current) return
      const elapsed = Date.now() - syncRef.current.at
      const duration = displaySnapshot.durationMs ?? Infinity
      setProgressMs(Math.min(syncRef.current.progressMs + elapsed, duration))
    }, PROGRESS_TICK_MS)
    return () => clearInterval(interval)
  }, [displaySnapshot])

  // Fetches the expanded section's extra data (play count + artist info)
  // only once it's actually expanded, keyed to the track it opened for — a
  // stale response for a track the guest has since navigated away from is
  // simply ignored via the `cancelled` flag, same pattern as the effects above.
  useEffect(() => {
    if (!expanded || !displaySnapshot?.trackId) return
    let cancelled = false
    setDetailArtist(null)
    setDetailPlayCount(null)

    if (displaySnapshot.artistId) {
      getArtist(displaySnapshot.artistId)
        .then((data) => {
          if (!cancelled) setDetailArtist(data)
        })
        .catch(() => {
          // Decorative — silently leave the artist section out.
        })
    }

    getTrackPlayCount(displaySnapshot.trackId)
      .then((playCount) => {
        if (cancelled) return
        setDetailPlayCount(playCount)
      })
      .catch(() => {
        // Leave null — the play-count line just stays hidden.
      })

    return () => {
      cancelled = true
    }
  }, [expanded, displaySnapshot?.trackId, displaySnapshot?.artistId])

  const favoritesTrackIds = displaySnapshot?.trackId ? [displaySnapshot.trackId] : []
  const { status: favoritesStatus, toggle: toggleFavorite } = useFavoritesStatus(favoritesTrackIds, subscribe)

  if (!displaySnapshot || !displaySnapshot.isPlaying || !displaySnapshot.trackId) {
    // A rate-limited snapshot means the backend has stopped being able to ask
    // Spotify anything right now — "Nothing playing" would misreport that as
    // a confirmed, current fact rather than a connectivity problem. Only the
    // initial REST fetch carries `rateLimited` (SSE deltas never fire during
    // an active backoff window, so this can't be stale-masked by a later
    // SSE update while still actually rate-limited).
    if (displaySnapshot?.rateLimited) {
      return (
        <Card className="flex flex-col items-center gap-1 py-8 text-center">
          <p className="text-body text-text-secondary">Could not connect to Spotify</p>
          <p className="text-caption text-text-muted">
            Spotify is rate-limiting requests from this app right now — try again in a bit.
          </p>
        </Card>
      )
    }

    return (
      <Card className="flex flex-col items-center gap-1 py-8 text-center">
        <p className="text-body text-text-secondary">Nothing playing</p>
        <p className="text-caption text-text-muted">Add a song below to get things started.</p>
      </Card>
    )
  }

  const duration = displaySnapshot.durationMs ?? 0
  const pct = duration > 0 ? Math.min(100, (progressMs / duration) * 100) : 0
  const remaining = Math.max(0, duration - progressMs)

  return (
    <Card
      className={`cursor-pointer transition-slow active:scale-[0.99] ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={(e) => {
        // The artist link inside the expanded section (below) needs its own
        // click to navigate rather than toggle this card — checking the
        // actual click target here (rather than relying solely on the
        // link's own stopPropagation) means any future interactive element
        // added inside the card is safe by default too.
        if ((e.target as HTMLElement).closest('a')) return
        setExpanded((prev) => !prev)
      }}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={expanded ? 'Show less about this track' : 'Show more about this track'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded((prev) => !prev)
        }
      }}
    >
      {/* At lg+, once the artist detail section has data, split the card
          art/track-info and artist/genre sections side by side rather than
          stacked — the wide lg content column (up to 1200px) otherwise
          leaves the track-info column and its progress bar stretched far
          past their natural content width, reading as dead space rather
          than the "breathing room" sibling Card-row layouts get away with.
          Below lg (and while the detail section hasn't loaded yet) this
          stays a plain stacked column, pixel-identical to before. */}
      <div className={expanded && detailArtist ? 'lg:flex lg:items-start lg:gap-6' : ''}>
        <div className={`flex items-center gap-4 ${expanded && detailArtist ? 'lg:w-1/2' : ''}`}>
          {displaySnapshot.albumArt ? (
            <img
              src={displaySnapshot.albumArt}
              alt=""
              className={`shrink-0 rounded-md bg-surface-overlay object-cover transition-slow ${
                expanded ? 'h-40 w-40' : 'h-16 w-16'
              }`}
            />
          ) : (
            <PlaceholderArt className={`transition-slow ${expanded ? 'h-40 w-40' : 'h-16 w-16'}`} />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-text-primary">{displaySnapshot.name}</p>
                <p className="truncate text-caption text-text-secondary">{displaySnapshot.artist}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="mt-0.5 rounded-full px-2.5 py-1 text-caption text-text-secondary transition-fast hover:bg-white/5 active:bg-white/10"
                  aria-pressed={showLyrics}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleLyrics()
                  }}
                >
                  Lyrics
                </button>
                <FavoriteButton
                  className="mt-0.5 shrink-0"
                  size="md"
                  favoritedByMe={favoritesStatus[displaySnapshot.trackId]?.favoritedByMe ?? false}
                  favoritedByAnyone={favoritesStatus[displaySnapshot.trackId]?.favoritedByAnyone ?? false}
                  onToggle={() => {
                    const track: Track = {
                      id: displaySnapshot.trackId as string,
                      name: displaySnapshot.name ?? '',
                      artist: displaySnapshot.artist ?? '',
                      albumArt: displaySnapshot.albumArt ?? null,
                      durationMs: displaySnapshot.durationMs ?? 0,
                      explicit: false,
                    }
                    toggleFavorite(track)
                  }}
                />
              </div>
            </div>

            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-overlay">
              <div className="h-full rounded-full bg-accent transition-fast" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-caption text-text-muted">
              <span>{formatDuration(progressMs)}</span>
              <span>-{formatDuration(remaining)}</span>
            </div>

            {expanded && detailPlayCount !== null && (
              <p className="mt-3 inline-block rounded-full bg-surface-overlay px-3 py-1 text-caption text-text-secondary">
                Played {detailPlayCount} {detailPlayCount === 1 ? 'time' : 'times'}
              </p>
            )}
          </div>
        </div>

        {expanded && detailArtist && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 text-left lg:mt-0 lg:w-1/2 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            {/* The whole row (not just the name text) is the tap target — a
                thin one-line link was easy to miss by a few pixels on a phone,
                landing the tap on this card's own expand/collapse handler
                instead (well below the 44px touch-target minimum Button.tsx
                uses elsewhere). min-h-11 plus -m-2/p-2 keeps the visual layout
                unchanged while growing the actual hit area around it. */}
            <Link
              to={`/search?q=${encodeURIComponent(detailArtist.name)}`}
              onClick={(e) => e.stopPropagation()}
              className="-m-2 flex min-h-11 items-center gap-3 rounded-md p-2 transition-fast active:bg-white/5"
            >
              {detailArtist.imageUrl ? (
                <img
                  src={detailArtist.imageUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full bg-surface-overlay object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-accent underline-offset-2 hover:underline">
                  {detailArtist.name}
                </p>
                <p className="text-caption text-text-muted">{detailArtist.followers.toLocaleString()} followers</p>
              </div>
            </Link>

            {detailArtist.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detailArtist.genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full bg-surface-overlay px-2.5 py-1 text-caption text-text-secondary"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
