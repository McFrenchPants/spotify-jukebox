import { useOutletContext } from 'react-router-dom'
import { Leaderboard } from '../components/leaderboard/Leaderboard'
import { RecentlyPlayed } from '../components/recent/RecentlyPlayed'
import type { RootLayoutContext } from '../components/RootLayout'

/** Playback History tab (P4.8) — the existing P4.4 leaderboard + recently-played UI, moved here unchanged. */
export function HistoryPage() {
  const { subscribe, refreshKey } = useOutletContext<RootLayoutContext>()

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="lg:w-1/2">
        <Leaderboard subscribe={subscribe} refreshKey={refreshKey} />
      </div>
      <div className="lg:w-1/2">
        <RecentlyPlayed subscribe={subscribe} refreshKey={refreshKey} />
      </div>
    </div>
  )
}
