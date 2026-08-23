import { useEffect, useRef, useState } from 'react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { Toast } from '../ui/Toast'
import { TrackRow, type QueueRowStatus } from './TrackRow'
import { ApiError, queueTrack, searchTracks, type Track } from '../../lib/api'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useSimpleToast } from '../../hooks/useSimpleToast'
import { useSession } from '../../context/SessionContext'

const DEBOUNCE_MS = 380
const SKELETON_ROWS = 4

interface SearchOutcome {
  query: string
  tracks: Track[] | null // null means the request errored
  errorMessage: string | null
}

function SearchSkeletonRow() {
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

/** Human-readable "Xs" / "Xm Ys" from a millisecond duration, rounded up. */
function formatRetryAfter(retryAfterMs: number): string {
  const totalSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

/**
 * Maps a queue-add failure to distinct, guest-facing copy. The 422
 * guardrail rejections already carry a complete human-readable sentence
 * from the backend (see backend/src/guardrails/queueGuardrails.ts) — that's
 * reused as-is since each `reason` produces its own distinct message there.
 * Rate limiting (429) has no message from the backend, so it's composed
 * here from `retryAfterMs`. Everything else falls back to a generic message.
 */
function describeQueueError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      const wait = err.retryAfterMs !== undefined ? formatRetryAfter(err.retryAfterMs) : 'a moment'
      return `You're queueing too fast — try again in ${wait}.`
    }
    if (err.status === 422) {
      return err.message
    }
    if (err.status === 503) {
      return "Playback isn't ready yet — an admin needs to finish setup. Try again shortly."
    }
    if (err.status === 404) {
      return "That track couldn't be found on Spotify."
    }
    return err.message || 'Could not add that track to the queue.'
  }
  return 'Could not add that track to the queue — check your connection and try again.'
}

/**
 * Debounced search box + result list + add-to-queue flow (P4.2). Renders
 * inside AppShell's <main>. Search results are read-only track data;
 * queueing is optimistic per-row with a single transient toast for the
 * outcome.
 */
export function SearchAndQueue() {
  const { token } = useSession()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS)
  // The most recently *completed* (successful or failed) search outcome.
  // Loading state is derived below by comparing this to debouncedQuery,
  // rather than tracked as its own piece of state — avoids setting state
  // synchronously inside the effect that kicks off the fetch.
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null)
  const [rowStatus, setRowStatus] = useState<Record<string, QueueRowStatus>>({})
  const { toast, showToast, dismiss } = useSimpleToast()
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (debouncedQuery === '') {
      requestIdRef.current += 1 // invalidate any in-flight request
      return
    }

    const requestId = ++requestIdRef.current

    searchTracks(debouncedQuery)
      .then((tracks) => {
        if (requestIdRef.current !== requestId) return
        setOutcome({ query: debouncedQuery, tracks, errorMessage: null })
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return
        const message =
          err instanceof ApiError ? err.message : 'Search failed — check your connection and try again.'
        setOutcome({ query: debouncedQuery, tracks: null, errorMessage: message })
      })
  }, [debouncedQuery])

  const isLoading = debouncedQuery !== '' && outcome?.query !== debouncedQuery

  async function handleAdd(track: Track) {
    if (!token) return // session not ready — shouldn't happen, App only renders once loaded

    setRowStatus((prev) => ({ ...prev, [track.id]: 'adding' }))

    try {
      await queueTrack(track.id, token)
      setRowStatus((prev) => ({ ...prev, [track.id]: 'added' }))
      showToast('success', `Added "${track.name}" to the queue`, track.artist)
      setTimeout(() => {
        setRowStatus((prev) => (prev[track.id] === 'added' ? { ...prev, [track.id]: 'idle' } : prev))
      }, 2000)
    } catch (err) {
      setRowStatus((prev) => ({ ...prev, [track.id]: 'idle' }))
      showToast('warning', 'Could not add to queue', describeQueueError(err))
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      <label className="block">
        <span className="sr-only">Search for a song</span>
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a song or artist…"
          className="h-12 w-full rounded-md border border-border bg-surface-raised px-4 text-body text-text-primary placeholder:text-text-muted transition-fast focus:border-accent focus:outline-none"
        />
      </label>

      {debouncedQuery === '' && (
        <div className="flex flex-col items-center gap-1 pt-10 text-center">
          <p className="text-body text-text-secondary">Search for a song to add it to the queue.</p>
          <p className="text-caption text-text-muted">Try an artist name, song title, or both.</p>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <SearchSkeletonRow key={i} />
          ))}
        </div>
      )}

      {!isLoading && debouncedQuery !== '' && outcome?.query === debouncedQuery && outcome.errorMessage && (
        <div className="flex flex-col items-center gap-1 rounded-md border border-error-muted bg-error-muted px-4 py-6 text-center">
          <p className="text-body text-error">Search failed</p>
          <p className="text-caption text-text-secondary">{outcome.errorMessage}</p>
        </div>
      )}

      {!isLoading &&
        debouncedQuery !== '' &&
        outcome?.query === debouncedQuery &&
        outcome.tracks !== null &&
        outcome.tracks.length === 0 && (
          <div className="flex flex-col items-center gap-1 pt-10 text-center">
            <p className="text-body text-text-secondary">No results for &ldquo;{debouncedQuery}&rdquo;.</p>
            <p className="text-caption text-text-muted">Try a different spelling or search term.</p>
          </div>
        )}

      {!isLoading &&
        debouncedQuery !== '' &&
        outcome?.query === debouncedQuery &&
        outcome.tracks !== null &&
        outcome.tracks.length > 0 && (
          <div className="flex flex-col gap-2">
            {outcome.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                status={rowStatus[track.id] ?? 'idle'}
                onAdd={handleAdd}
              />
            ))}
          </div>
        )}

      {toast && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <Toast variant={toast.variant} title={toast.title} description={toast.description} onDismiss={dismiss} />
        </div>
      )}
    </div>
  )
}
