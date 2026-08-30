import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { SongCard, type QueueRowStatus } from '../songs/SongCard'
import {
  ApiError,
  getFavorites,
  queueTrack,
  searchTracks,
  type FavoriteTrack,
  type Track,
} from '../../lib/api'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useToast } from '../../context/ToastContext'
import { useSession } from '../../context/SessionContext'
import { useFavoritesStatus } from '../../hooks/useFavoritesStatus'
import type { EventStream } from '../../hooks/useEventStream'
import { describeQueueError } from '../../lib/queueErrors'

const DEBOUNCE_MS = 380
const SKELETON_ROWS = 4

type ActiveTab = 'search' | 'favorites'

type FavoritesSort = 'recent' | 'name-asc' | 'name-desc' | 'artist-asc' | 'artist-desc'

const FAVORITES_SORT_OPTIONS: { value: FavoritesSort; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'name-asc', label: 'Song Name (A–Z)' },
  { value: 'name-desc', label: 'Song Name (Z–A)' },
  { value: 'artist-asc', label: 'Artist (A–Z)' },
  { value: 'artist-desc', label: 'Artist (Z–A)' },
]

interface SearchOutcome {
  query: string
  tracks: Track[] | null // null means the request errored
  errorMessage: string | null
}

export interface SearchAndQueueProps {
  subscribe: EventStream['subscribe']
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

/** Converts a FavoriteTrack (favorites API shape) into the Track shape queueTrack/toggle expect. */
function favoriteToTrack(favorite: FavoriteTrack): Track {
  return {
    id: favorite.spotifyTrackId,
    name: favorite.trackName,
    artist: favorite.artistName,
    albumArt: favorite.albumArtUrl,
    durationMs: favorite.durationMs,
    // Not tracked by FavoriteTrack and unused by the backend's queue-add call
    // (which re-fetches real metadata server-side) — safe placeholder.
    explicit: false,
  }
}

/**
 * Debounced search box + result list + add-to-queue flow (P4.2), plus a
 * Favorites tab (F4.1) listing the guest's favorited tracks with
 * sort/filter and the same add-to-queue/unfavorite affordances. Renders
 * inside AppShell's <main>. Search results are read-only track data;
 * queueing is optimistic per-row with a single transient toast for the
 * outcome.
 */
export function SearchAndQueue({ subscribe }: SearchAndQueueProps) {
  const { token } = useSession()
  const [activeTab, setActiveTab] = useState<ActiveTab>('search')

  // Prefilled from ?q= when arriving via the "See more from this artist" link
  // on the expanded Now Playing card (NowPlaying.tsx) — read once on mount,
  // not kept in sync with the URL afterwards.
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS)
  // The most recently *completed* (successful or failed) search outcome.
  // Loading state is derived below by comparing this to debouncedQuery,
  // rather than tracked as its own piece of state — avoids setting state
  // synchronously inside the effect that kicks off the fetch.
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null)
  const [rowStatus, setRowStatus] = useState<Record<string, QueueRowStatus>>({})
  const { showToast } = useToast()
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

  const { status: favoritesStatus, toggle: toggleFavorite } = useFavoritesStatus(
    outcome?.tracks?.map((t) => t.id) ?? [],
    subscribe
  )

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
      <div className="mx-auto flex w-full max-w-2xl gap-2">
        <Button
          type="button"
          variant={activeTab === 'search' ? 'primary' : 'secondary'}
          className="flex-1"
          onClick={() => setActiveTab('search')}
        >
          Search
        </Button>
        <Button
          type="button"
          variant={activeTab === 'favorites' ? 'primary' : 'secondary'}
          className="flex-1"
          onClick={() => setActiveTab('favorites')}
        >
          Favorites
        </Button>
      </div>

      {activeTab === 'search' && (
        <>
          <label className="block">
            <span className="sr-only">Search for a song</span>
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a song or artist…"
              className="glass-inset mx-auto block h-12 w-full max-w-2xl rounded-md px-4 text-body text-text-primary placeholder:text-text-muted transition-fast focus:border-accent focus:outline-none"
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
            <div className="flex flex-col items-center gap-1 rounded-md border border-error-muted/60 bg-error-muted/70 backdrop-blur-md px-4 py-6 text-center">
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
                  <SongCard
                    key={track.id}
                    albumArtUrl={track.albumArt}
                    name={track.name}
                    artist={track.artist}
                    explicit={track.explicit}
                    durationMs={track.durationMs}
                    favorite={{
                      favoritedByMe: favoritesStatus[track.id]?.favoritedByMe ?? false,
                      favoritedByAnyone: favoritesStatus[track.id]?.favoritedByAnyone ?? false,
                      onToggle: () => toggleFavorite(track),
                    }}
                    addToQueue={{
                      status: rowStatus[track.id] ?? 'idle',
                      onAdd: () => handleAdd(track),
                    }}
                  />
                ))}
              </div>
            )}
        </>
      )}

      {activeTab === 'favorites' && (
        <FavoritesSection subscribe={subscribe} onAdd={handleAdd} rowStatus={rowStatus} />
      )}
    </div>
  )
}

interface FavoritesSectionProps {
  subscribe: EventStream['subscribe']
  onAdd: (track: Track) => void
  rowStatus: Record<string, QueueRowStatus>
}

/** Loading/error states for the favorites fetch — mirrors the search tab's own outcome pattern. */
interface FavoritesOutcome {
  favorites: FavoriteTrack[] | null // null means the request errored
  errorMessage: string | null
}

/**
 * Favorites tab contents (F4.1): fetches the guest's favorited tracks,
 * re-fetching on mount/tab-activation and on the `favorites-update` SSE
 * event, with client-side sort + substring filter and an "Add to Queue"
 * action per row reusing SearchAndQueue's own handleAdd/rowStatus.
 */
function FavoritesSection({ subscribe, onAdd, rowStatus }: FavoritesSectionProps) {
  const { token } = useSession()
  const [outcome, setOutcome] = useState<FavoritesOutcome | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sort, setSort] = useState<FavoritesSort>('recent')
  const [filter, setFilter] = useState('')

  function fetchFavorites() {
    if (!token) return
    setIsLoading(true)
    getFavorites(token)
      .then((favorites) => {
        setOutcome({ favorites, errorMessage: null })
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Could not load favorites — check your connection and try again.'
        setOutcome({ favorites: null, errorMessage: message })
        setIsLoading(false)
      })
  }

  // Refetch whenever this tab becomes active — simplest way to keep it
  // fresh, cheap enough given favorites lists are small.
  useEffect(() => {
    fetchFavorites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    return subscribe('favorites-update', () => {
      fetchFavorites()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, token])

  const favorites = outcome?.favorites ?? []
  const trackIds = useMemo(() => favorites.map((f) => f.spotifyTrackId), [favorites])
  const { toggle } = useFavoritesStatus(trackIds, subscribe)

  const sortedFavorites = useMemo(() => {
    if (sort === 'recent') return favorites
    const copy = [...favorites]
    copy.sort((a, b) => {
      switch (sort) {
        case 'name-asc':
          return a.trackName.localeCompare(b.trackName)
        case 'name-desc':
          return b.trackName.localeCompare(a.trackName)
        case 'artist-asc':
          return a.artistName.localeCompare(b.artistName)
        case 'artist-desc':
          return b.artistName.localeCompare(a.artistName)
        default:
          return 0
      }
    })
    return copy
  }, [favorites, sort])

  const filteredFavorites = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (needle === '') return sortedFavorites
    return sortedFavorites.filter(
      (f) => f.trackName.toLowerCase().includes(needle) || f.artistName.toLowerCase().includes(needle)
    )
  }, [sortedFavorites, filter])

  function handleUnfavorite(favorite: FavoriteTrack) {
    // Optimistically remove the row from this list for instant feedback;
    // restore it if the unfavorite request fails. `toggle` itself already
    // handles the optimistic favorite-status flip and its own rollback —
    // this just keeps the *list* (a separate piece of state) in sync.
    setOutcome((prev) => {
      if (!prev?.favorites) return prev
      return { ...prev, favorites: prev.favorites.filter((f) => f.spotifyTrackId !== favorite.spotifyTrackId) }
    })

    toggle(favoriteToTrack(favorite))
  }

  if (!token) return null

  return (
    <>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 sm:flex-row">
        <input
          type="text"
          autoComplete="off"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter your favorites…"
          className="glass-inset h-11 w-full flex-1 rounded-md px-4 text-body text-text-primary placeholder:text-text-muted transition-fast focus:border-accent focus:outline-none"
        />
        <div className="sm:w-56">
          <Select
            options={FAVORITES_SORT_OPTIONS}
            value={sort}
            onChange={(e) => setSort(e.target.value as FavoritesSort)}
            aria-label="Sort favorites"
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <SearchSkeletonRow key={i} />
          ))}
        </div>
      )}

      {!isLoading && outcome?.errorMessage && (
        <div className="flex flex-col items-center gap-1 rounded-md border border-error-muted/60 bg-error-muted/70 backdrop-blur-md px-4 py-6 text-center">
          <p className="text-body text-error">Couldn&rsquo;t load favorites</p>
          <p className="text-caption text-text-secondary">{outcome.errorMessage}</p>
        </div>
      )}

      {!isLoading && !outcome?.errorMessage && favorites.length === 0 && (
        <div className="flex flex-col items-center gap-1 pt-10 text-center">
          <p className="text-body text-text-secondary">No favorites yet</p>
          <p className="text-caption text-text-muted">Tap the heart on any song to save it here.</p>
        </div>
      )}

      {!isLoading && !outcome?.errorMessage && favorites.length > 0 && filteredFavorites.length === 0 && (
        <div className="flex flex-col items-center gap-1 pt-10 text-center">
          <p className="text-body text-text-secondary">No favorites match your search.</p>
        </div>
      )}

      {!isLoading && !outcome?.errorMessage && filteredFavorites.length > 0 && (
        <div className="flex flex-col gap-2">
          {filteredFavorites.map((favorite) => (
            <SongCard
              key={favorite.spotifyTrackId}
              albumArtUrl={favorite.albumArtUrl}
              name={favorite.trackName}
              artist={favorite.artistName}
              durationMs={favorite.durationMs}
              favorite={{
                favoritedByMe: true,
                favoritedByAnyone: true,
                onToggle: () => handleUnfavorite(favorite),
              }}
              addToQueue={{
                status: rowStatus[favorite.spotifyTrackId] ?? 'idle',
                onAdd: () => onAdd(favoriteToTrack(favorite)),
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}
