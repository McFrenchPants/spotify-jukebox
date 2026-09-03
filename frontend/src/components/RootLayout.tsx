import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { AppShell } from './AppShell'
import { BottomNav } from './nav/BottomNav'
import { SideNav } from './nav/SideNav'
import { useEventStream, type EventStream } from '../hooks/useEventStream'
import { VolumeControl } from '../lib/volumeControlPlugin'
import { reportJukeboxVolume } from '../lib/api'
import { getOrCreateClientId } from '../lib/clientId'

/** Shared state/handlers threaded to every routed page via <Outlet context>. */
export interface RootLayoutContext {
  subscribe: EventStream['subscribe']
  /** Bumped by the manual-refresh fallback affordance to force a re-fetch. */
  refreshKey: number
  onAlbumArtChange: (albumArt: string | null) => void
  artistId: string | null
  onArtistIdChange: (id: string | null) => void
}

/**
 * Owns the single `useEventStream()` instance (only one EventSource may be
 * open at a time — see useEventStream's doc comment) plus the album-art /
 * artistId / refreshKey state that used to live in App.tsx.
 * Renders the persistent AppShell (background art + bottom nav) and hands
 * the shared bits down to whichever page is routed via Outlet context,
 * mirroring today's prop-drilling but across routes instead of components.
 */
export function RootLayout() {
  const { subscribe, isStale, reconnectedAt } = useEventStream()
  const [albumArt, setAlbumArt] = useState<string | null>(null)
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

  // Auto-refetch on a real SSE reconnect (connection genuinely dropped and
  // came back), even if it recovered too quickly to ever show the manual
  // "tap to refresh" banner below. reconnectedAt starts at 0 and only
  // changes on an actual reconnect (see useEventStream), so this never fires
  // on mount. Uses the same track-across-renders pattern as prevIsStale
  // above rather than a useEffect, so it's a no-op during the render caused
  // by its own setRefreshKey call.
  const [prevReconnectedAt, setPrevReconnectedAt] = useState(reconnectedAt)
  if (reconnectedAt !== prevReconnectedAt) {
    setPrevReconnectedAt(reconnectedAt)
    if (reconnectedAt !== 0) setRefreshKey((k) => k + 1)
  }

  // Master Device Mode: the backend broadcasts jukebox-volume-command to
  // every connected SSE client (no per-client filtering server-side — see
  // useEventStream.ts), including ordinary guest browser tabs. Only act on
  // it when this build is actually running as the native Jukebox device;
  // everyone else must ignore it.
  useEffect(() => {
    return subscribe('jukebox-volume-command', (data) => {
      if (!Capacitor.isNativePlatform()) return

      const command = data as { volumePercent?: number } | undefined
      if (typeof command?.volumePercent !== 'number') return

      VolumeControl.setVolume({ percent: command.volumePercent }).catch((error) => {
        console.error('Failed to apply jukebox-volume-command', error)
      })
    })
  }, [subscribe])

  // Master Device Mode: the native Jukebox device reports its own system
  // volume back to the backend so guest volume sliders can be seeded
  // accurately and kept in sync when the phone's volume changes out-of-band
  // (hardware buttons, Android's own volume UI). Only the native build does
  // this; everyone else must stay a no-op.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const reportVolume = () => {
      VolumeControl.getVolume()
        .then(({ percent }) => reportJukeboxVolume(getOrCreateClientId(), percent))
        .catch((error) => {
          console.error('Failed to report jukebox volume', error)
        })
    }

    reportVolume()

    // 5s: a middle ground between this app's 4s now-playing poll and its
    // ~12s device-status poll. The backend dedupes SSE emission when the
    // reported value hasn't changed, so no change-detection is needed here.
    const intervalId = setInterval(reportVolume, 5000)
    return () => clearInterval(intervalId)
  }, [])

  const showStaleBanner = isStale && !bannerDismissed

  const context: RootLayoutContext = {
    subscribe,
    refreshKey,
    onAlbumArtChange: setAlbumArt,
    artistId,
    onArtistIdChange: setArtistId,
  }

  return (
    <>
      <SideNav />
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
    </>
  )
}
