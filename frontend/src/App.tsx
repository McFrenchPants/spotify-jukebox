import { useCallback, useState } from 'react'
import { AppShell } from './components/AppShell'
import { SearchAndQueue } from './components/search/SearchAndQueue'
import { NowPlaying } from './components/nowplaying/NowPlaying'
import { QueueList } from './components/queue/QueueList'
import { useEventStream } from './hooks/useEventStream'

function App() {
  const { subscribe, isStale } = useEventStream()
  const [albumArt, setAlbumArt] = useState<string | null>(null)
  // Bumped to force NowPlaying/QueueList to re-fetch — used by the manual
  // "tap to refresh" fallback below, not a polling loop.
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

  return (
    <AppShell albumArtUrl={albumArt}>
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

        <NowPlaying subscribe={subscribe} refreshKey={refreshKey} onAlbumArtChange={setAlbumArt} />
        <QueueList subscribe={subscribe} refreshKey={refreshKey} />
        <SearchAndQueue />
      </div>
    </AppShell>
  )
}

export default App
