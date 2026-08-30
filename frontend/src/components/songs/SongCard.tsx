import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { FavoriteButton } from '../favorites/FavoriteButton'

export type QueueRowStatus = 'idle' | 'adding' | 'added'

export interface SongCardProps {
  albumArtUrl: string | null
  name: string
  artist: string
  /** Search's explicit "E" badge — only Search has this data. */
  explicit?: boolean
  /** Leaderboard only. */
  rank?: number
  /** Leaderboard only ("N plays" text). */
  playCount?: number
  /** RecentlyPlayed only, already-formatted relative time string. */
  timestamp?: string
  /** Search + Favorites only. */
  durationMs?: number
  favorite?: {
    favoritedByMe: boolean
    favoritedByAnyone: boolean
    onToggle: () => void
  }
  addToQueue?: {
    status: QueueRowStatus
    onAdd: () => void
  }
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Fallback album-art placeholder shared by every SongCard when albumArtUrl is null. */
function PlaceholderArt() {
  return (
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
  )
}

/**
 * Single shared song row used by every song-list surface (Leaderboard,
 * Recently Played, Search, Favorites): art, name/artist, one optional
 * secondary-metadata slot (rank+playCount, timestamp, or duration —
 * each list only ever passes the one relevant to it), and independently
 * optional favorite-toggle / add-to-queue actions. Replaces the four
 * bespoke per-list rows that used to duplicate this markup (BACKLOG item 17).
 */
export function SongCard({
  albumArtUrl,
  name,
  artist,
  explicit,
  rank,
  playCount,
  timestamp,
  durationMs,
  favorite,
  addToQueue,
}: SongCardProps) {
  const addDisabled = addToQueue !== undefined && addToQueue.status !== 'idle'

  return (
    <Card noPadding className="flex items-center gap-3 p-3">
      {rank !== undefined && (
        <span className="w-6 shrink-0 text-center text-body font-semibold text-text-muted">{rank}</span>
      )}

      {albumArtUrl ? (
        <img
          src={albumArtUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-sm bg-surface-overlay object-cover"
        />
      ) : (
        <PlaceholderArt />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-text-primary">
          {name}
          {explicit && (
            <span
              className="ml-1.5 rounded-sm bg-surface-overlay px-1 align-middle text-caption text-text-muted"
              aria-label="Explicit"
              title="Explicit"
            >
              E
            </span>
          )}
        </p>
        <p className="truncate text-caption text-text-secondary">
          {artist}
          {durationMs !== undefined && ` · ${formatDuration(durationMs)}`}
        </p>
      </div>

      {playCount !== undefined && (
        <span className="shrink-0 text-caption font-semibold text-text-muted">
          {playCount} {playCount === 1 ? 'play' : 'plays'}
        </span>
      )}

      {timestamp !== undefined && (
        <span className="shrink-0 text-caption text-text-muted">{timestamp}</span>
      )}

      {favorite && (
        <FavoriteButton
          size="sm"
          className="shrink-0"
          favoritedByMe={favorite.favoritedByMe}
          favoritedByAnyone={favorite.favoritedByAnyone}
          onToggle={favorite.onToggle}
        />
      )}

      {addToQueue && (
        <Button
          variant={addToQueue.status === 'added' ? 'secondary' : 'primary'}
          size="md"
          className="shrink-0"
          disabled={addDisabled}
          onClick={addToQueue.onAdd}
        >
          {addToQueue.status === 'adding'
            ? 'Adding to Queue…'
            : addToQueue.status === 'added'
              ? 'Added'
              : 'Add to Queue'}
        </Button>
      )}
    </Card>
  )
}
