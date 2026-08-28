import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../ui/Card'
import { getArtist, getLeaderboard, getNowPlaying, type ArtistInfo, type NowPlayingState } from '../../lib/api'
import { formatDuration } from '../../lib/format'
import type { EventStream } from '../../hooks/useEventStream'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

/** Matches --duration-slow in index.css — the crossfade should ride the same token. */
const CROSSFADE_MS = 320
const PROGRESS_TICK_MS = 1000

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
    onAlbumArtChange?.(snapshot?.albumArt ?? null)
  }, [snapshot, onAlbumArtChange])

  useEffect(() => {
    onIsPlayingChange?.(snapshot?.isPlaying ?? false)
  }, [snapshot, onIsPlayingChange])

  useEffect(() => {
    onArtistIdChange?.(snapshot?.artistId || null)
  }, [snapshot, onArtistIdChange])

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
  useEffect(() => {
    syncRef.current = { progressMs: displaySnapshot?.progressMs ?? 0, at: Date.now() }
    setProgressMs(displaySnapshot?.progressMs ?? 0)
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

    getLeaderboard()
      .then((entries) => {
        if (cancelled) return
        const match = entries.find((e) => e.spotifyTrackId === displaySnapshot.trackId)
        setDetailPlayCount(match?.playCount ?? 0)
      })
      .catch(() => {
        // Leave null — the play-count line just stays hidden.
      })

    return () => {
      cancelled = true
    }
  }, [expanded, displaySnapshot?.trackId, displaySnapshot?.artistId])

  if (!displaySnapshot || !displaySnapshot.isPlaying || !displaySnapshot.trackId) {
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
      onClick={() => setExpanded((e) => !e)}
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
      <div className="flex items-center gap-4">
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
          <p className="truncate text-body font-semibold text-text-primary">{displaySnapshot.name}</p>
          <p className="truncate text-caption text-text-secondary">{displaySnapshot.artist}</p>

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

      {/*
       * Grid-rows trick for an animatable height on content whose size isn't
       * known up front (album/genre text lengths vary) — a plain max-height
       * transition would need a guessed cap, this doesn't.
       */}
      <div
        className="grid transition-slow"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {detailArtist && (
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 text-left">
              <div className="flex items-center gap-3">
                {detailArtist.imageUrl ? (
                  <img
                    src={detailArtist.imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full bg-surface-overlay object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/search?q=${encodeURIComponent(detailArtist.name)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate text-body font-semibold text-accent underline-offset-2 hover:underline"
                  >
                    {detailArtist.name}
                  </Link>
                  <p className="text-caption text-text-muted">{detailArtist.followers.toLocaleString()} followers</p>
                </div>
              </div>

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
      </div>
    </Card>
  )
}
