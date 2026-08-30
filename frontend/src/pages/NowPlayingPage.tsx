import { useOutletContext } from 'react-router-dom'
import { NowPlaying } from '../components/nowplaying/NowPlaying'
import { PlaybackControls } from '../components/playback/PlaybackControls'
import { QueueList } from '../components/queue/QueueList'
import { ArtistInfoPanel } from '../components/artist/ArtistInfoPanel'
import type { RootLayoutContext } from '../components/RootLayout'

/**
 * Now Playing tab (P4.8, DESIGN_SPEC §9b) — the app's default/home screen.
 * Art/progress -> icon transport controls -> volume -> Up Next queue, with
 * the "about the artist" panel as a lower-priority addition below Up Next.
 * No search box or leaderboard/history content here — those live on their
 * own tabs now.
 */
export function NowPlayingPage() {
  const { subscribe, refreshKey, isPlaying, onIsPlayingChange, onAlbumArtChange, artistId, onArtistIdChange } =
    useOutletContext<RootLayoutContext>()

  return (
    <div className="flex flex-col gap-6">
      <NowPlaying
        subscribe={subscribe}
        refreshKey={refreshKey}
        onAlbumArtChange={onAlbumArtChange}
        onIsPlayingChange={onIsPlayingChange}
        onArtistIdChange={onArtistIdChange}
      />
      <PlaybackControls isPlaying={isPlaying} subscribe={subscribe} />
      <QueueList subscribe={subscribe} refreshKey={refreshKey} />
      <ArtistInfoPanel artistId={artistId} />
    </div>
  )
}
