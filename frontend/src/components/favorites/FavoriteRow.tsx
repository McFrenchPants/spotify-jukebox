import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { FavoriteButton } from './FavoriteButton'
import type { QueueRowStatus } from '../search/TrackRow'
import type { FavoriteTrack } from '../../lib/api'

export interface FavoriteRowProps {
  favorite: FavoriteTrack
  status: QueueRowStatus
  onAdd: (favorite: FavoriteTrack) => void
  onToggleFavorite: (favorite: FavoriteTrack) => void
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * One row in the Favorites list (F4.1) — visually mirrors TrackRow (art,
 * name, artist + duration, add-to-queue action) but adds a FavoriteButton
 * and omits the explicit badge (FavoriteTrack doesn't carry that field).
 * A dedicated sibling component rather than reworking TrackRow itself,
 * since TrackRow's `status`/`onAdd` shape is tailored to search results and
 * is depended on elsewhere — this keeps that component untouched.
 */
export function FavoriteRow({ favorite, status, onAdd, onToggleFavorite }: FavoriteRowProps) {
  const disabled = status !== 'idle'

  return (
    <Card noPadding className="flex items-center gap-3 p-3">
      {favorite.albumArtUrl ? (
        <img
          src={favorite.albumArtUrl}
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
        <p className="truncate text-body font-semibold text-text-primary">{favorite.trackName}</p>
        <p className="truncate text-caption text-text-secondary">
          {favorite.artistName} · {formatDuration(favorite.durationMs)}
        </p>
      </div>

      <FavoriteButton
        favoritedByMe
        favoritedByAnyone
        size="sm"
        className="shrink-0"
        onToggle={() => onToggleFavorite(favorite)}
      />

      <Button
        variant={status === 'added' ? 'secondary' : 'primary'}
        size="md"
        className="shrink-0"
        disabled={disabled}
        onClick={() => onAdd(favorite)}
      >
        {status === 'adding' ? 'Adding to Queue…' : status === 'added' ? 'Added' : 'Add to Queue'}
      </Button>
    </Card>
  )
}
