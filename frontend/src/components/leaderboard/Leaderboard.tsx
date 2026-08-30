import { useCallback, useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { ApiError, getLeaderboard, queueTrack, type LeaderboardEntry } from '../../lib/api'
import type { EventStream } from '../../hooks/useEventStream'
import { useFavoritesStatus } from '../../hooks/useFavoritesStatus'
import { SongCard, type QueueRowStatus } from '../songs/SongCard'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../../context/ToastContext'
import { describeQueueError } from '../../lib/queueErrors'

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

/**
 * Top-played-tracks leaderboard. Fetches the authoritative GET /api/leaderboard
 * on mount and re-fetches on every `leaderboard-update` SSE event (P4.4) —
 * per the backend contract, the delta payload varies by source (queue-add vs.
 * blacklist action) so it isn't interpreted client-side, the list is just
 * re-pulled whole each time, mirroring QueueList's pattern from P4.3.
 */
export function Leaderboard({ subscribe, refreshKey }: LeaderboardProps) {
  const { token } = useSession()
  const { showToast } = useToast()
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [rowStatus, setRowStatus] = useState<Record<string, QueueRowStatus>>({})

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

  const { status: favoritesStatus, toggle: toggleFavorite } = useFavoritesStatus(
    entries?.map((e) => e.spotifyTrackId) ?? [],
    subscribe
  )

  async function handleAdd(entry: LeaderboardEntry) {
    if (!token) return // session not ready — shouldn't happen, App only renders once loaded

    const id = entry.spotifyTrackId
    setRowStatus((prev) => ({ ...prev, [id]: 'adding' }))

    try {
      await queueTrack(id, token)
      setRowStatus((prev) => ({ ...prev, [id]: 'added' }))
      showToast('success', `Added "${entry.trackName}" to the queue`, entry.artistName)
      setTimeout(() => {
        setRowStatus((prev) => (prev[id] === 'added' ? { ...prev, [id]: 'idle' } : prev))
      }, 2000)
    } catch (err) {
      setRowStatus((prev) => ({ ...prev, [id]: 'idle' }))
      showToast('warning', 'Could not add to queue', describeQueueError(err))
    }
  }

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
        <div className="rounded-md border border-error-muted/60 bg-error-muted/70 backdrop-blur-md px-4 py-3 text-center text-caption text-error">
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
            <SongCard
              key={entry.spotifyTrackId}
              rank={i + 1}
              albumArtUrl={entry.albumArtUrl}
              name={entry.trackName}
              artist={entry.artistName}
              playCount={entry.playCount}
              favorite={{
                favoritedByMe:
                  favoritesStatus[entry.spotifyTrackId]?.favoritedByMe ?? false,
                favoritedByAnyone:
                  favoritesStatus[entry.spotifyTrackId]?.favoritedByAnyone ?? false,
                onToggle: () =>
                  toggleFavorite({
                    id: entry.spotifyTrackId,
                    name: entry.trackName,
                    artist: entry.artistName,
                    albumArt: entry.albumArtUrl,
                    durationMs: 0,
                    explicit: false,
                  }),
              }}
              addToQueue={{
                status: rowStatus[entry.spotifyTrackId] ?? 'idle',
                onAdd: () => handleAdd(entry),
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
