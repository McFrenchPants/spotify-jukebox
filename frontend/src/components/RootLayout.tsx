import { useCallback, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppShell } from './AppShell'
import { BottomNav } from './nav/BottomNav'
import { useEventStream, type EventStream } from '../hooks/useEventStream'

/** Shared state/handlers threaded to every routed page via <Outlet context>. */
export interface RootLayoutContext {
  subscribe: EventStream['subscribe']
  /** Bumped by the manual-refresh fallback affordance to force a re-fetch. */
  refreshKey: number
  isPlaying: boolean
  onIsPlayingChange: (isPlaying: boolean) => void
  onAlbumArtChange: (albumArt: string | null) => void
  artistId: string | null
  onArtistIdChange: (id: string | null) => void
}

/**
 * Owns the single `useEventStream()` instance (only one EventSource may be
 * open at a time — see useEventStream's doc comment) plus the album-art /
 * isPlaying / artistId / refreshKey state that used to live in App.tsx.
 * Renders the persistent AppShell (background art + bottom nav) and hands
 * the shared bits down to whichever page is routed via Outlet context,
 * mirroring today's prop-drilling but across routes instead of components.
 */
export function RootLayout() {
  const { subscribe, isStale } = useEventStream()
  const [albumArt, setAlbumArt] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [artistId, setArtistId] = useState<string | null>(null)
  // Bumped to force the now-playing/queue pages to re-fetch — used by the
  // manual "tap to refresh" fallback below, not a polling loop.
  const [refreshKey, setRefreshKey] = useState(0)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // Tracks isStale across renders (React's "adjust state during render"
  // pattern) so that once the connection recovers, the banner re-arms for a
  // *future* drop rather than staying permanently dismissed from an earlier
  // tap — without needing a setState-in-effect.
  const [prevIsStale, setPrevIsStale] = useState(isStale)
  if (isStale !== prevIsStale) {
    setPrevIsStale(isStale)
    if (!isStale) setBannerDismissed(false)
  }

  const handleManualRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
    setBannerDismissed(true)
  }, [])

  const showStaleBanner = isStale && !bannerDismissed

  const context: RootLayoutContext = {
    subscribe,
    refreshKey,
    isPlaying,
    onIsPlayingChange: setIsPlaying,
    onAlbumArtChange: setAlbumArt,
    artistId,
    onArtistIdChange: setArtistId,
  }

  return (
    <AppShell albumArtUrl={albumArt} bottomBar={<BottomNav />}>
      <div className="flex flex-col gap-6 pt-2">
        {showStaleBanner && (
          <button
            type="button"
            onClick={handleManualRefresh}
            className="self-center rounded-full border border-warning-muted bg-warning-muted px-3 py-1 text-caption text-warning transition-fast hover:opacity-90"
          >
            Live updates paused — tap to refresh
          </button>
        )}

        <Outlet context={context} />
      </div>
    </AppShell>
  )
}
