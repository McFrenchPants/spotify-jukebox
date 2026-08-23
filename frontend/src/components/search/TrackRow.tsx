import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import type { Track } from '../../lib/api'

export type QueueRowStatus = 'idle' | 'adding' | 'added'

export interface TrackRowProps {
  track: Track
  status: QueueRowStatus
  onAdd: (track: Track) => void
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** One search-result row: art, name/artist, duration, add-to-queue action. */
export function TrackRow({ track, status, onAdd }: TrackRowProps) {
  const disabled = status !== 'idle'

  return (
    <Card noPadding className="flex items-center gap-3 p-3">
      {track.albumArt ? (
        <img
          src={track.albumArt}
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
        <p className="truncate text-body font-semibold text-text-primary">
          {track.name}
          {track.explicit && (
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
          {track.artist} · {formatDuration(track.durationMs)}
        </p>
      </div>

      <Button
        variant={status === 'added' ? 'secondary' : 'primary'}
        size="md"
        className="shrink-0"
        disabled={disabled}
        onClick={() => onAdd(track)}
      >
        {status === 'adding' ? 'Adding…' : status === 'added' ? 'Added' : 'Add'}
      </Button>
    </Card>
  )
}
