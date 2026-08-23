import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import {
  ApiError,
  clearAdminQueue,
  deleteAdminQueueEntry,
  getAdminQueue,
  postBlacklist,
  type BlacklistType,
  type QueueEntry,
} from '../../lib/api'
import { formatDuration } from '../../lib/format'
import { useToast } from '../../context/ToastContext'

export interface QueueModerationProps {
  token: string
}

function describeError(err: unknown, fallback?: string): string | undefined {
  if (err instanceof ApiError) return err.message || fallback
  return fallback
}

/** Admin queue row — reuses QueueList's visual pattern plus a Remove action. */
function ModerationRow({ entry, onRemove }: { entry: QueueEntry; onRemove: (id: number) => void }) {
  return (
    <Card noPadding className="flex items-center gap-3 p-3">
      {entry.albumArtUrl ? (
        <img
          src={entry.albumArtUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-sm bg-surface-overlay object-cover"
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-sm bg-surface-overlay" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-text-primary">{entry.trackName}</p>
        <p className="truncate text-caption text-text-secondary">
          {entry.artistName} · {formatDuration(entry.durationMs)}
        </p>
      </div>
      <Button variant="danger" size="md" className="shrink-0 px-3" onClick={() => onRemove(entry.id)}>
        Remove
      </Button>
    </Card>
  )
}

/**
 * Queue moderation panel (P3.4). Fetches the admin queue mirror, offers
 * per-entry removal, a confirm-then-clear action for the whole queue, and a
 * raw type+value blacklist form. Not SSE-live — every mutating action just
 * re-fetches the list afterward, matching the guest-facing QueueList's
 * already-live view via a separate P4.3 SSE subscription.
 */
export function QueueModeration({ token }: QueueModerationProps) {
  const [queue, setQueue] = useState<QueueEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [blacklistType, setBlacklistType] = useState<BlacklistType>('artist')
  const [blacklistValue, setBlacklistValue] = useState('')
  const [submittingBlacklist, setSubmittingBlacklist] = useState(false)
  const { showToast } = useToast()

  const load = useCallback(() => {
    getAdminQueue(token)
      .then((data) => {
        setQueue(data)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        setLoadError(describeError(err, 'Could not load the queue.') ?? 'Could not load the queue.')
      })
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  async function handleRemove(id: number) {
    try {
      await deleteAdminQueueEntry(token, id)
      showToast('success', 'Track removed')
      load()
    } catch (err) {
      showToast('error', 'Could not remove track', describeError(err))
    }
  }

  async function handleClear() {
    setConfirmingClear(false)
    try {
      await clearAdminQueue(token)
      showToast('success', 'Queue cleared')
      load()
    } catch (err) {
      showToast('error', 'Could not clear queue', describeError(err))
    }
  }

  async function handleBlacklistSubmit(e: FormEvent) {
    e.preventDefault()
    if (blacklistValue.trim() === '' || submittingBlacklist) return

    setSubmittingBlacklist(true)
    try {
      await postBlacklist(token, { type: blacklistType, value: blacklistValue.trim() })
      showToast('success', `${blacklistType === 'track' ? 'Track' : 'Artist'} blacklisted`)
      setBlacklistValue('')
    } catch (err) {
      showToast('error', 'Could not blacklist', describeError(err))
    } finally {
      setSubmittingBlacklist(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-title text-text-primary">Queue moderation</p>
        {!confirmingClear ? (
          <Button
            variant="danger"
            size="md"
            className="px-3"
            disabled={!queue || queue.length === 0}
            onClick={() => setConfirmingClear(true)}
          >
            Clear queue
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-caption text-text-secondary">Clear entire queue?</span>
            <Button variant="secondary" size="md" className="px-3" onClick={() => setConfirmingClear(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" className="px-3" onClick={() => void handleClear()}>
              Confirm
            </Button>
          </div>
        )}
      </div>

      {loadError && (
        <div className="rounded-md border border-error-muted bg-error-muted px-4 py-3 text-center text-caption text-error">
          {loadError}
        </div>
      )}

      {queue === null && !loadError && (
        <div className="flex flex-col gap-2">
          <Skeleton variant="block" />
          <Skeleton variant="block" />
        </div>
      )}

      {queue !== null && queue.length === 0 && (
        <p className="py-4 text-center text-caption text-text-muted">Queue is empty.</p>
      )}

      {queue !== null && queue.length > 0 && (
        <div className="flex flex-col gap-2">
          {queue.map((entry) => (
            <ModerationRow key={entry.id} entry={entry} onRemove={(id) => void handleRemove(id)} />
          ))}
        </div>
      )}

      <form onSubmit={handleBlacklistSubmit} className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">Blacklist</p>
        <div className="flex gap-2">
          <select
            value={blacklistType}
            onChange={(e) => setBlacklistType(e.target.value as BlacklistType)}
            className="h-11 shrink-0 rounded-md border border-border bg-surface-raised px-2 text-body text-text-primary outline-none focus-visible:border-accent"
          >
            <option value="artist">Artist</option>
            <option value="track">Track</option>
          </select>
          <input
            type="text"
            value={blacklistValue}
            onChange={(e) => setBlacklistValue(e.target.value)}
            placeholder={blacklistType === 'artist' ? 'Artist name' : 'Spotify track id'}
            className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-3 text-body text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={blacklistValue.trim() === '' || submittingBlacklist}>
          {submittingBlacklist ? 'Blacklisting…' : 'Blacklist'}
        </Button>
      </form>
    </Card>
  )
}
