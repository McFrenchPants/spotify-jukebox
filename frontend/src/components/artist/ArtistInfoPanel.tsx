import { useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { getArtist, type ArtistInfo } from '../../lib/api'

export interface ArtistInfoPanelProps {
  /** Primary artist id of the current now-playing track, or null when nothing is playing. */
  artistId: string | null
}

/** The most recently *completed* fetch, keyed to the artistId it's for — `artist: null` covers both "still loading" (id mismatch) and "fetch failed" (silent, see below). */
interface FetchResult {
  id: string
  artist: ArtistInfo | null
}

/**
 * "About the artist" panel (P4.8, DESIGN_SPEC §9b) — a lower-priority
 * nice-to-have placed below Up Next on the Now Playing screen. Fetches
 * GET /api/artist/:id whenever `artistId` changes; skips the fetch entirely
 * when there's no artist to show. A fetch failure fails silently (renders
 * nothing) rather than showing an error, since this panel is decorative,
 * not core functionality — the guest can still see/queue/play music fine
 * without it.
 */
export function ArtistInfoPanel({ artistId }: ArtistInfoPanelProps) {
  // Loading state is derived by comparing `result.id` to the current
  // `artistId` (mirrors SearchAndQueue's `outcome` pattern) rather than
  // tracked as its own piece of state set synchronously inside the effect.
  const [result, setResult] = useState<FetchResult | null>(null)

  useEffect(() => {
    if (!artistId) return

    let cancelled = false
    getArtist(artistId)
      .then((data) => {
        if (!cancelled) setResult({ id: artistId, artist: data })
      })
      .catch(() => {
        // Silent fail — this panel is a nice-to-have, not core functionality.
        if (!cancelled) setResult({ id: artistId, artist: null })
      })

    return () => {
      cancelled = true
    }
  }, [artistId])

  if (!artistId) return null

  const loading = result?.id !== artistId

  if (loading) {
    return (
      <Card className="flex items-center gap-3">
        <Skeleton variant="circle" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton variant="line" className="w-1/2" />
          <Skeleton variant="line" className="w-1/3" />
        </div>
      </Card>
    )
  }

  const artist = result.artist
  if (!artist) return null

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">About the artist</p>

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
    </Card>
  )
}
