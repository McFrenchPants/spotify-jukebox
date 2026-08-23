import { useEffect, useRef, useState } from 'react'
import { Card } from '../ui/Card'
import { getNowPlaying, type NowPlayingState } from '../../lib/api'
import { formatDuration } from '../../lib/format'
import type { EventStream } from '../../hooks/useEventStream'

/** Matches --duration-slow in index.css — the crossfade should ride the same token. */
const CROSSFADE_MS = 320
const PROGRESS_TICK_MS = 1000

export interface NowPlayingProps {
  subscribe: EventStream['subscribe']
  /** Bumped by the manual-refresh fallback affordance to force a re-fetch. */
  refreshKey: number
  /** Reports the current track's art URL up so App.tsx can thread it into AppShell's background. */
  onAlbumArtChange?: (albumArt: string | null) => void
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
export function NowPlaying({ subscribe, refreshKey, onAlbumArtChange }: NowPlayingProps) {
  const [snapshot, setSnapshot] = useState<NowPlayingState | null>(null)
  const [displaySnapshot, setDisplaySnapshot] = useState<NowPlayingState | null>(null)
  const [visible, setVisible] = useState(true)
  const [progressMs, setProgressMs] = useState(0)
  const pendingRef = useRef<NowPlayingState | null>(null)
  const syncRef = useRef<{ progressMs: number; at: number } | null>(null)

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
    }, CROSSFADE_MS)
    return () => clearTimeout(timer)
    // Intentionally keyed only on `snapshot` — `displaySnapshot` is read for
    // comparison but must not retrigger this effect on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

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
    <Card className={`flex items-center gap-4 transition-slow ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {displaySnapshot.albumArt ? (
        <img
          src={displaySnapshot.albumArt}
          alt=""
          className="h-16 w-16 shrink-0 rounded-md bg-surface-overlay object-cover"
        />
      ) : (
        <PlaceholderArt className="h-16 w-16" />
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
      </div>
    </Card>
  )
}
