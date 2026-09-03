import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { NowPlaying } from '../components/nowplaying/NowPlaying'
import { LyricsPanel } from '../components/nowplaying/LyricsPanel'
import { QueueList } from '../components/queue/QueueList'
import { SongInfoPanel } from '../components/artist/SongInfoPanel'
import type { RootLayoutContext } from '../components/RootLayout'

/**
 * Now Playing tab (P4.8, DESIGN_SPEC §9b) — the app's default/home screen.
 * At lg+, the Now Playing card (art/track info/progress plus playback
 * controls, all one card) forms a left column paired with the Up Next queue
 * as a right column, matching the desktop mockup; lyrics (when toggled)
 * render as their own full-width section below both columns rather than
 * nested inside the Now Playing card, and that same grouping — lyrics as a
 * standalone section — is kept at every breakpoint, not just desktop. Below
 * lg this still just stacks in reading order. The "about the song" panel
 * (artist info plus track-level stats) stays a lower-priority full-width
 * addition at the very bottom. No search box or leaderboard/history content
 * here — those live on their own tabs now.
 */
export function NowPlayingPage() {
  const { subscribe, refreshKey, onAlbumArtChange, artistId, onArtistIdChange } =
    useOutletContext<RootLayoutContext>()

  const [trackId, setTrackId] = useState<string | null>(null)
  const [progressMs, setProgressMs] = useState(0)
  const [showLyrics, setShowLyrics] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NowPlaying
          subscribe={subscribe}
          refreshKey={refreshKey}
          onAlbumArtChange={onAlbumArtChange}
          onArtistIdChange={onArtistIdChange}
          onTrackIdChange={setTrackId}
          onProgressChange={setProgressMs}
          showLyrics={showLyrics}
          onToggleLyrics={() => setShowLyrics((prev) => !prev)}
        />

        <QueueList subscribe={subscribe} refreshKey={refreshKey} />
      </div>

      {showLyrics && trackId && (
        <LyricsPanel key={trackId} trackId={trackId} subscribe={subscribe} progressMs={progressMs} />
      )}

      <SongInfoPanel trackId={trackId} artistId={artistId} subscribe={subscribe} />
    </div>
  )
}
