import { useCallback, useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { ApiError, getLeaderboard, type LeaderboardEntry } from '../../lib/api'
import type { EventStream } from '../../hooks/useEventStream'

const SKELETON_ROWS = 3

export interface LeaderboardProps {
  subscribe: EventStream['subscribe']
  /** Bumped by the manual-refresh fallback affordance to force a re-fetch. */
  refreshKey: number
}

function LeaderboardSkeletonRow() {
  return (
    <Card noPadding className="flex items-center gap-3 p-3">
      <Skeleton variant="circle" className="rounded-sm" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton variant="line" className="w-2/3" />
        <Skeleton variant="line" className="w-1/3" />
      </div>
    </Card>
  )
}

/** Ranked row: rank badge, art, name/artist, play count. */
function LeaderboardRow({ rank, entry }: { rank: number; entry: LeaderboardEntry }) {
  return (
    <Card noPadding className="flex items-center gap-3 p-3">
      <span className="w-6 shrink-0 text-center text-body font-semibold text-text-muted">
        {rank}
      </span>

      {entry.albumArtUrl ? (
        <img
          src={entry.albumArtUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-sm bg-surface-overlay object-cover"
        />
      ) : (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-surface-overlay text-text-muted"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-text-primary">{entry.trackName}</p>
        <p className="truncate text-caption text-text-secondary">{entry.artistName}</p>
      </div>

      <span className="shrink-0 text-caption font-semibold text-text-muted">
        {entry.playCount} {entry.playCount === 1 ? 'play' : 'plays'}
      </span>
    </Card>
  )
}

/**
 * Top-played-tracks leaderboard. Fetches the authoritative GET /api/leaderboard
 * on mount and re-fetches on every `leaderboard-update` SSE event (P4.4) —
 * per the backend contract, the delta payload varies by source (queue-add vs.
 * blacklist action) so it isn't interpreted client-side, the list is just
 * re-pulled whole each time, mirroring QueueList's pattern from P4.3.
 */
export function Leaderboard({ subscribe, refreshKey }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const load = useCallback(() => {
    getLeaderboard()
      .then((data) => {
        setEntries(data)
        setErrorMessage(null)
      })
      .catch((err: unknown) => {
        setErrorMessage(err instanceof ApiError ? err.message : 'Could not load the leaderboard.')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => subscribe('leaderboard-update', () => load()), [subscribe, load])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
        Leaderboard
      </p>

      {entries === null && !errorMessage && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <LeaderboardSkeletonRow key={i} />
          ))}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-error-muted bg-error-muted px-4 py-3 text-center text-caption text-error">
          {errorMessage}
        </div>
      )}

      {entries !== null && entries.length === 0 && (
        <div className="flex flex-col items-center gap-1 py-6 text-center">
          <p className="text-body text-text-secondary">No plays yet</p>
          <p className="text-caption text-text-muted">Be the first to queue a song!</p>
        </div>
      )}

      {entries !== null && entries.length > 0 && (
        <div className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <LeaderboardRow key={entry.spotifyTrackId} rank={i + 1} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
