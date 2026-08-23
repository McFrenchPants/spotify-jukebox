import { useCallback, useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { ApiError, getQueue, type QueueEntry } from '../../lib/api'
import { formatDuration } from '../../lib/format'
import type { EventStream } from '../../hooks/useEventStream'

const SKELETON_ROWS = 3

export interface QueueListProps {
  subscribe: EventStream['subscribe']
  /** Bumped by the manual-refresh fallback affordance to force a re-fetch. */
  refreshKey: number
}

function QueueSkeletonRow() {
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

/** Read-only row matching TrackRow's visual pattern (art, name, artist, duration) minus the Add action. */
function QueueRow({ entry }: { entry: QueueEntry }) {
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
        <p className="truncate text-caption text-text-secondary">
          {entry.artistName} · {formatDuration(entry.durationMs)}
        </p>
      </div>
    </Card>
  )
}

/**
 * Upcoming-queue list. Fetches the authoritative GET /api/queue on mount and
 * re-fetches on every `queue-update` SSE event (P4.3) — per the backend
 * contract, delta payloads aren't interpreted client-side, the list is just
 * re-pulled whole each time.
 */
export function QueueList({ subscribe, refreshKey }: QueueListProps) {
  const [queue, setQueue] = useState<QueueEntry[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const load = useCallback(() => {
    getQueue()
      .then((data) => {
        setQueue(data)
        setErrorMessage(null)
      })
      .catch((err: unknown) => {
        setErrorMessage(err instanceof ApiError ? err.message : 'Could not load the queue.')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => subscribe('queue-update', () => load()), [subscribe, load])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">Up next</p>

      {queue === null && !errorMessage && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <QueueSkeletonRow key={i} />
          ))}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-error-muted bg-error-muted px-4 py-3 text-center text-caption text-error">
          {errorMessage}
        </div>
      )}

      {queue !== null && queue.length === 0 && (
        <div className="flex flex-col items-center gap-1 py-6 text-center">
          <p className="text-body text-text-secondary">Nothing queued yet</p>
          <p className="text-caption text-text-muted">Search below to add a song.</p>
        </div>
      )}

      {queue !== null && queue.length > 0 && (
        <div className="flex flex-col gap-2">
          {queue.map((entry) => (
            <QueueRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
