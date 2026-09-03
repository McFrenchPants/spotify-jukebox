import { useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { getArtist, getTrackPlayCount, type ArtistInfo } from '../../lib/api'
import { useFavoritesStatus } from '../../hooks/useFavoritesStatus'
import type { EventStream } from '../../hooks/useEventStream'

export interface SongInfoPanelProps {
  /** Currently-playing track id, or null when nothing is playing. */
  trackId: string | null
  /** Primary artist id of the current now-playing track, or null when nothing is playing. */
  artistId: string | null
  subscribe: EventStream['subscribe']
}

/** The most recently *completed* artist fetch, keyed to the artistId it's for — `artist: null` covers both "still loading" (id mismatch) and "fetch failed" (silent, see below). */
interface ArtistFetchResult {
  id: string
  artist: ArtistInfo | null
}

/**
 * "About the song" panel — a lower-priority nice-to-have placed below Up
 * Next on the Now Playing screen (formerly "About the artist"; broadened to
 * cover the whole track, not just its artist, once the Now Playing card
 * itself stopped showing this data inline — see BACKLOG.md items 14/29).
 * Shows play count and how many guests have favorited the track, plus the
 * artist's photo/name/follower count/genres. A fetch failure for either
 * half fails silently (that half just doesn't render) rather than showing
 * an error, since this panel is decorative, not core functionality — the
 * guest can still see/queue/play music fine without it.
 */
export function SongInfoPanel({ trackId, artistId, subscribe }: SongInfoPanelProps) {
  const [artistResult, setArtistResult] = useState<ArtistFetchResult | null>(null)
  const [playCount, setPlayCount] = useState<number | null>(null)

  useEffect(() => {
    if (!artistId) {
      setArtistResult(null)
      return
    }

    let cancelled = false
    getArtist(artistId)
      .then((data) => {
        if (!cancelled) setArtistResult({ id: artistId, artist: data })
      })
      .catch(() => {
        // Silent fail — this panel is a nice-to-have, not core functionality.
        if (!cancelled) setArtistResult({ id: artistId, artist: null })
      })

    return () => {
      cancelled = true
    }
  }, [artistId])

  useEffect(() => {
    if (!trackId) {
      setPlayCount(null)
      return
    }

    let cancelled = false
    getTrackPlayCount(trackId)
      .then((count) => {
        if (!cancelled) setPlayCount(count)
      })
      .catch(() => {
        // Leave null — the play-count line just stays hidden.
      })

    return () => {
      cancelled = true
    }
  }, [trackId])

  const favoritesTrackIds = trackId ? [trackId] : []
  const { status } = useFavoritesStatus(favoritesTrackIds, subscribe)
  const favoriteCount = trackId ? (status[trackId]?.favoriteCount ?? 0) : 0

  if (!trackId) return null

  const artistLoading = artistId != null && artistResult?.id !== artistId
  const artist = artistId != null && !artistLoading ? artistResult?.artist : null

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">About the song</p>

      {(playCount !== null || favoriteCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {playCount !== null && (
            <span className="inline-block rounded-full bg-surface-overlay px-3 py-1 text-caption text-text-secondary">
              Played {playCount} {playCount === 1 ? 'time' : 'times'}
            </span>
          )}
          {favoriteCount > 0 && (
            <span className="inline-block rounded-full bg-surface-overlay px-3 py-1 text-caption text-text-secondary">
              {favoriteCount} {favoriteCount === 1 ? 'favorite' : 'favorites'}
            </span>
          )}
        </div>
      )}

      {artistLoading && (
        <div className="flex items-center gap-3">
          <Skeleton variant="circle" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton variant="line" className="w-1/2" />
            <Skeleton variant="line" className="w-1/3" />
          </div>
        </div>
      )}

      {artist && (
        <>
          <div className="flex items-center gap-3">
            {artist.imageUrl ? (
              <img
                src={artist.imageUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full bg-surface-overlay object-cover"
              />
            ) : (
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-text-muted"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" />
                </svg>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold text-text-primary">{artist.name}</p>
              <p className="text-caption text-text-muted">{artist.followers.toLocaleString()} followers</p>
            </div>
          </div>

          {artist.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {artist.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-surface-overlay px-2.5 py-1 text-caption text-text-secondary"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
