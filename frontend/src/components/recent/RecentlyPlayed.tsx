import { useCallback, useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { ApiError, getRecentlyPlayed, type RecentlyPlayedEntry } from '../../lib/api'
import { formatRelativeTime } from '../../lib/format'
import type { EventStream } from '../../hooks/useEventStream'

const SKELETON_ROWS = 3

export interface RecentlyPlayedProps {
  subscribe: EventStream['subscribe']
  /** Bumped by the manual-refresh fallback affordance to force a re-fetch. */
  refreshKey: number
}

function RecentlyPlayedSkeletonRow() {
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

/** Read-only row: art, name/artist, relative "played X ago" timestamp. */
function RecentlyPlayedRow({ entry }: { entry: RecentlyPlayedEntry }) {
  return (
    <Card noPadding className="flex items-center gap-3 p-3">
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

      <span className="shrink-0 text-caption text-text-muted">
        {formatRelativeTime(entry.playedAt)}
      </span>
    </Card>
  )
}

/**
 * Recently-played history list. Fetches GET /api/recent on mount. Also
 * re-fetches on `leaderboard-update` SSE events — there's no dedicated live
 * event for "recently played" per the backend contract, but a queue-add is
 * exactly what changes both the leaderboard and the recent-plays history, so
 * piggybacking on the same event keeps this reasonably fresh too (a
 * nice-to-have, not required by the acceptance criteria).
 */
export function RecentlyPlayed({ subscribe, refreshKey }: RecentlyPlayedProps) {
  const [entries, setEntries] = useState<RecentlyPlayedEntry[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const load = useCallback(() => {
    getRecentlyPlayed()
      .then((data) => {
        setEntries(data)
        setErrorMessage(null)
      })
      .catch((err: unknown) => {
        setErrorMessage(err instanceof ApiError ? err.message : 'Could not load recently played tracks.')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => subscribe('leaderboard-update', () => load()), [subscribe, load])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
        Recently played
      </p>

      {entries === null && !errorMessage && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <RecentlyPlayedSkeletonRow key={i} />
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
          <p className="text-body text-text-secondary">Nothing's been played yet.</p>
        </div>
      )}

      {entries !== null && entries.length > 0 && (
        <div className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <RecentlyPlayedRow key={`${entry.spotifyTrackId}-${entry.playedAt}-${i}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
